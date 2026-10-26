// Resumo semanal de Saídas e Entradas por aba, dia, turma e aluno.
import { describe, expect, it } from "vitest";
import type { EntradaAtrasada } from "@/domain/entradas";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { resumirMovimentacoes } from "@/domain/resumo-semana-movimentacoes";

const DIAS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

function turma(id: string, rotulo: string): Turma {
  return { id, serieId: "serie", nome: rotulo, rotulo, serieNome: "1º ano", horarios: [] };
}

function aluno(id: string, nome: string, turmaId: string): Aluno {
  return {
    id,
    nome,
    turmaId,
    turmaOriginalId: turmaId,
    ordem: 1,
    ativo: true,
    desistenteEm: null,
  };
}

function saida(id: string, alunoId: string, dia: string): SaidaAntecipada {
  return {
    id,
    alunoId,
    dia,
    momento: "aula_1",
    horario: "07:30",
    justificativa: null,
    observacao: null,
    texto: null,
    liberadoPorId: null,
    liberadoPorCodigo: null,
    liberadoPorNome: null,
    criadoEm: `${dia}T12:00:00Z`,
  };
}

function entrada(id: string, alunoId: string, dia: string, turmaId: string): EntradaAtrasada {
  return {
    id,
    alunoId,
    nome: alunoId,
    turmaId,
    turmaRotulo: "1º ano B",
    dia,
    horario: "08:10",
    motivo: "Atraso",
    registradoPorNome: "Equipe",
    criadoEm: `${dia}T12:00:00Z`,
  };
}

describe("resumo semanal de movimentações", () => {
  it("agrupa saídas por dia, turma de origem e aluno", () => {
    const resumo = resumirMovimentacoes("saida", {
      saidas: [
        saida("s1", "ana", "2026-10-19"),
        saida("s2", "ana", "2026-10-20"),
        saida("s3", "bruno", "2026-10-19"),
      ],
      alunos: [aluno("ana", "Ana", "turma-a"), aluno("bruno", "Bruno", "turma-b")],
      turmas: [turma("turma-a", "1º ano A"), turma("turma-b", "1º ano B")],
      dias: DIAS,
    });
    expect(resumo.total).toBe(3);
    expect(resumo.totalAlunos).toBe(2);
    expect(resumo.totalTurmas).toBe(2);
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-19")?.total).toBe(2);
    expect(resumo.alunos[0]).toMatchObject({ nome: "Ana", total: 2 });
    expect(resumo.turmas.map((item) => [item.rotulo, item.total])).toEqual([
      ["1º ano A", 2],
      ["1º ano B", 1],
    ]);
  });

  it("agrupa entradas pela turma gravada no registro", () => {
    const resumo = resumirMovimentacoes("entrada", {
      entradas: [
        entrada("e1", "ana", "2026-10-19", "turma-b"),
        entrada("e2", "ana", "2026-10-20", "turma-b"),
      ],
      dias: DIAS,
    });
    expect(resumo.total).toBe(2);
    expect(resumo.totalTurmas).toBe(1);
    expect(resumo.turmas[0]).toMatchObject({ rotulo: "1º ano B", total: 2 });
    expect(resumo.alunos[0]).toMatchObject({ nome: "ana", total: 2 });
  });
});
