// Regras puras da fila FIFO de envios automáticos às planilhas: ordem, espera entre
// tentativas, reserva com prazo e resumo da situação final de cada item.

export const MAXIMO_TENTATIVAS_FILA = 5;
/** Esperas depois da 1ª, 2ª, 3ª e 4ª falhas; a última vale para as seguintes. */
export const ESPERAS_FILA_MS = [30_000, 120_000, 600_000, 1_800_000] as const;
/** Prazo da reserva de um item em andamento; vencida, outro consumidor retoma. */
export const PRAZO_RESERVA_MS = 5 * 60_000;
export const DIAS_GUARDAR_CONCLUIDOS = 7;
export const DIAS_GUARDAR_ENCERRADOS = 30;

export type EstadoItemFila = "AGUARDANDO" | "EM_ANDAMENTO" | "CONCLUIDO" | "FALHOU" | "DESCARTADO";
export type TipoItemFila = "FREQUENCIA" | "SAIDAS" | "ENTRADAS";

export interface ItemParaOrdem {
  id: string;
  sequencia: bigint | number;
  estado: EstadoItemFila;
  proximaTentativaEm: Date | null;
  reservadoAte: Date | null;
}

export type DecisaoDaFila<T extends ItemParaOrdem> =
  | { acao: "processar"; item: T }
  | { acao: "aguardar"; motivo: "espera" | "reserva"; ate: Date | null }
  | { acao: "vazia" };

/** Espera antes da próxima tentativa, dado quantas já foram feitas. */
export function esperaDaTentativa(tentativasFeitas: number): number {
  const indice = Math.min(Math.max(tentativasFeitas, 1), ESPERAS_FILA_MS.length) - 1;
  return ESPERAS_FILA_MS[indice] ?? ESPERAS_FILA_MS[ESPERAS_FILA_MS.length - 1] ?? 0;
}

/**
 * Escolhe o próximo passo: o item aberto de menor sequência manda. Se ele espera
 * uma nova tentativa ou está reservado por outro consumidor, ninguém passa à
 * frente; reserva vencida volta a valer como item a processar.
 */
export function proximoDaFila<T extends ItemParaOrdem>(
  itens: readonly T[],
  agora: Date,
): DecisaoDaFila<T> {
  const abertos = itens
    .filter((item) => item.estado === "AGUARDANDO" || item.estado === "EM_ANDAMENTO")
    .sort((a, b) => (a.sequencia < b.sequencia ? -1 : a.sequencia > b.sequencia ? 1 : 0));
  const frente = abertos[0];
  if (!frente) return { acao: "vazia" };
  if (frente.estado === "EM_ANDAMENTO") {
    if (frente.reservadoAte && frente.reservadoAte > agora) {
      return { acao: "aguardar", motivo: "reserva", ate: frente.reservadoAte };
    }
    return { acao: "processar", item: frente };
  }
  if (frente.proximaTentativaEm && frente.proximaTentativaEm > agora) {
    return { acao: "aguardar", motivo: "espera", ate: frente.proximaTentativaEm };
  }
  return { acao: "processar", item: frente };
}

const PRIORIDADE_SITUACAO = [
  "sem_confirmacao",
  "pendente_manual",
  "sem_mapa",
  "nao_processado",
  "falha_preparo",
  "falhou",
  "limite",
  "enviado",
  "desligado",
] as const;

/** Resultados que não provam escrita externa e podem ser tentados de novo sem risco. */
const RESULTADOS_REPETIVEIS: readonly string[] = [
  "falhou",
  "limite",
  "nao_processado",
  "falha_preparo",
];
/** Resultados que exigem uma ação do operador, mas não uma conferência de escrita incerta. */
const RESULTADOS_ACAO_SEGURA: readonly string[] = ["sem_mapa", "pendente_manual", "sem_autor"];

/** Resume as situações de um envio (a chamada pode abranger várias turmas de origem). */
export function resumirSituacoes(situacoes: readonly string[]): string {
  // Escrita possível em qualquer origem impede a repetição cega de todo o envio.
  if (situacoes.includes("sem_confirmacao")) return "sem_confirmacao";
  for (const situacao of PRIORIDADE_SITUACAO) {
    if (situacoes.includes(situacao)) return situacao;
  }
  return "desligado";
}

/** A pendência precisa de atenção do operador antes de encerrar o assunto. */
export function requerConferencia(resultado: string | null): boolean {
  return (
    resultado !== null &&
    !["enviado", "desligado", "sem_trabalho", ...RESULTADOS_REPETIVEIS].includes(resultado)
  );
}

/** A repetição não repete uma escrita incerta; vale para mapa ausente e falha de preparo. */
export function retrySeguro(resultado: string | null): boolean {
  return (
    resultado !== null && [...RESULTADOS_REPETIVEIS, ...RESULTADOS_ACAO_SEGURA].includes(resultado)
  );
}

export type ClasseItemFila =
  "aberto" | "sucesso" | "preparo" | "origem_nao_processada" | "conferencia" | "falha";

/** Separa sucesso, falha de preparo, origem não processada e conferência de escrita incerta. */
export function classeDoItem(item: {
  estado: EstadoItemFila;
  resultado: string | null;
}): ClasseItemFila {
  if (!item.resultado)
    return item.estado === "AGUARDANDO" || item.estado === "EM_ANDAMENTO" ? "aberto" : "falha";
  if (item.resultado === "sem_confirmacao") return "conferencia";
  if (item.resultado === "falha_preparo") return "preparo";
  if (item.resultado === "nao_processado" || RESULTADOS_ACAO_SEGURA.includes(item.resultado))
    return "origem_nao_processada";
  if (
    item.resultado === "enviado" ||
    item.resultado === "desligado" ||
    item.resultado === "sem_trabalho"
  )
    return "sucesso";
  if (item.resultado === "falhou" || item.resultado === "limite") return "falha";
  return "conferencia";
}

export interface DesfechoDoItem {
  requerConferencia: boolean;
  estado: "AGUARDANDO" | "CONCLUIDO" | "FALHOU";
  resultado: string;
  proximaTentativaEm: Date | null;
}

/**
 * Falha confirmada, limite de leitura, origem não processada e falha de preparo
 * geram nova tentativa. Envio sem confirmação, mapa ausente e plano que pede
 * conferência manual encerram o item: repetir uma escrita incerta não é seguro.
 */
export function desfechoDoItem(
  situacao: string,
  tentativasFeitas: number,
  agora: Date,
): DesfechoDoItem {
  if (RESULTADOS_REPETIVEIS.includes(situacao)) {
    if (tentativasFeitas >= MAXIMO_TENTATIVAS_FILA) {
      return {
        estado: "FALHOU",
        resultado: situacao,
        proximaTentativaEm: null,
        requerConferencia: false,
      };
    }
    return {
      estado: "AGUARDANDO",
      requerConferencia: false,
      resultado: situacao,
      proximaTentativaEm: new Date(agora.getTime() + esperaDaTentativa(tentativasFeitas)),
    };
  }
  return {
    estado: "CONCLUIDO",
    resultado: situacao,
    proximaTentativaEm: null,
    requerConferencia: requerConferencia(situacao),
  };
}

export interface ResumoDoProcessamento {
  processados: number;
  concluidos: number;
  falhas: number;
  /** Itens ainda abertos (aguardando ou em andamento) ao terminar. */
  abertos: number;
  aguardandoAte: string | null;
}

export interface ItemDaFila {
  classe: ClasseItemFila;
  escopos: { origemId: string | null; origemRotulo: string | null; destino: string | null }[];
  requerConferencia: boolean;
  podeReprocessar: boolean;
  podeResolver: boolean;
  falhaPreparo: string | null;
  id: string;
  tipo: TipoItemFila;
  estado: EstadoItemFila;
  dia: string;
  turmaRotulo: string | null;
  tentativas: number;
  resultado: string | null;
  erro: string | null;
  criadoEm: string;
  proximaTentativaEm: string | null;
}

export interface EstadoDaFila {
  conferenciasPendentes: number;
  contagens: Record<EstadoItemFila, number>;
  itens: ItemDaFila[];
}
