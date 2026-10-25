// A saída considera apenas aulas concluídas, sem presumir presença onde há falta salva.
import type { Horario } from "./frequencia";
import { ehHorarioEntrada } from "./entradas";
import { normalizarAulas } from "./frequencia-parcial";

export function aulasConcluidasNaSaida(
  horario: string | null,
  aulas: Pick<Horario, "id" | "ordem" | "inicio" | "fim">[],
  ausentes: readonly string[] = [],
): number[] | null {
  if (!horario || !ehHorarioEntrada(horario) || aulas.length === 0) return null;
  if (
    aulas.some(
      (aula) =>
        !ehHorarioEntrada(aula.inicio) || !ehHorarioEntrada(aula.fim) || aula.fim <= aula.inicio,
    )
  )
    return null;
  const faltas = new Set(ausentes);
  return normalizarAulas(
    aulas.filter((aula) => aula.fim <= horario && !faltas.has(aula.id)).map((aula) => aula.ordem),
  );
}
