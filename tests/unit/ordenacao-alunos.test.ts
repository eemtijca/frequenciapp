// Planejamento da numeração alfabética por turma, com acentos, inativos e empates.
import { describe, expect, it } from "vitest";
import { planejarOrdenacaoAlunos, type AlunoParaOrdenacao } from "@/domain/ordenacao-alunos";

const aluno = (
  id: string,
  nome: string,
  turmaId: string,
  ordem: number,
  ativo = true,
): AlunoParaOrdenacao => ({ id, nome, turmaId, ordem, ativo });

describe("ordenação dos alunos", () => {
  it("numera cada turma separadamente e respeita nomes com acento e caixa", () => {
    const alunos = [
      aluno("z", "Zoé", "A", 1),
      aluno("a", "Álvaro", "A", 2),
      aluno("c", "caio", "A", 3),
      aluno("b", "Bruno", "B", 1),
      aluno("n", "Ana", "B", 2),
    ];
    const antes = structuredClone(alunos);
    expect(planejarOrdenacaoAlunos(alunos)).toEqual({
      turmas: 2,
      alunos: 5,
      mudancas: [
        { id: "a", ordem: 1 },
        { id: "c", ordem: 2 },
        { id: "z", ordem: 3 },
        { id: "n", ordem: 1 },
        { id: "b", ordem: 2 },
      ],
    });
    expect(alunos).toEqual(antes);
  });

  it("mantém os ativos consecutivos e coloca os inativos depois", () => {
    const alunos = [
      aluno("i", "Aaron", "A", 1, false),
      aluno("b", "Beatriz", "A", 2),
      aluno("a", "Ana", "A", 7),
    ];
    expect(planejarOrdenacaoAlunos(alunos).mudancas).toEqual([
      { id: "a", ordem: 1 },
      { id: "i", ordem: 3 },
    ]);
  });

  it("preserva a posição relativa de homônimos e desempata números iguais pelo código", () => {
    const alunos = [
      aluno("c", "ana", "A", 8),
      aluno("b", "Ana", "A", 4),
      aluno("a", "ANA", "A", 4),
    ];
    expect(planejarOrdenacaoAlunos(alunos).mudancas).toEqual([
      { id: "a", ordem: 1 },
      { id: "b", ordem: 2 },
      { id: "c", ordem: 3 },
    ]);
  });

  it("não propõe mudanças quando a turma já está ordenada", () => {
    expect(
      planejarOrdenacaoAlunos([aluno("a", "Ana", "A", 1), aluno("b", "Bruno", "A", 2)]).mudancas,
    ).toEqual([]);
    expect(planejarOrdenacaoAlunos([])).toEqual({ turmas: 0, alunos: 0, mudancas: [] });
  });
});
