// Fila FIFO durável dos envios automáticos às planilhas: enfileira ao registrar, reserva o
// item da frente com prazo e o entrega ao remetente existente, com retentativas e auditoria.
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";
import {
  DIAS_GUARDAR_CONCLUIDOS,
  DIAS_GUARDAR_ENCERRADOS,
  PRAZO_RESERVA_MS,
  desfechoDoItem,
  proximoDaFila,
  resumirSituacoes,
  type EstadoDaFila,
  type EstadoItemFila,
  type ResumoDoProcessamento,
  type TipoItemFila,
} from "@/domain/fila-planilha";
import { enviarAposSalvar } from "@/application/planilha";
import { lerLinha, modoCompletoAtivo } from "@/application/planilha-comum";
import { enviarEntradasAposRegistro } from "@/application/planilha-entradas";
import { enviarSaidasAposRegistro } from "@/application/planilha-saidas";

const MEIO_DIA = "T12:00:00Z";
const LIMITE_PADRAO = 10;
const LIMITE_AGENDA = 50;
const ITENS_LISTADOS = 50;

export interface DadosDoEnvio {
  autorId: string;
  dia: string;
  turmaId?: string | null;
}

function diaDoBanco(dia: string): Date {
  return new Date(`${dia}${MEIO_DIA}`);
}

/**
 * Coloca um envio no fim da fila. Já existindo um igual aguardando a vez, mantém o mais
 * antigo, porque o envio lê o estado atual do aplicativo. Nunca lança: o registro que
 * originou o envio já foi confirmado.
 */
export async function enfileirar(tipo: TipoItemFila, dados: DadosDoEnvio): Promise<void> {
  try {
    const turmaId = dados.turmaId ?? null;
    const dia = diaDoBanco(dados.dia);
    await comTransacao(async (tx) => {
      const igual = await tx.filaPlanilha.findFirst({
        where: { tipo, turmaId, dia, estado: "AGUARDANDO" },
        select: { id: true },
      });
      if (igual) return;
      await tx.filaPlanilha.create({ data: { tipo, turmaId, dia, autorId: dados.autorId } });
    });
  } catch (erro) {
    console.error("Item não colocado na fila de envios.", erro instanceof Error ? erro.name : "");
  }
}

/**
 * Enfileira só quando o envio automático da finalidade está ligado, para escolas sem
 * integração não acumularem itens inúteis. Devolve se algum item entrou na fila.
 */
export async function enfileirarSeLigado(
  tipo: TipoItemFila,
  dados: DadosDoEnvio,
): Promise<boolean> {
  try {
    const linha = await lerLinha(tipo === "FREQUENCIA" ? "FREQUENCIA" : "SAIDAS");
    if (!linha.ativa || !linha.envioAutomatico || modoCompletoAtivo(linha)) return false;
  } catch {
    return false;
  }
  await enfileirar(tipo, dados);
  return true;
}

async function executar(tipo: TipoItemFila, autorId: string, dia: string, turmaId: string | null) {
  const usuario = { id: autorId };
  if (tipo === "SAIDAS") return enviarSaidasAposRegistro(usuario, dia);
  if (tipo === "ENTRADAS") return enviarEntradasAposRegistro(usuario, dia);
  if (!turmaId) return "desligado";
  const situacoes = await enviarAposSalvar(usuario, turmaId, dia);
  return resumirSituacoes([...situacoes.values()]);
}

let emProcessamento: Promise<ResumoDoProcessamento> | null = null;
let novaRodada = false;

/**
 * Processa os itens da frente, um por vez e na ordem de entrada, até esvaziar a fila, ser
 * barrada por espera ou reserva, ou atingir o limite. Várias chamadas no mesmo processo
 * se fundem em uma rodada; entre instâncias, a reserva com prazo garante um consumidor.
 */
export function processarFila(opcoes: { limite?: number } = {}): Promise<ResumoDoProcessamento> {
  if (emProcessamento) {
    novaRodada = true;
    return emProcessamento;
  }
  const rodada = (async () => {
    let resumo = await processarRodada(opcoes.limite ?? LIMITE_PADRAO);
    while (novaRodada) {
      novaRodada = false;
      resumo = await processarRodada(opcoes.limite ?? LIMITE_PADRAO);
    }
    return resumo;
  })().finally(() => {
    emProcessamento = null;
    novaRodada = false;
  });
  emProcessamento = rodada;
  return rodada;
}

export function processarFilaDaAgenda(): Promise<ResumoDoProcessamento> {
  return processarFila({ limite: LIMITE_AGENDA });
}

async function processarRodada(limite: number): Promise<ResumoDoProcessamento> {
  const resumo: ResumoDoProcessamento = {
    processados: 0,
    concluidos: 0,
    falhas: 0,
    abertos: 0,
    aguardandoAte: null,
  };
  while (resumo.processados < limite) {
    const agora = new Date();
    const frente = await banco().filaPlanilha.findMany({
      where: { estado: { in: ["AGUARDANDO", "EM_ANDAMENTO"] } },
      orderBy: { sequencia: "asc" },
      take: 1,
    });
    const decisao = proximoDaFila(frente, agora);
    if (decisao.acao === "aguardar") {
      resumo.aguardandoAte = decisao.ate?.toISOString() ?? null;
      break;
    }
    if (decisao.acao === "vazia") break;
    const item = decisao.item;
    const reservado = await banco().filaPlanilha.updateMany({
      where: {
        id: item.id,
        OR: [
          {
            estado: "AGUARDANDO",
            OR: [{ proximaTentativaEm: null }, { proximaTentativaEm: { lte: agora } }],
          },
          { estado: "EM_ANDAMENTO", reservadoAte: { lte: agora } },
        ],
      },
      data: {
        estado: "EM_ANDAMENTO",
        reservadoAte: new Date(agora.getTime() + PRAZO_RESERVA_MS),
        tentativas: { increment: 1 },
      },
    });
    // Outro consumidor reservou primeiro: a vez dele, não a nossa.
    if (reservado.count === 0) break;
    const tentativas = item.tentativas + 1;
    let situacao = "falhou";
    let erro: string | null = null;
    try {
      if (!item.autorId) situacao = "sem_autor";
      else
        situacao = await executar(
          item.tipo,
          item.autorId,
          item.dia.toISOString().slice(0, 10),
          item.turmaId,
        );
    } catch (excecao) {
      erro = excecao instanceof Error ? excecao.name.slice(0, 120) : "Erro";
    }
    const fim = new Date();
    const desfecho = desfechoDoItem(situacao, tentativas, fim);
    await banco().filaPlanilha.updateMany({
      where: { id: item.id, estado: "EM_ANDAMENTO" },
      data: {
        estado: desfecho.estado,
        resultado: desfecho.resultado,
        erro: desfecho.estado === "CONCLUIDO" ? null : erro,
        proximaTentativaEm: desfecho.proximaTentativaEm,
        reservadoAte: null,
        concluidoEm: desfecho.estado === "AGUARDANDO" ? null : fim,
      },
    });
    resumo.processados += 1;
    if (desfecho.estado === "CONCLUIDO") resumo.concluidos += 1;
    else resumo.falhas += 1;
    // Nova tentativa agendada: a vez da fila só volta depois da espera.
    if (desfecho.estado === "AGUARDANDO") {
      resumo.aguardandoAte = desfecho.proximaTentativaEm?.toISOString() ?? null;
      break;
    }
  }
  resumo.abertos = await banco().filaPlanilha.count({
    where: { estado: { in: ["AGUARDANDO", "EM_ANDAMENTO"] } },
  });
  await limparAntigos().catch(() => undefined);
  return resumo;
}

async function limparAntigos(): Promise<void> {
  const dia = 86_400_000;
  const agora = Date.now();
  await banco().filaPlanilha.deleteMany({
    where: {
      OR: [
        {
          estado: "CONCLUIDO",
          concluidoEm: { lt: new Date(agora - DIAS_GUARDAR_CONCLUIDOS * dia) },
        },
        {
          estado: { in: ["FALHOU", "DESCARTADO"] },
          atualizadoEm: { lt: new Date(agora - DIAS_GUARDAR_ENCERRADOS * dia) },
        },
      ],
    },
  });
}

/** Contagens por estado e os itens mais recentes, sem nomes de alunos. */
export async function lerEstadoDaFila(): Promise<EstadoDaFila> {
  const [grupos, itens] = await Promise.all([
    banco().filaPlanilha.groupBy({ by: ["estado"], _count: { _all: true } }),
    banco().filaPlanilha.findMany({ orderBy: { sequencia: "desc" }, take: ITENS_LISTADOS }),
  ]);
  const contagens: Record<EstadoItemFila, number> = {
    AGUARDANDO: 0,
    EM_ANDAMENTO: 0,
    CONCLUIDO: 0,
    FALHOU: 0,
    DESCARTADO: 0,
  };
  for (const grupo of grupos) contagens[grupo.estado] = grupo._count._all;
  const ids = [...new Set(itens.map((item) => item.turmaId).filter((id): id is string => !!id))];
  const turmas = ids.length
    ? await banco().turma.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, serie: { select: { nome: true } } },
      })
    : [];
  const rotulos = new Map(turmas.map((turma) => [turma.id, `${turma.serie.nome} ${turma.nome}`]));
  return {
    contagens,
    itens: itens.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      estado: item.estado,
      dia: item.dia.toISOString().slice(0, 10),
      turmaRotulo: item.turmaId ? (rotulos.get(item.turmaId) ?? null) : null,
      tentativas: item.tentativas,
      resultado: item.resultado,
      erro: item.erro,
      criadoEm: item.criadoEm.toISOString(),
      proximaTentativaEm: item.proximaTentativaEm?.toISOString() ?? null,
    })),
  };
}

/** Devolve ao fim da fila um item com falha ou descartado, com tentativas zeradas. */
export async function reenfileirarItem(usuario: { id: string }, id: string): Promise<void> {
  await comTransacao(async (tx) => {
    const item = await tx.filaPlanilha.findUnique({ where: { id } });
    if (!item) throw new ErroHttp("Item da fila não encontrado.", 404);
    if (item.estado !== "FALHOU" && item.estado !== "DESCARTADO") {
      throw new ErroHttp("Só itens com falha ou descartados podem voltar para a fila.", 409);
    }
    await tx.filaPlanilha.delete({ where: { id } });
    await tx.filaPlanilha.create({
      data: { tipo: item.tipo, turmaId: item.turmaId, dia: item.dia, autorId: usuario.id },
    });
    await auditar(tx, usuario.id, "fila_planilha.reenfileirar", item.tipo);
  });
}

/** Tira da fila um item que ainda não começou, sem apagá-lo do histórico. */
export async function descartarItem(usuario: { id: string }, id: string): Promise<void> {
  await comTransacao(async (tx) => {
    const item = await tx.filaPlanilha.findUnique({
      where: { id },
      select: { tipo: true, estado: true },
    });
    if (!item) throw new ErroHttp("Item da fila não encontrado.", 404);
    if (item.estado !== "AGUARDANDO") {
      throw new ErroHttp("Só itens que aguardam a vez podem ser descartados.", 409);
    }
    await tx.filaPlanilha.update({
      where: { id },
      data: { estado: "DESCARTADO", concluidoEm: new Date(), proximaTentativaEm: null },
    });
    await auditar(tx, usuario.id, "fila_planilha.descartar", item.tipo);
  });
}
