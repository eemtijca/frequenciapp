// Fila genérica de trabalhos: intenção transacional, reserva com fencing,
// execução idempotente e desfecho no PostgreSQL. O transporte fica fora daqui.
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Trabalho } from "../../generated/prisma/client";
import { auditar } from "@/infra/auditoria";
import { banco, objetoDoBanco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp } from "@/infra/erros";
import { registrarTrabalhoProcessado } from "@/infra/metricas";
import {
  MAXIMO_TENTATIVAS_TRABALHO,
  PRAZO_HEARTBEAT_TRABALHO_MS,
  PRAZO_RESERVA_TRABALHO_MS,
  TIPOS_TRABALHO,
  desfechoDoTrabalho,
  destinoDaReservaVencida,
  podeCancelar,
  podeReenfileirar,
  podeResolver,
  serializarEscopo,
  type EstadoTrabalho,
  type ResultadoDoTrabalho,
  type TipoTrabalho,
} from "@/domain/trabalho";

const ESTADOS_ABERTOS: EstadoTrabalho[] = [
  "PENDENTE",
  "DISPONIVEL",
  "EM_EXECUCAO",
  "AGUARDANDO",
  "CONFERENCIA",
];
const LIMITE_PAYLOAD = 8 * 1024;

export interface PedidoDeTrabalho {
  tipo: TipoTrabalho;
  payload: unknown;
  prioridade?: number;
  disponivelEm?: Date;
  maxTentativas?: number;
  origem: "sistema" | "agenda" | "admin";
  autorId?: string | null;
}

export type PublicadorDeTrabalho = (trabalho: Trabalho) => Promise<void>;

export interface ContextoDoManipulador {
  trabalho: Trabalho;
  sinal: AbortSignal;
}

export type Manipulador = (contexto: ContextoDoManipulador) => Promise<ResultadoDoTrabalho>;

export type RegistroDeManipuladores = Partial<Record<TipoTrabalho, Manipulador>>;

export interface ResumoDoProcessamento {
  reivindicados: number;
  concluidos: number;
  reagendados: number;
  falhos: number;
  conferencia: number;
  restantes: number;
  proximoEm: string | null;
}

export interface TrabalhoResumo {
  id: string;
  tipo: TipoTrabalho;
  estado: EstadoTrabalho;
  prioridade: number;
  tentativas: number;
  maxTentativas: number;
  resultado: string | null;
  erroCodigo: string | null;
  erroResumo: string | null;
  erroDespacho: string | null;
  criadoEm: string;
  atualizadoEm: string;
  disponivelEm: string;
  concluidoEm: string | null;
}

export interface TrabalhoDetalhe extends TrabalhoResumo {
  payload: unknown;
  detalhes: unknown;
  eventos: {
    deEstado: EstadoTrabalho | null;
    paraEstado: EstadoTrabalho;
    tentativa: number;
    resultado: string | null;
    criadoEm: string;
  }[];
}

export interface FiltroDeTrabalhos {
  tipo?: TipoTrabalho;
  estado?: EstadoTrabalho;
  limite?: number;
  pagina?: number;
}

/** Chave estável por tipo e escopo canônico, sem dado pessoal. */
export function chaveDeTrabalho(tipo: TipoTrabalho, payload: unknown): string {
  return createHash("sha256")
    .update(`${tipo}:${serializarEscopo(payload)}`)
    .digest("hex");
}

function payloadNormalizado(payload: unknown): Prisma.InputJsonValue {
  const texto = serializarEscopo(payload);
  if (texto.length > LIMITE_PAYLOAD)
    throw new ErroHttp("O trabalho carrega dados demais para a fila.", 400);
  try {
    return JSON.parse(texto) as Prisma.InputJsonValue;
  } catch {
    throw new ErroHttp("O trabalho precisa de um conteúdo JSON válido.", 400);
  }
}

function tipoValido(tipo: string): tipo is TipoTrabalho {
  return (TIPOS_TRABALHO as readonly string[]).includes(tipo);
}

/**
 * Grava a intenção na mesma transação do chamador. Se já existe um trabalho
 * aberto com a mesma chave, devolve o existente sem criar outro.
 */
export async function enfileirarTrabalho(
  tx: Prisma.TransactionClient,
  pedido: PedidoDeTrabalho,
): Promise<string> {
  if (!tipoValido(pedido.tipo)) throw new ErroHttp("Tipo de trabalho inválido.", 400);
  const payload = payloadNormalizado(pedido.payload ?? {});
  const chaveIdempotencia = chaveDeTrabalho(pedido.tipo, payload);
  // Serializa apenas a mesma chave, sem abrir uma transação adicional.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${chaveIdempotencia}, 0))`;
  const existente = await tx.trabalho.findFirst({
    where: {
      tipo: pedido.tipo,
      chaveIdempotencia,
      estado: { in: ESTADOS_ABERTOS },
    },
    select: { id: true },
  });
  if (existente) return existente.id;
  const criado = await tx.trabalho.create({
    data: {
      tipo: pedido.tipo,
      chaveIdempotencia,
      payload,
      prioridade: pedido.prioridade ?? 100,
      disponivelEm: pedido.disponivelEm ?? new Date(),
      maxTentativas: pedido.maxTentativas ?? MAXIMO_TENTATIVAS_TRABALHO,
      origem: pedido.origem,
      autorId: pedido.autorId ?? null,
    },
    select: { id: true },
  });
  await tx.trabalhoEvento.create({
    data: {
      trabalhoId: criado.id,
      paraEstado: "PENDENTE",
      tentativa: 0,
      resultado: "criado",
    },
  });
  return criado.id;
}

/**
 * Publica os trabalhos pendentes e marca o despacho. A publicação acontece
 * antes da marcação; se a marcação falhar, o mesmo jobId deduplica no BullMQ.
 * Falha de transporte nunca encerra o trabalho: a intenção continua no
 * PostgreSQL e volta a ser publicada quando o Redis responder.
 */
export async function despacharTrabalhosPendentes(
  publicar: PublicadorDeTrabalho,
  limite = 20,
): Promise<number> {
  const agora = new Date();
  const pendentes = await banco().trabalho.findMany({
    where: {
      OR: [
        {
          estado: "PENDENTE",
          OR: [{ proximoDespachoEm: null }, { proximoDespachoEm: { lte: agora } }],
        },
        {
          estado: "AGUARDANDO",
          disponivelEm: { lte: agora },
          OR: [{ proximoDespachoEm: null }, { proximoDespachoEm: { lte: agora } }],
        },
      ],
    },
    orderBy: [{ prioridade: "asc" }, { criadoEm: "asc" }],
    take: limite,
  });
  let publicados = 0;
  for (const trabalho of pendentes) {
    try {
      await publicar(trabalho);
      await comTransacao(async (tx) => {
        const atualizado = await tx.trabalho.updateMany({
          where: { id: trabalho.id, estado: trabalho.estado },
          data: {
            estado: "DISPONIVEL",
            despachadoEm: new Date(),
            tentativasDespacho: 0,
            erroDespacho: null,
            proximoDespachoEm: null,
          },
        });
        if (atualizado.count === 1) {
          await tx.trabalhoEvento.create({
            data: {
              trabalhoId: trabalho.id,
              deEstado: trabalho.estado,
              paraEstado: "DISPONIVEL",
              tentativa: trabalho.tentativas,
              resultado: "despachado",
            },
          });
        }
      });
      publicados += 1;
    } catch (erro) {
      console.error(
        "[fila] falha ao publicar trabalho",
        erro instanceof Error ? erro.name : "erro",
      );
      const tentativas = trabalho.tentativasDespacho + 1;
      const atraso = Math.min(300_000, 30_000 * 2 ** Math.min(tentativas - 1, 4));
      await comTransacao(async (tx) => {
        const atualizado = await tx.trabalho.updateMany({
          where: {
            id: trabalho.id,
            estado: trabalho.estado,
            OR: [{ proximoDespachoEm: null }, { proximoDespachoEm: { lte: agora } }],
          },
          data: {
            tentativasDespacho: { increment: 1 },
            proximoDespachoEm: new Date(Date.now() + atraso),
            erroDespacho: "Falha temporária ao publicar o trabalho.",
          },
        });
        if (atualizado.count === 1) {
          await tx.trabalhoEvento.create({
            data: {
              trabalhoId: trabalho.id,
              deEstado: trabalho.estado,
              paraEstado: trabalho.estado,
              tentativa: trabalho.tentativas,
              resultado: "despacho_reagendado",
            },
          });
        }
      });
    }
  }
  return publicados;
}

/**
 * Retoma trabalhos cuja reserva venceu sem finalização. O fencing exige o
 * mesmo estado, a mesma reserva e o prazo ainda vencido; um heartbeat ou uma
 * nova reserva nunca é sobrescrito.
 */
export async function recuperarTrabalhosVencidos(limite = 50): Promise<number> {
  const agora = new Date();
  const vencidos = await banco().trabalho.findMany({
    where: { estado: "EM_EXECUCAO", reservadoAte: { lt: agora } },
    orderBy: { reservadoAte: "asc" },
    take: limite,
  });
  let recuperados = 0;
  for (const trabalho of vencidos) {
    const destino = destinoDaReservaVencida(trabalho.tipo);
    const seguro = destino === "AGUARDANDO";
    const conferencia = destino === "CONFERENCIA";
    const recuperado = await comTransacao(async (tx) => {
      const atualizado = await tx.trabalho.updateMany({
        where: {
          id: trabalho.id,
          estado: "EM_EXECUCAO",
          reservaId: trabalho.reservaId,
          reservadoAte: { lt: agora },
        },
        data: {
          estado: destino,
          resultado: "reserva_vencida",
          erroCodigo: "reserva_vencida",
          erroResumo: seguro
            ? "A reserva venceu; o trabalho voltou para a fila."
            : conferencia
              ? "A reserva venceu. Confira o destino antes de resolver."
              : "A reserva venceu e o tipo de trabalho não está registrado.",
          ...(seguro ? { disponivelEm: agora } : {}),
          proximoDespachoEm: null,
          erroDespacho: null,
          reservadoAte: null,
          reservadoPor: null,
          reservaId: null,
          concluidoEm: destino === "FALHOU" ? agora : null,
        },
      });
      if (atualizado.count !== 1) return false;
      await tx.trabalhoEvento.create({
        data: {
          trabalhoId: trabalho.id,
          deEstado: "EM_EXECUCAO",
          paraEstado: destino,
          tentativa: trabalho.tentativas,
          resultado: "reserva_vencida",
        },
      });
      return true;
    });
    if (recuperado) recuperados += 1;
  }
  return recuperados;
}

/** Reserva atômica do próximo trabalho disponível, sem dois consumidores. */
export async function reservarProximoTrabalho(workerId: string): Promise<Trabalho | null> {
  const linhas = await banco().$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH proximo AS (
      SELECT id
      FROM ${objetoDoBanco("trabalhos")}
      WHERE estado = 'DISPONIVEL' AND disponivel_em <= now()
      ORDER BY prioridade ASC, criado_em ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${objetoDoBanco("trabalhos")} AS t
    SET estado = 'EM_EXECUCAO',
        reservado_por = ${workerId},
        reserva_id = gen_random_uuid(),
        reservado_ate = now() + (${PRAZO_RESERVA_TRABALHO_MS} * interval '1 millisecond'),
        tentativas = t.tentativas + 1,
        atualizado_em = now()
    FROM proximo
    WHERE t.id = proximo.id
    RETURNING t.id
  `);
  const id = linhas[0]?.id;
  if (!id) return null;
  return banco().trabalho.findUnique({ where: { id } });
}

/** Estende a reserva sem permitir que um worker vencido recupere o direito. */
export async function estenderReservaDoTrabalho(
  trabalho: Trabalho,
  workerId: string,
): Promise<boolean> {
  if (!trabalho.reservaId) return false;
  const atualizado = await banco().trabalho.updateMany({
    where: {
      id: trabalho.id,
      estado: "EM_EXECUCAO",
      reservaId: trabalho.reservaId,
      reservadoPor: workerId,
      reservadoAte: { gt: new Date() },
    },
    data: {
      reservadoAte: new Date(Date.now() + PRAZO_RESERVA_TRABALHO_MS),
    },
  });
  return atualizado.count === 1;
}

async function finalizarTrabalho(
  trabalho: Trabalho,
  desfecho: ReturnType<typeof desfechoDoTrabalho>,
): Promise<boolean> {
  if (!trabalho.reservaId) return false;
  return comTransacao(async (tx) => {
    const atualizado = await tx.trabalho.updateMany({
      where: {
        id: trabalho.id,
        estado: "EM_EXECUCAO",
        reservaId: trabalho.reservaId,
        reservadoAte: { gt: new Date() },
      },
      data: {
        estado: desfecho.estado,
        resultado: desfecho.resultado,
        detalhes: (desfecho.detalhes ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        erroCodigo: desfecho.erroCodigo,
        erroResumo: desfecho.erroResumo,
        disponivelEm: desfecho.proximaTentativaEm ?? new Date(),
        reservadoAte: null,
        reservadoPor: null,
        reservaId: null,
        concluidoEm:
          desfecho.estado === "CONCLUIDO" || desfecho.estado === "FALHOU" ? new Date() : null,
      },
    });
    if (atualizado.count !== 1) return false;
    await tx.trabalhoEvento.create({
      data: {
        trabalhoId: trabalho.id,
        deEstado: "EM_EXECUCAO",
        paraEstado: desfecho.estado,
        tentativa: trabalho.tentativas,
        resultado: desfecho.resultado,
      },
    });
    return true;
  });
}

/**
 * Executa até o limite de trabalhos disponíveis. O heartbeat mantém a reserva
 * viva enquanto o manipulador roda; a finalização usa o mesmo fencing.
 */
export async function executarTrabalhos(
  manipuladores: RegistroDeManipuladores,
  opcoes: { limite: number; workerId: string; timeoutMs?: number },
): Promise<ResumoDoProcessamento> {
  const resumo: ResumoDoProcessamento = {
    reivindicados: 0,
    concluidos: 0,
    reagendados: 0,
    falhos: 0,
    conferencia: 0,
    restantes: 0,
    proximoEm: null,
  };
  for (let indice = 0; indice < Math.max(1, opcoes.limite); indice += 1) {
    const trabalho = await reservarProximoTrabalho(opcoes.workerId);
    if (!trabalho) break;
    resumo.reivindicados += 1;
    const controlador = new AbortController();
    const marcadorDeTimeout = Symbol("timeout");
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const estouro = new Promise<typeof marcadorDeTimeout>((resolver) => {
      temporizador = setTimeout(
        () => {
          controlador.abort();
          resolver(marcadorDeTimeout);
        },
        Math.max(1_000, opcoes.timeoutMs ?? 240_000),
      );
    });
    const heartbeat = setInterval(() => {
      void estenderReservaDoTrabalho(trabalho, opcoes.workerId).catch(() => undefined);
    }, PRAZO_HEARTBEAT_TRABALHO_MS);
    let resultado: ResultadoDoTrabalho;
    try {
      if (!tipoValido(trabalho.tipo)) {
        resultado = {
          situacao: "falhou",
          resultado: "tipo_desconhecido",
          erroCodigo: "tipo_desconhecido",
          erroResumo: "O tipo de trabalho não está registrado.",
        };
      } else {
        const manipulador = manipuladores[trabalho.tipo];
        if (!manipulador) {
          resultado = {
            situacao: "falhou",
            resultado: "tipo_desconhecido",
            erroCodigo: "tipo_desconhecido",
            erroResumo: "O tipo de trabalho não está registrado.",
          };
        } else {
          const execucao = manipulador({ trabalho, sinal: controlador.signal });
          // O manipulador pode terminar depois do timeout; a rejeição tardia
          // não pode derrubar o processo nem alterar o desfecho já registrado.
          void execucao.catch(() => undefined);
          const vencedor = await Promise.race([execucao, estouro]);
          resultado =
            vencedor === marcadorDeTimeout
              ? {
                  situacao: "conferencia",
                  resultado: "timeout",
                  erroCodigo: "timeout",
                  erroResumo:
                    "O trabalho excedeu o tempo máximo. Confira o destino antes de resolver.",
                }
              : vencedor;
        }
      }
    } catch (erro) {
      console.error(
        "[worker] falha inesperada ao executar trabalho",
        erro instanceof Error ? erro.name : "erro",
      );
      resultado = {
        situacao: "falhou",
        resultado: "falhou",
        erroCodigo: "excecao",
        erroResumo: "O trabalho terminou com erro inesperado.",
      };
    } finally {
      clearTimeout(temporizador);
      clearInterval(heartbeat);
    }

    const desfecho = desfechoDoTrabalho(resultado, {
      tentativasFeitas: trabalho.tentativas,
      maxTentativas: trabalho.maxTentativas,
      agora: new Date(),
    });
    const finalizado = await finalizarTrabalho(trabalho, desfecho);
    if (!finalizado) {
      console.warn(`Trabalho ${trabalho.id} perdeu a reserva antes de finalizar.`);
      break;
    }
    registrarTrabalhoProcessado(
      desfecho.estado === "CONCLUIDO"
        ? "concluido"
        : desfecho.estado === "AGUARDANDO"
          ? "reagendado"
          : desfecho.estado === "CONFERENCIA"
            ? "conferencia"
            : "falhou",
    );
    if (desfecho.estado === "CONCLUIDO") resumo.concluidos += 1;
    else if (desfecho.estado === "AGUARDANDO") resumo.reagendados += 1;
    else if (desfecho.estado === "CONFERENCIA") resumo.conferencia += 1;
    else resumo.falhos += 1;
  }
  resumo.restantes = await banco().trabalho.count({
    where: { estado: { in: ESTADOS_ABERTOS } },
  });
  const proximo = await banco().trabalho.findFirst({
    where: { estado: "AGUARDANDO" },
    orderBy: { disponivelEm: "asc" },
    select: { disponivelEm: true },
  });
  resumo.proximoEm = proximo?.disponivelEm.toISOString() ?? null;
  return resumo;
}

/** Resumo administrativo, sem payload e sem detalhes de execução. */
export type ContagensDeTrabalhos = Record<EstadoTrabalho, number>;

export async function listarTrabalhos(
  filtro: FiltroDeTrabalhos = {},
): Promise<{ itens: TrabalhoResumo[]; total: number; contagens: ContagensDeTrabalhos }> {
  const limite = Math.min(Math.max(filtro.limite ?? 50, 1), 100);
  const pagina = Math.max(filtro.pagina ?? 0, 0);
  const where: Prisma.TrabalhoWhereInput = {
    ...(filtro.tipo ? { tipo: filtro.tipo as string } : {}),
    ...(filtro.estado ? { estado: filtro.estado } : {}),
  };
  const contagens: ContagensDeTrabalhos = {
    PENDENTE: 0,
    DISPONIVEL: 0,
    EM_EXECUCAO: 0,
    AGUARDANDO: 0,
    CONCLUIDO: 0,
    FALHOU: 0,
    CONFERENCIA: 0,
    CANCELADO: 0,
  };
  const [total, linhas, grupos] = await Promise.all([
    banco().trabalho.count({ where }),
    banco().trabalho.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      skip: pagina * limite,
      take: limite,
    }),
    banco().trabalho.groupBy({
      by: ["estado"],
      where: {
        ...(filtro.tipo ? { tipo: filtro.tipo as string } : {}),
        ...(filtro.estado ? { estado: filtro.estado } : {}),
      },
      _count: { _all: true },
    }),
  ]);
  for (const grupo of grupos) contagens[grupo.estado] = grupo._count._all;
  return { total, contagens, itens: linhas.map(resumirTrabalho) };
}

function resumirTrabalho(trabalho: Trabalho): TrabalhoResumo {
  return {
    id: trabalho.id,
    tipo: trabalho.tipo as TipoTrabalho,
    estado: trabalho.estado,
    prioridade: trabalho.prioridade,
    tentativas: trabalho.tentativas,
    maxTentativas: trabalho.maxTentativas,
    resultado: trabalho.resultado,
    erroCodigo: trabalho.erroCodigo,
    erroResumo: trabalho.erroResumo,
    erroDespacho: trabalho.erroDespacho,
    criadoEm: trabalho.criadoEm.toISOString(),
    atualizadoEm: trabalho.atualizadoEm.toISOString(),
    disponivelEm: trabalho.disponivelEm.toISOString(),
    concluidoEm: trabalho.concluidoEm?.toISOString() ?? null,
  };
}

export async function lerTrabalho(id: string): Promise<TrabalhoDetalhe | null> {
  const trabalho = await banco().trabalho.findUnique({
    where: { id },
    include: { eventos: { orderBy: { criadoEm: "asc" } } },
  });
  if (!trabalho) return null;
  return {
    ...resumirTrabalho(trabalho),
    payload: trabalho.payload,
    detalhes: trabalho.detalhes,
    eventos: trabalho.eventos.map((evento) => ({
      deEstado: evento.deEstado,
      paraEstado: evento.paraEstado,
      tentativa: evento.tentativa,
      resultado: evento.resultado,
      criadoEm: evento.criadoEm.toISOString(),
    })),
  };
}

export async function cancelarTrabalho(id: string, autorId: string | null): Promise<void> {
  await comTransacao(async (tx) => {
    const trabalho = await tx.trabalho.findUnique({
      where: { id },
      select: { id: true, tipo: true, estado: true },
    });
    if (!trabalho) throw new ErroHttp("Trabalho não encontrado.", 404);
    if (!podeCancelar(trabalho.estado))
      throw new ErroHttp("Este trabalho já começou ou terminou e não pode ser cancelado.", 409);
    await tx.trabalho.update({
      where: { id },
      data: {
        estado: "CANCELADO",
        reservadoAte: null,
        reservadoPor: null,
        reservaId: null,
        concluidoEm: new Date(),
      },
    });
    await tx.trabalhoEvento.create({
      data: {
        trabalhoId: id,
        deEstado: trabalho.estado,
        paraEstado: "CANCELADO",
        tentativa: 0,
        resultado: "cancelado",
      },
    });
    await auditar(tx, autorId, "trabalho.cancelar", trabalho.tipo);
  });
}

export async function reenfileirarTrabalho(id: string, autorId: string | null): Promise<void> {
  await comTransacao(async (tx) => {
    const trabalho = await tx.trabalho.findUnique({
      where: { id },
      select: { id: true, tipo: true, estado: true },
    });
    if (!trabalho) throw new ErroHttp("Trabalho não encontrado.", 404);
    if (!podeReenfileirar(trabalho.estado))
      throw new ErroHttp("Só trabalhos com falha ou cancelados podem ser reenfileirados.", 409);
    await tx.trabalho.update({
      where: { id },
      data: {
        estado: "PENDENTE",
        tentativas: 0,
        disponivelEm: new Date(),
        reservadoAte: null,
        reservadoPor: null,
        reservaId: null,
        resultado: null,
        detalhes: Prisma.JsonNull,
        erroCodigo: null,
        erroResumo: null,
        despachadoEm: null,
        tentativasDespacho: 0,
        proximoDespachoEm: null,
        erroDespacho: null,
        concluidoEm: null,
      },
    });
    await tx.trabalhoEvento.create({
      data: {
        trabalhoId: id,
        deEstado: trabalho.estado,
        paraEstado: "PENDENTE",
        tentativa: 0,
        resultado: "reenfileirado",
      },
    });
    await auditar(tx, autorId, "trabalho.reenfileirar", trabalho.tipo);
  });
}

export type DecisaoDeResolucao = "concluido" | "falhou";

/**
 * Encerra uma conferência por decisão explícita da administração. Não repete
 * o efeito externo: apenas registra o resultado e libera a chave de idempotência.
 */
export async function resolverTrabalho(
  id: string,
  autorId: string | null,
  decisao: DecisaoDeResolucao,
): Promise<void> {
  await comTransacao(async (tx) => {
    const trabalho = await tx.trabalho.findUnique({
      where: { id },
      select: { id: true, tipo: true, estado: true },
    });
    if (!trabalho) throw new ErroHttp("Trabalho não encontrado.", 404);
    if (!podeResolver(trabalho.estado))
      throw new ErroHttp("Este trabalho não está em conferência.", 409);
    const concluido = decisao === "concluido";
    const atualizado = await tx.trabalho.updateMany({
      where: { id, estado: "CONFERENCIA" },
      data: {
        estado: concluido ? "CONCLUIDO" : "FALHOU",
        resultado: concluido ? "resolvido" : "resolvido_sem_sucesso",
        erroCodigo: concluido ? null : "resolvido_sem_sucesso",
        erroResumo: concluido ? null : "A conferência foi encerrada sem sucesso.",
        disponivelEm: new Date(),
        reservadoAte: null,
        reservadoPor: null,
        reservaId: null,
        concluidoEm: new Date(),
      },
    });
    if (atualizado.count !== 1)
      throw new ErroHttp("A conferência mudou. Recarregue a fila antes de resolver.", 409);
    await tx.trabalhoEvento.create({
      data: {
        trabalhoId: id,
        deEstado: "CONFERENCIA",
        paraEstado: concluido ? "CONCLUIDO" : "FALHOU",
        tentativa: 0,
        resultado: decisao,
      },
    });
    await auditar(tx, autorId, "trabalho.resolver", `${trabalho.tipo}:${decisao}`);
  });
}

/** Gera um identificador de worker estável para logs e fencing. */
export function identificadorDoWorker(): string {
  return `${process.env.HOSTNAME ?? "worker"}:${process.pid}:${randomUUID().slice(0, 8)}`;
}
