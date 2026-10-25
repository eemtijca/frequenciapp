// Reagrupamento do relatório de saídas e entradas por aluno: contagens, filtro e aluno escolhido.
import { describe, expect, it } from "vitest";
import {
  movimentacoesPorAluno,
  type MovimentacaoRelatorio,
  type TurmaRelatorioMovimentacoes,
} from "@/domain/relatorio-movimentacoes";

function item(extra: Partial<MovimentacaoRelatorio>): MovimentacaoRelatorio {
  return {
    id: "m1",
    tipo: "SAIDA",
    alunoId: "aluno-a",
    alunoNome: "Ana Souza",
    dia: "2026-10-05",
    horario: "09:00",
    momento: null,
    motivo: "Consulta",
    responsavel: "Direção",
    ...extra,
  };
}

function turma(
  turmaRotulo: string,
  movimentacoes: MovimentacaoRelatorio[],
): TurmaRelatorioMovimentacoes {
  const saidas = movimentacoes.filter((m) => m.tipo === "SAIDA").length;
  return {
    turmaId: turmaRotulo,
    turmaRotulo,
    saidas,
    entradas: movimentacoes.length - saidas,
    total: movimentacoes.length,
    movimentacoes,
  };
}

const turmas = [
  turma("1º ano A", [
    item({ id: "s1", dia: "2026-10-05" }),
    item({ id: "e1", tipo: "ENTRADA", dia: "2026-10-06", horario: "07:40" }),
    item({ id: "s2", alunoId: "aluno-b", alunoNome: "Álvaro Lima", dia: "2026-10-06" }),
  ]),
  turma("1º ano B", [item({ id: "s3", dia: "2026-10-07", horario: "10:00" })]),
];

describe("movimentacoesPorAluno", () => {
  it("soma saídas e entradas do mesmo aluno entre turmas e lista as mais recentes primeiro", () => {
    const [ana, alvaro] = movimentacoesPorAluno(turmas);
    expect(ana).toMatchObject({
      alunoId: "aluno-a",
      saidas: 2,
      entradas: 1,
      total: 3,
      turmas: ["1º ano A", "1º ano B"],
    });
    expect(ana?.movimentacoes.map((m) => m.id)).toEqual(["s3", "e1", "s1"]);
    expect(alvaro).toMatchObject({ alunoId: "aluno-b", saidas: 1, entradas: 0, total: 1 });
  });

  it("mantém só quem tem duas ou mais movimentações", () => {
    const repetidas = movimentacoesPorAluno(turmas, "repetidas");
    expect(repetidas.map((aluno) => aluno.alunoId)).toEqual(["aluno-a"]);
  });

  it("restringe o resultado ao aluno escolhido", () => {
    expect(movimentacoesPorAluno(turmas, "todas", "aluno-b").map((a) => a.alunoId)).toEqual([
      "aluno-b",
    ]);
    expect(movimentacoesPorAluno(turmas, "repetidas", "aluno-b")).toEqual([]);
    expect(movimentacoesPorAluno(turmas, "todas", "sem-movimentacao")).toEqual([]);
  });

  it("devolve lista vazia sem movimentações", () => {
    expect(movimentacoesPorAluno([])).toEqual([]);
  });
});
