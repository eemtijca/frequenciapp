// Registro Prometheus do processo: métricas padrão do Node, identificação
// da versão e observação das requisições HTTP.
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";
import type { ResumoDoProcessamento } from "@/domain/fila-planilha";
import { COMMIT, VERSAO } from "@/infra/versao";

const globalComMetricas = globalThis as unknown as {
  __frequenciappMetricas?: Metricas;
};

export type ResultadoDeFrequencia = "salvo" | "conflito";
export type ResultadoDaFila = "concluido" | "falha";
export type ResultadoDeNotificacao = "enviada" | "expirada" | "falha" | "ignorada";

/** Totais devolvidos pela agenda de notificações. */
export interface TotaisDeNotificacoes {
  enviadas: number;
  expiradas: number;
  falhas: number;
  ignoradas: number;
}

export interface Metricas {
  registro: Registry;
  requisicoes: Counter<"method" | "route" | "status">;
  duracao: Histogram<"method" | "route">;
  emAndamento: Gauge;
  frequenciasSalvas: Counter<"resultado">;
  filaPlanilhaProcessados: Counter<"resultado">;
  notificacoesEnviadas: Counter<"resultado">;
  trabalhosProcessados: Counter<"resultado">;
  bullmqJobs: Gauge<"fila" | "estado">;
}

function criarMetricas(): Metricas {
  // Registro próprio para não compartilhar estado com o registro global do cliente.
  const registro = new Registry();
  collectDefaultMetrics({ register: registro });

  new Gauge({
    name: "frequenciapp_build_info",
    help: "Versão e revisão em execução.",
    labelNames: ["version", "revision"] as const,
    registers: [registro],
  }).set({ version: VERSAO, revision: COMMIT }, 1);

  const requisicoes = new Counter({
    name: "frequenciapp_http_requests_total",
    help: "Requisições HTTP concluídas por método, rota e status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [registro],
  });

  const duracao = new Histogram({
    name: "frequenciapp_http_request_duration_seconds",
    help: "Duração das requisições HTTP em segundos.",
    labelNames: ["method", "route"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
    registers: [registro],
  });

  const emAndamento = new Gauge({
    name: "frequenciapp_http_requests_in_flight",
    help: "Requisições HTTP em andamento.",
    registers: [registro],
  });

  const frequenciasSalvas = new Counter({
    name: "frequenciapp_frequencias_salvas_total",
    help: "Salvamentos de frequência por resultado.",
    labelNames: ["resultado"] as const,
    registers: [registro],
  });

  const filaPlanilhaProcessados = new Counter({
    name: "frequenciapp_fila_planilha_processados_total",
    help: "Itens processados da fila de planilhas por resultado.",
    labelNames: ["resultado"] as const,
    registers: [registro],
  });

  const notificacoesEnviadas = new Counter({
    name: "frequenciapp_notificacoes_enviadas_total",
    help: "Avisos da agenda por resultado.",
    labelNames: ["resultado"] as const,
    registers: [registro],
  });

  const trabalhosProcessados = new Counter({
    name: "frequenciapp_trabalhos_processados_total",
    help: "Trabalhos genéricos processados por resultado.",
    labelNames: ["resultado"] as const,
    registers: [registro],
  });

  const bullmqJobs = new Gauge({
    name: "frequenciapp_bullmq_jobs",
    help: "Jobs do BullMQ por fila e estado.",
    labelNames: ["fila", "estado"] as const,
    registers: [registro],
  });

  return {
    registro,
    requisicoes,
    duracao,
    emAndamento,
    frequenciasSalvas,
    filaPlanilhaProcessados,
    notificacoesEnviadas,
    trabalhosProcessados,
    bullmqJobs,
  };
}

/** Registro único por processo, preservado no recarregamento do desenvolvimento. */
export function metricas(): Metricas {
  globalComMetricas.__frequenciappMetricas ??= criarMetricas();
  return globalComMetricas.__frequenciappMetricas;
}

/** Prepara os coletores na partida do processo Node. */
export function inicializarMetricas(): void {
  metricas();
}

/** Soma uma requisição ao gauge de concorrência sem derrubar a rota. */
export function requisicaoIniciada(): void {
  try {
    metricas().emAndamento.inc();
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Devolve ao zero a requisição contabilizada, mesmo em erro. */
export function requisicaoFinalizada(): void {
  try {
    metricas().emAndamento.dec();
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Registra status e duração de uma requisição HTTP concluída. */
export function observarRequisicao(
  contexto: { method: string; route: string },
  status: number,
  duracaoSegundos: number,
): void {
  try {
    const { requisicoes, duracao } = metricas();
    requisicoes.inc({
      method: contexto.method,
      route: contexto.route,
      status: String(status),
    });
    duracao.observe({ method: contexto.method, route: contexto.route }, duracaoSegundos);
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Conta o desfecho de um salvamento de frequência sem derrubar a rota. */
export function registrarFrequencia(resultado: ResultadoDeFrequencia): void {
  try {
    metricas().frequenciasSalvas.inc({ resultado });
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Soma ao contador os concluídos e as falhas do resumo da fila de planilhas. */
export function registrarFilaProcessada(
  resumo: Pick<ResumoDoProcessamento, "concluidos" | "falhas">,
): void {
  try {
    const { filaPlanilhaProcessados } = metricas();
    if (resumo.concluidos > 0) {
      filaPlanilhaProcessados.inc({ resultado: "concluido" }, resumo.concluidos);
    }
    if (resumo.falhas > 0) {
      filaPlanilhaProcessados.inc({ resultado: "falha" }, resumo.falhas);
    }
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Soma ao contador os avisos enviados, expirados, com falha e ignorados. */
export function registrarNotificacoes(totais: TotaisDeNotificacoes): void {
  try {
    const { notificacoesEnviadas } = metricas();
    const resultados: [ResultadoDeNotificacao, number][] = [
      ["enviada", totais.enviadas],
      ["expirada", totais.expiradas],
      ["falha", totais.falhas],
      ["ignorada", totais.ignoradas],
    ];
    for (const [resultado, valor] of resultados) {
      if (Number.isFinite(valor) && valor > 0) {
        notificacoesEnviadas.inc({ resultado }, valor);
      }
    }
  } catch {
    // Métrica nunca derruba a rota.
  }
}

/** Conta o desfecho de um trabalho genérico sem derrubar o worker. */
export function registrarTrabalhoProcessado(resultado: string): void {
  try {
    metricas().trabalhosProcessados.inc({ resultado });
  } catch {
    // Métrica nunca derruba o worker.
  }
}

/** Atualiza as contagens do BullMQ por fila e estado. */
export function atualizarContagensBullmq(fila: string, contagens: Record<string, number>): void {
  try {
    const gauge = metricas().bullmqJobs;
    for (const [estado, valor] of Object.entries(contagens)) {
      if (Number.isFinite(valor)) gauge.set({ fila, estado }, valor);
    }
  } catch {
    // Métrica nunca derruba o worker.
  }
}

/** Registro exposto para a coleta do endpoint, criado na importação. */
export const registro = metricas().registro;

export const contentType = registro.contentType;
