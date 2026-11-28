// Regras puras da fila genérica de trabalhos: estados, esperas e desfechos.
// Não conhece Prisma, Redis nem BullMQ.

export const MAXIMO_TENTATIVAS_TRABALHO = 5;
/** Esperas depois da 1ª, 2ª, 3ª e 4ª falhas; a última vale para as seguintes. */
export const ESPERAS_TRABALHO_MS = [30_000, 120_000, 600_000, 1_800_000] as const;
/** Prazo inicial da reserva de um trabalho em execução. */
export const PRAZO_RESERVA_TRABALHO_MS = 10 * 60_000;
/** Intervalo do heartbeat que estende a reserva durante a execução. */
export const PRAZO_HEARTBEAT_TRABALHO_MS = 60_000;

export const TIPOS_TRABALHO = [
  "INDICADORES_ATUALIZAR",
  "PLANILHA_MENSAL_PREPARAR",
  "EXPURGO_TRABALHOS",
] as const;

export type TipoTrabalho = (typeof TIPOS_TRABALHO)[number];

export const ESTADOS_TRABALHO = [
  "PENDENTE",
  "DISPONIVEL",
  "EM_EXECUCAO",
  "AGUARDANDO",
  "CONCLUIDO",
  "FALHOU",
  "CONFERENCIA",
  "CANCELADO",
] as const;

export type EstadoTrabalho = (typeof ESTADOS_TRABALHO)[number];

export type SituacaoDoTrabalho = "concluido" | "retentavel" | "falhou" | "conferencia";

export interface ResultadoDoTrabalho {
  situacao: SituacaoDoTrabalho;
  resultado: string;
  detalhes?: unknown;
  erroCodigo?: string;
  erroResumo?: string;
  esperaMs?: number;
}

export interface DesfechoDoTrabalho {
  estado: "CONCLUIDO" | "AGUARDANDO" | "FALHOU" | "CONFERENCIA";
  proximaTentativaEm: Date | null;
  resultado: string;
  erroCodigo: string | null;
  erroResumo: string | null;
  requerConferencia: boolean;
  detalhes: unknown;
}

/** JSON canônico simples: chaves ordenadas e valores indefinidos omitidos. */
export function serializarEscopo(valor: unknown): string {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(serializarEscopo).join(",")}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entradas.map(([chave, item]) => `${JSON.stringify(chave)}:${serializarEscopo(item)}`).join(",")}}`;
}

/** Espera antes da próxima tentativa, dado quantas já foram feitas. */
export function esperaDaTentativa(tentativasFeitas: number): number {
  const indice = Math.min(Math.max(tentativasFeitas, 1), ESPERAS_TRABALHO_MS.length) - 1;
  return ESPERAS_TRABALHO_MS[indice] ?? ESPERAS_TRABALHO_MS[ESPERAS_TRABALHO_MS.length - 1] ?? 0;
}

/**
 * Converte o resultado do manipulador em estado persistido.
 * Só a situação retentavel agenda nova tentativa. Conferência e falha
 * definitiva encerram a execução automática.
 */
export function desfechoDoTrabalho(
  resultado: ResultadoDoTrabalho,
  contexto: { tentativasFeitas: number; maxTentativas: number; agora: Date },
): DesfechoDoTrabalho {
  const base = {
    resultado: resultado.resultado,
    erroCodigo: resultado.erroCodigo ?? null,
    erroResumo: resultado.erroResumo ?? null,
    detalhes: resultado.detalhes,
  };

  if (resultado.situacao === "concluido") {
    return {
      ...base,
      estado: "CONCLUIDO",
      proximaTentativaEm: null,
      requerConferencia: false,
    };
  }

  if (resultado.situacao === "conferencia") {
    return {
      ...base,
      estado: "CONFERENCIA",
      proximaTentativaEm: null,
      requerConferencia: true,
    };
  }

  if (resultado.situacao === "falhou") {
    return {
      ...base,
      estado: "FALHOU",
      proximaTentativaEm: null,
      requerConferencia: false,
    };
  }

  if (contexto.tentativasFeitas >= contexto.maxTentativas) {
    return {
      ...base,
      estado: "FALHOU",
      proximaTentativaEm: null,
      requerConferencia: false,
    };
  }

  const espera =
    resultado.esperaMs !== undefined &&
    Number.isFinite(resultado.esperaMs) &&
    resultado.esperaMs >= 0
      ? resultado.esperaMs
      : esperaDaTentativa(contexto.tentativasFeitas);

  return {
    ...base,
    estado: "AGUARDANDO",
    proximaTentativaEm: new Date(contexto.agora.getTime() + espera),
    requerConferencia: false,
  };
}

/** Estados que ainda podem executar ou exigir resolução. */
export function estadoAberto(estado: EstadoTrabalho): boolean {
  return (
    estado === "PENDENTE" ||
    estado === "DISPONIVEL" ||
    estado === "EM_EXECUCAO" ||
    estado === "AGUARDANDO" ||
    estado === "CONFERENCIA"
  );
}

/** Só itens que ainda não começaram podem ser cancelados sem interromper execução. */
export function podeCancelar(estado: EstadoTrabalho): boolean {
  return estado === "PENDENTE" || estado === "DISPONIVEL" || estado === "AGUARDANDO";
}

/** Falha e cancelamento podem voltar para a fila por ação administrativa. */
export function podeReenfileirar(estado: EstadoTrabalho): boolean {
  return estado === "FALHOU" || estado === "CANCELADO";
}

/** Uma conferência só termina por decisão explícita da administração. */
export function podeResolver(estado: EstadoTrabalho): boolean {
  return estado === "CONFERENCIA";
}

export type DestinoDaReservaVencida = "AGUARDANDO" | "CONFERENCIA" | "FALHOU";

/**
 * Decide o destino de um trabalho cuja reserva venceu sem finalização.
 * Indicadores e expurgo são seguros para repetir; a preparação mensal pode
 * ter escrito no Google; um tipo desconhecido não tem manipulador seguro.
 */
export function destinoDaReservaVencida(tipo: string): DestinoDaReservaVencida {
  if (tipo === "INDICADORES_ATUALIZAR" || tipo === "EXPURGO_TRABALHOS") return "AGUARDANDO";
  if (tipo === "PLANILHA_MENSAL_PREPARAR") return "CONFERENCIA";
  return "FALHOU";
}

/** Identificador estável da janela de cinco minutos usada pela agenda. */
export function janelaDeCincoMinutos(agora: Date): string {
  return new Date(Math.floor(agora.getTime() / 300_000) * 300_000).toISOString();
}

export interface FilasAtivas {
  planilha: boolean;
  trabalhos: boolean;
}

/** Decide quais consumidores podem existir com a configuração atual. */
export function filasAtivas(config: {
  driver: string;
  planilhaTransporte: string;
  trabalhosHabilitada: boolean;
}): FilasAtivas {
  const redis = config.driver === "redis";
  return {
    planilha: redis && config.planilhaTransporte === "bullmq",
    trabalhos: redis && config.trabalhosHabilitada,
  };
}
