// Calendário escolar anual: feriados com datas explícitas, comuns a todas as turmas.

/** Dia sem chamada, cadastrado pela administração para um ano específico. */
export interface Feriado {
  dia: string;
  nome: string;
}

/** Faixa suportada para configurar o calendário anual da escola. */
export function ehAnoLetivoValido(ano: number): boolean {
  return Number.isInteger(ano) && ano >= 1900 && ano <= 2199;
}

/** Consulta um feriado sem extrapolar a data para outro ano. */
export function feriadoNaData(feriados: readonly Feriado[], dia: string): Feriado | null {
  return feriados.find((feriado) => feriado.dia === dia) ?? null;
}
