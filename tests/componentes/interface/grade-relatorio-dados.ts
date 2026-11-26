// Massa determinística da Grade: F, FJ, S, P, vazio e aluno sem faltas.
import type { Aluno, Frequencia, Horario, Turma } from "@/domain/frequencia";

export const HOJE = "2026-11-06";
export const MES = "2026-11";
export const DIA_F = "2026-11-02";
export const DIA_FJ = "2026-11-03";
export const DIA_S = "2026-11-04";
export const DIA_P = "2026-11-05";

export const horarios: Horario[] = [
  {
    id: "aula-1",
    turmaId: "turma-a",
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  },
  {
    id: "aula-2",
    turmaId: "turma-a",
    ordem: 2,
    inicio: "07:50",
    fim: "08:40",
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  },
  {
    id: "aula-3",
    turmaId: "turma-a",
    ordem: 3,
    inicio: "08:40",
    fim: "09:30",
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  },
];

export const turmas: Turma[] = [
  {
    id: "turma-a",
    serieId: "serie-1",
    nome: "A",
    rotulo: "1º ano A",
    serieNome: "1º ano",
    horarios,
  },
];

export const alunos: Aluno[] = [
  {
    id: "aluno-a",
    nome: "Aluno A",
    turmaId: "turma-a",
    turmaOriginalId: "turma-a",
    ordem: 1,
    ativo: true,
  },
  {
    id: "aluno-b",
    nome: "Aluno B",
    turmaId: "turma-a",
    turmaOriginalId: "turma-a",
    ordem: 2,
    ativo: true,
  },
  {
    id: "aluno-c",
    nome: "Aluno C",
    turmaId: "turma-a",
    turmaOriginalId: "turma-a",
    ordem: 3,
    ativo: true,
  },
];

const aulas = horarios.map((horario) => horario.id);

function chamada(
  dia: string,
  faltas: { alunoId: string; horarios: string[]; justificativa?: string }[],
): Frequencia {
  return {
    dia,
    turmaId: "turma-a",
    revisao: 1,
    atualizadoEm: `${dia}T12:00:00Z`,
    atualizadoPorNome: "Equipe sintética",
    alunos: alunos.map((aluno) => aluno.id),
    aulas,
    faltas,
  };
}

export const frequencias: Frequencia[] = [
  chamada(DIA_F, [{ alunoId: "aluno-b", horarios: aulas }]),
  chamada(DIA_FJ, [{ alunoId: "aluno-a", horarios: aulas, justificativa: "D" }]),
  chamada(DIA_S, [{ alunoId: "aluno-a", horarios: ["aula-1"] }]),
  chamada(DIA_P, []),
];

export const justificativas = [{ codigo: "D", rotulo: "Doente" }];

export const resumo = {
  primeiroDia: "2026-01-01",
  diasLetivos: 100,
  porAluno: [{ alunoId: "aluno-a", faltas: 5, faltasJustificadas: 2, diasComRegistro: 100 }],
};
