// Nomes das disciplinas por dia da semana, separados das regras da frequência.

export const DIAS_DA_SEMANA = [
  { valor: 1, rotulo: "segunda-feira", abreviacao: "Seg" },
  { valor: 2, rotulo: "terça-feira", abreviacao: "Ter" },
  { valor: 3, rotulo: "quarta-feira", abreviacao: "Qua" },
  { valor: 4, rotulo: "quinta-feira", abreviacao: "Qui" },
  { valor: 5, rotulo: "sexta-feira", abreviacao: "Sex" },
  { valor: 6, rotulo: "sábado", abreviacao: "Sáb" },
  { valor: 7, rotulo: "domingo", abreviacao: "Dom" },
] as const;

/** Lê o mapa de disciplinas sem propagar valores inválidos do armazenamento. */
export function disciplinasDoHorario(valor: unknown): Record<string, string> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor).flatMap(([dia, disciplina]) =>
      /^[1-7]$/.test(dia) && typeof disciplina === "string" && disciplina.trim()
        ? [[dia, disciplina.trim()]]
        : [],
    ),
  );
}

/** Atualiza apenas os dias informados e remove nomes de dias retirados da aula. */
export function mesclarDisciplinas(
  atual: unknown,
  entrada: Record<string, string> | undefined,
  diasSemana: readonly number[],
): Record<string, string> {
  const disciplinas = disciplinasDoHorario(atual);
  for (const [dia, disciplina] of Object.entries(entrada ?? {})) {
    if (disciplina.trim()) disciplinas[dia] = disciplina.trim();
    else delete disciplinas[dia];
  }
  return Object.fromEntries(
    Object.entries(disciplinas).filter(([dia]) => diasSemana.includes(Number(dia))),
  );
}
