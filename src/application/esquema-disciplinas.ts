// Validação compartilhada das disciplinas semanais na Gestão e na cópia JSON.
import { z } from "zod";

export const esquemaDisciplinas = z.record(
  z.string().regex(/^[1-7]$/, "Dia da disciplina inválido."),
  z
    .string("Informe apenas o nome da disciplina.")
    .trim()
    .max(80, "A disciplina deve ter no máximo 80 caracteres."),
);

/** Impede nomes fora dos dias em que a aula está configurada. */
export function disciplinasCorrespondemAosDias(
  disciplinas: Record<string, string> | undefined,
  diasSemana: readonly number[],
): boolean {
  return Object.keys(disciplinas ?? {}).every((dia) => diasSemana.includes(Number(dia)));
}
