import type { Aluno, Turma } from "@/domain/frequencia";

/** Universo da série, incluindo origens, independente da data e da cobertura. */
export function categoriasDaSerie(serieId: string, turmas: Turma[], alunos: Aluno[]) {
  const ids = new Set(turmas.filter((turma) => turma.serieId === serieId).map((turma) => turma.id));
  const origens = alunos
    .filter((aluno) => ids.has(aluno.turmaId))
    .map((aluno) => aluno.turmaOriginalId);
  return [...ids, ...origens];
}
