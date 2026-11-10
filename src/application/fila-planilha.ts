// Fila FIFO durável dos envios automáticos às planilhas: despacha a intenção escolar,
// reserva o item da frente com prazo e o entrega ao remetente, com retentativas e auditoria.
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
import type { Prisma } from "../../generated/prisma/client";
import { esquemaEscopoConferencia } from "@/application/fila-conferencia";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";
import {
  DIAS_GUARDAR_CONCLUIDOS,
  DIAS_GUARDAR_ENCERRADOS,
  PRAZO_RESERVA_MS,
  classeDoItem,
  desfechoDoItem,
  proximoDaFila,
  requerConferencia as resultadoExigeConferencia,
  resumirSituacoes,
  retrySeguro,
  type EstadoDaFila,
  type EstadoItemFila,
  type ResumoDoProcessamento,
  type TipoItemFila,
} from "@/domain/fila-planilha";
import { enviarAposSalvar } from "@/application/planilha";
import { lerLinha } from "@/application/planilha-comum";
import { enviarEntradasAposRegistro } from "@/application/planilha-entradas";
import { enviarSaidasAposRegistro } from "@/application/planilha-saidas";
import { destinoMovimentacao } from "@/application/planilha-movimentacoes-envios";
import { ABA_ENTRADAS } from "@/domain/planilha-entradas";

const LIMITE_PADRAO = 10;
const LIMITE_AGENDA = 50;
const ITENS_LISTADOS = 50;
// Inclui resultados legados ainda sem a marca persistida, sem inventar uma resolução.
const FILTRO_CONFERENCIA = {
  OR: [
    { requerConferencia: true },
    {
      resolvidoEm: null,
      resultado: {
        notIn: [
          "enviado",
          "desligado",
          "sem_trabalho",
          "falhou",
          "limite",
          "nao_processado",
          "falha_preparo",
        ],
      },
    },
  ],
};

interface DetalhesDoEnvio {
  versao: 1;
  tipo: TipoItemFila;
  dia: string;
  turmaId: string | null;
  iniciadoEm: string;
  completo: boolean;
  falhaPreparo?: string | null;
  escopos: { origemId: string | null; destino: string | null }[];
  resultados?: { origemId: string | null; situacao: string }[];
}

function abaDoEsquema(linha: { esquema: unknown }): string | null {
  if (!linha.esquema || typeof linha.esquema !== "object") return null;
  const candidato = linha.esquema as { aba?: unknown };
  return typeof candidato.aba === "string" ? candidato.aba : null;
}

/** Destino exato da movimentação no momento da tentativa, sem gravar dados da planilha. */
async function destinoDaMovimentacao(tipo: "SAIDAS" | "ENTRADAS"): Promise<string | null> {
  try {
    const linha = await lerLinha("SAIDAS");
    if (!linha.ativa || !linha.googlePlanilhaId) return null;
    const aba = tipo === "ENTRADAS" ? ABA_ENTRADAS : abaDoEsquema(linha);
    return aba ? destinoMovimentacao(linha, aba) : null;
  } catch {
    return null;
  }
}

async function executar(
  tipo: TipoItemFila,
  autorId: string,
  dia: string,
  turmaId: string | null,
): Promise<{ situacao: string; detalhes: DetalhesDoEnvio }> {
  const usuario = { id: autorId };
  const iniciadoEm = new Date().toISOString();
  const base = { versao: 1 as const, tipo, dia, turmaId, iniciadoEm };
  if (tipo === "SAIDAS" || tipo === "ENTRADAS") {
    const destino = await destinoDaMovimentacao(tipo);
    const situacao =
      tipo === "SAIDAS"
        ? await enviarSaidasAposRegistro(usuario, dia)
        : await enviarEntradasAposRegistro(usuario, dia);
    return {
      situacao,
      detalhes: {
        ...base,
        completo: situacao === "enviado",
        escopos: [{ origemId: null, destino }],
      },
    };
  }
  if (!turmaId)
    return {
      situacao: "sem_mapa",
      detalhes: {
        ...base,
        completo: false,
        escopos: [{ origemId: null, destino: null }],
      },
    };
  const resultado = await enviarAposSalvar(usuario, turmaId, dia);
  const valores = [...resultado.values()];
  let situacao: string;
  if (resultado.semTrabalho) situacao = "sem_trabalho";
  else if (resultado.falhaPreparo) {
    if (valores.includes("sem_confirmacao")) situacao = "sem_confirmacao";
    else if (valores.includes("nao_processado")) situacao = "nao_processado";
    else if (valores.length === 0) situacao = "falha_preparo";
    else situacao = resumirSituacoes(valores);
  } else situacao = resumirSituacoes(valores);
  return {
    situacao,
    detalhes: {
      ...base,
      completo: resultado.completo && !resultado.falhaPreparo,
      falhaPreparo: resultado.falhaPreparo,
      escopos: resultado.escopos,
      resultados: [...resultado].map(([origemId, valor]) => ({ origemId, situacao: valor })),
    },
  };
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

export async function processarFilaDaAgenda(): Promise<ResumoDoProcessamento> {
  await despacharIntencoesEscolares().catch(() =>
    console.error("Intenções escolares aguardam nova tentativa."),
  );
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
    const reservadoAte = new Date(agora.getTime() + PRAZO_RESERVA_MS);
    const reservado = await banco().filaPlanilha.updateMany({
      where: {
        id: item.id,
        tentativas: item.tentativas,
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
        reservadoAte,
        tentativas: { increment: 1 },
      },
    });
    // Outro consumidor reservou primeiro: a vez dele, não a nossa.
    if (reservado.count === 0) break;
    const tentativas = item.tentativas + 1;
    let situacao = "falhou";
    let erro: string | null = null;
    let detalhes: Awaited<ReturnType<typeof executar>>["detalhes"] | undefined;
    try {
      if (!item.autorId) situacao = "sem_autor";
      else {
        const resultado = await executar(
          item.tipo,
          item.autorId,
          item.dia.toISOString().slice(0, 10),
          item.turmaId,
        );
        situacao = resultado.situacao;
        detalhes = resultado.detalhes;
      }
    } catch (excecao) {
      situacao = "sem_confirmacao";
      erro = excecao instanceof Error ? excecao.name.slice(0, 120) : "Erro";
    }
    const fim = new Date();
    const desfecho = desfechoDoItem(situacao, tentativas, fim);
    const finalizado = await banco().filaPlanilha.updateMany({
      where: { id: item.id, estado: "EM_ANDAMENTO", tentativas, reservadoAte },
      data: {
        estado: desfecho.estado,
        resultado: desfecho.resultado,
        requerConferencia: desfecho.requerConferencia,
        ...(detalhes ? { detalhes: detalhes as unknown as Prisma.InputJsonValue } : {}),
        erro: desfecho.estado === "CONCLUIDO" ? null : erro,
        proximaTentativaEm: desfecho.proximaTentativaEm,
        reservadoAte: null,
        concluidoEm: desfecho.estado === "AGUARDANDO" ? null : fim,
      },
    });
    if (finalizado.count !== 1) break;
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
      NOT: FILTRO_CONFERENCIA,
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

/**
 * Contagens por estado e os itens ainda não enviados, na ordem de processamento, sem
 * nomes de alunos. Concluídos e descartados entram só nas contagens.
 */
export async function lerEstadoDaFila(): Promise<EstadoDaFila> {
  const [grupos, itens, conferenciasPendentes] = await Promise.all([
    banco().filaPlanilha.groupBy({ by: ["estado"], _count: { _all: true } }),
    banco().filaPlanilha.findMany({
      where: {
        OR: [{ estado: { in: ["AGUARDANDO", "EM_ANDAMENTO", "FALHOU"] } }, FILTRO_CONFERENCIA],
      },
      orderBy: { sequencia: "asc" },
      take: ITENS_LISTADOS,
    }),
    banco().filaPlanilha.count({ where: FILTRO_CONFERENCIA }),
  ]);
  const contagens: Record<EstadoItemFila, number> = {
    AGUARDANDO: 0,
    EM_ANDAMENTO: 0,
    CONCLUIDO: 0,
    FALHOU: 0,
    DESCARTADO: 0,
  };
  for (const grupo of grupos) contagens[grupo.estado] = grupo._count._all;
  const detalhesPorItem = itens.map((item) => esquemaEscopoConferencia.safeParse(item.detalhes));
  const ids = [
    ...new Set(
      itens
        .flatMap((item, indice) => {
          const detalhes = detalhesPorItem[indice];
          return [
            item.turmaId,
            ...(detalhes?.success ? detalhes.data.escopos.map((escopo) => escopo.origemId) : []),
          ];
        })
        .filter((id): id is string => !!id),
    ),
  ];
  const turmas = ids.length
    ? await banco().turma.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, serie: { select: { nome: true } } },
      })
    : [];
  const rotulos = new Map(turmas.map((turma) => [turma.id, `${turma.serie.nome} ${turma.nome}`]));
  return {
    contagens,
    conferenciasPendentes,
    itens: itens.map((item, indice) => {
      const detalhes = detalhesPorItem[indice];
      const escopos = (detalhes?.success ? detalhes.data.escopos : []).map((escopo) => ({
        origemId: escopo.origemId,
        origemRotulo: escopo.origemId ? (rotulos.get(escopo.origemId) ?? null) : null,
        destino: escopo.destino,
      }));
      const requer =
        item.requerConferencia || (!item.resolvidoEm && resultadoExigeConferencia(item.resultado));
      const seguro = retrySeguro(item.resultado);
      const podeReprocessar =
        item.estado === "FALHOU" || item.estado === "DESCARTADO"
          ? item.resultado === null || seguro
          : item.estado === "CONCLUIDO" && requer && seguro;
      return {
        id: item.id,
        classe: classeDoItem({ estado: item.estado, resultado: item.resultado }),
        escopos,
        tipo: item.tipo,
        estado: item.estado,
        dia: item.dia.toISOString().slice(0, 10),
        turmaRotulo: item.turmaId ? (rotulos.get(item.turmaId) ?? null) : null,
        tentativas: item.tentativas,
        resultado: item.resultado,
        requerConferencia: requer,
        podeReprocessar,
        podeResolver: requer && !seguro,
        falhaPreparo: detalhes?.success ? (detalhes.data.falhaPreparo ?? null) : null,
        erro: item.erro,
        criadoEm: item.criadoEm.toISOString(),
        proximaTentativaEm: item.proximaTentativaEm?.toISOString() ?? null,
      };
    }),
  };
}

/**
 * Devolve ao fim da fila um item com falha, descartado ou uma pendência segura.
 * Resultado de escrita incerta exige conferência antes de qualquer novo envio.
 */
export async function reenfileirarItem(usuario: { id: string }, id: string): Promise<void> {
  await comTransacao(async (tx) => {
    const item = await tx.filaPlanilha.findUnique({ where: { id } });
    if (!item) throw new ErroHttp("Item da fila não encontrado.", 404);
    if (item.estado !== "CONCLUIDO" && item.estado !== "FALHOU" && item.estado !== "DESCARTADO")
      throw new ErroHttp("Aguarde o item sair da fila antes de tentar novamente.", 409);
    const requer =
      item.requerConferencia || (!item.resolvidoEm && resultadoExigeConferencia(item.resultado));
    if (requer && !retrySeguro(item.resultado))
      throw new ErroHttp("Confira o resultado no mesmo destino antes de qualquer novo envio.", 409);
    if (!requer && item.estado !== "FALHOU" && item.estado !== "DESCARTADO") {
      throw new ErroHttp("Só itens com falha ou descartados podem voltar para a fila.", 409);
    }
    if (item.estado === "CONCLUIDO")
      await tx.filaPlanilha.update({
        where: { id, resolvidoEm: null },
        data: { requerConferencia: false, resolvidoEm: new Date() },
      });
    else await tx.filaPlanilha.delete({ where: { id } });
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
