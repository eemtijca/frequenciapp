// Massa determinística compartilhada pela fixture e pela resposta de consulta semanal.
import type { Frequencia, Serie, Turma } from "@/domain/frequencia";

export const HOJE = "2026-11-06";
export const MES = "2026-11";
export const series: Serie[] = [
  { id: "s1", nome: "1ª série", ordem: 1 },
  { id: "s2", nome: "2ª série", ordem: 2 },
  { id: "s3", nome: "3ª série", ordem: 3 },
  { id: "s4", nome: "4ª série", ordem: 4 },
];
export const turmas: Turma[] = series.map((serie) => ({
  id: serie.id,
  nome: "A",
  rotulo: `${serie.nome} A`,
  serieId: serie.id,
  serieNome: serie.nome,
  horarios: [],
}));
export const alunos = Array.from({ length: 16 }, (_, ordem) => ({
  id: `a${ordem}`,
  nome: `Estudante sintético ${String(ordem + 1).padStart(2, "0")}`,
  turmaId: "s1",
  turmaOriginalId: "s1",
  ativo: true,
  ordem,
}));
export const frequencias: Frequencia[] = [
  ...Array.from({ length: 5 }, (_, i) => ({ dia: `2026-11-0${i + 2}`, turmaId: "s1" })),
  { dia: HOJE, turmaId: "s2" },
].map(({ dia, turmaId }, i) => ({
  dia,
  turmaId,
  revisao: 1,
  atualizadoEm: `${dia}T14:30:00.000Z`,
  atualizadoPorNome: "Equipe sintética",
  aulas: ["aula_1"],
  alunos: turmaId === "s1" ? alunos.map(({ id }) => id) : [],
  faltas:
    turmaId === "s1"
      ? [{ alunoId: `a${i}`, horarios: ["aula_1"], justificativa: i % 2 ? "SAUDE" : null }]
      : [],
}));
