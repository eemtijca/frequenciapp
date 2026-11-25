// Massa sintética com séries e turmas no limite de 40 caracteres por nome.
import type { Serie, Turma } from "@/domain/frequencia";

export const serieA = "W".repeat(39) + "A";
export const serieB = "W".repeat(39) + "B";
export const nomeTurma = "M".repeat(40);
export const rotuloTurma = `${serieA} ${nomeTurma}`;
export const series: Serie[] = [
  { id: "serie-a", nome: serieA, ordem: 1 },
  { id: "serie-b", nome: serieB, ordem: 2 },
  { id: "serie-c", nome: "Série de Teste", ordem: 3 },
];
export const turmas: Turma[] = [
  {
    id: "turma-a",
    serieId: "serie-a",
    nome: nomeTurma,
    rotulo: rotuloTurma,
    serieNome: serieA,
    horarios: [
      {
        id: "aula-1",
        turmaId: "turma-a",
        ordem: 1,
        inicio: "07:00",
        fim: "07:50",
        diasSemana: [1, 2],
        disciplinas: {},
        ativo: true,
      },
    ],
  },
  {
    id: "turma-b",
    serieId: "serie-b",
    nome: "Turma de Teste",
    rotulo: `${serieB} Turma de Teste`,
    serieNome: serieB,
    horarios: [],
  },
];
