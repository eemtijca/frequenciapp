// Presença por dia inteiro, turno ou aulas, separada das faltas da chamada regular.
// A confirmação manual na Seduc identifica a revisão que já foi lançada.
export type TipoFrequenciaParcial = "TURNO" | "AULAS" | "DIA_INTEIRO";
export type TurnoParcial = "MANHA" | "TARDE";
export const LIMITE_OBSERVACAO_PARCIAL = 300;
export const LIMITE_AULAS_PARCIAL = 30;

export interface FrequenciaParcial {
  id: string;
  alunoId: string;
  dia: string;
  turmaId: string;
  alunoNome: string;
  turmaNome: string;
  tipo: TipoFrequenciaParcial;
  turno: TurnoParcial | null;
  aulas: number[];
  observacao: string | null;
  registradoSeduc: boolean;
  registradoSeducEm: string | null;
  registradoSeducPorNome: string | null;
  revisao: number;
  criadoEm: string;
  atualizadoEm: string;
}

/** Remove repetições e preserva a ordem das aulas selecionadas. */
export function normalizarAulas(aulas: readonly number[]): number[] {
  return [...new Set(aulas)].sort((a, b) => a - b);
}

/** Descrição usada na lista e na planilha, sem inferir horários não cadastrados. */
export function rotuloFrequenciaParcial(
  registro: Pick<FrequenciaParcial, "tipo" | "turno" | "aulas">,
): string {
  if (registro.tipo === "DIA_INTEIRO") return "Dia inteiro";
  if (registro.tipo === "TURNO") return registro.turno === "MANHA" ? "Manhã" : "Tarde";
  const aulas = normalizarAulas(registro.aulas);
  if (aulas.length === 1) return `${aulas[0]}ª aula`;
  if (aulas.length > 1 && aulas.every((aula, indice) => aula === (aulas[0] ?? 0) + indice))
    return `${aulas[0]}ª à ${aulas.at(-1)}ª aula`;
  return `Aulas ${aulas.join(", ")}`;
}
