import { diaDaSemanaIso, diasDoMes, diaSeguinte, mesSeguinte } from "../../src/domain/frequencia";

/** Procura uma data com dia da semana permitido a partir do ponto indicado. */
export function procurarDia(
  inicio: string,
  direcao: 1 | -1,
  diasSemana: readonly number[],
  feriados: readonly string[],
  limite: number,
  deslocamentos: readonly number[] = [0],
): string {
  const bloqueados = new Set(feriados);
  let dia = inicio;
  for (let i = 0; i <= limite; i += 1, dia = diaSeguinte(dia, direcao)) {
    if (
      diasSemana.includes(diaDaSemanaIso(dia)) &&
      deslocamentos.every((n) => !bloqueados.has(diaSeguinte(dia, n)))
    )
      return dia;
  }
  throw new Error("Nenhuma data disponível no intervalo informado.");
}

/** Dias de segunda a sexta esperados para a planilha da fixture. */
export function diasUteisDaFixture(mes: string, feriados: readonly string[]): string[] {
  const bloqueados = new Set(feriados);
  return diasDoMes(mes).filter((dia) => diaDaSemanaIso(dia) <= 5 && !bloqueados.has(dia));
}

/** Conserva a referência original quando seu mês já terminou. */
export function diaHistoricoDaFixture(mesAtual: string, feriados: readonly string[]): string {
  const mesAnterior = mesSeguinte(mesAtual, -1);
  const mes = mesAnterior < "2026-09" ? mesAnterior : "2026-09";
  const dia = diasUteisDaFixture(mes, feriados).at(-1);
  if (!dia) throw new Error(`Nenhum dia útil livre no mês histórico ${mes}.`);
  return dia;
}
