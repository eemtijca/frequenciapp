// Disciplinas por dia e turnos de consulta, separados das regras da frequência.

export const INTERVALO_ALMOCO = { inicio: "11:50", fim: "13:00" } as const;
export const INTERVALO_MANHA = { inicio: "09:00", fim: "09:20" } as const;
export const INTERVALO_TARDE = { inicio: "14:40", fim: "14:55" } as const;
export type TurnoHorario = "manha" | "tarde" | "almoco";

export type IdPausa = "intervalo-manha" | "almoco" | "intervalo-tarde";

export interface Pausa {
  id: IdPausa;
  rotulo: string;
  inicio: string;
  fim: string;
  /** Intervalos só valem entre aulas do próprio turno; o almoço separa os dois turnos. */
  turno: "manha" | "tarde" | null;
}

export const PAUSAS: readonly Pausa[] = [
  { id: "intervalo-manha", rotulo: "Intervalo", turno: "manha", ...INTERVALO_MANHA },
  { id: "almoco", rotulo: "Almoço", turno: null, ...INTERVALO_ALMOCO },
  { id: "intervalo-tarde", rotulo: "Intervalo", turno: "tarde", ...INTERVALO_TARDE },
];

export type ItemDoDia<T> = { tipo: "aula"; aula: T } | { tipo: "pausa"; pausa: Pausa };

/** Agrupa pelo início da aula, preservando também horários cadastrados durante o almoço. */
export function turnoDoHorario(inicio: string): TurnoHorario {
  if (inicio < INTERVALO_ALMOCO.inicio) return "manha";
  return inicio < INTERVALO_ALMOCO.fim ? "almoco" : "tarde";
}

/**
 * Intercala intervalos e almoço entre as aulas, na ordem do horário. Cada pausa só aparece
 * quando há aula antes e depois dela (no mesmo turno, no caso dos intervalos), para não
 * deixar pausa solta no começo ou no fim do dia. `aulas` já vem ordenada.
 */
export function sequenciaDoDia<T>(
  aulas: readonly T[],
  inicioDe: (aula: T) => string,
): ItemDoDia<T>[] {
  const itens: ItemDoDia<T>[] = aulas.map((aula) => ({ tipo: "aula", aula }));
  for (const pausa of PAUSAS) {
    const noTurno = aulas.filter(
      (aula) => pausa.turno === null || turnoDoHorario(inicioDe(aula)) === pausa.turno,
    );
    const depois = noTurno.find((aula) => inicioDe(aula) >= pausa.inicio);
    const antes = noTurno.some((aula) => inicioDe(aula) < pausa.inicio);
    if (!depois || !antes) continue;
    const posicao = itens.findIndex((item) => item.tipo === "aula" && item.aula === depois);
    itens.splice(posicao, 0, { tipo: "pausa", pausa });
  }
  return itens;
}

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
