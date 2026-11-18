// Registro Prometheus do processo: métricas padrão do Node, identificação
// da versão e observação das requisições HTTP.
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";
import { COMMIT, VERSAO } from "@/infra/versao";

const globalComMetricas = globalThis as unknown as {
  __frequenciappMetricas?: Metricas;
};

export interface Metricas {
  registro: Registry;
  requisicoes: Counter<"method" | "route" | "status">;
  duracao: Histogram<"method" | "route">;
  emAndamento: Gauge;
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

  return { registro, requisicoes, duracao, emAndamento };
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

/** Registro exposto para a coleta do endpoint, criado na importação. */
export const registro = metricas().registro;

export const contentType = registro.contentType;
