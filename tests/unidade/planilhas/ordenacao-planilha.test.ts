// Confere a ordem em português e a preservação das linhas manuais entre os alunos.
import { describe, expect, it } from "vitest";
import {
  ordenarAlunosDaPlanilha,
  planejarOrdenacaoLinhasPlanilha,
} from "@/domain/ordenacao-planilha";

describe("ordenação das linhas da planilha", () => {
  it("ordena acentos e maiúsculas em português sem alterar a lista recebida", () => {
    const alunos = ["Érica", "Bruna", "ana", "Ágata"].map((nome) => ({ nome }));
    expect(ordenarAlunosDaPlanilha(alunos).map((aluno) => aluno.nome)).toEqual([
      "Ágata",
      "ana",
      "Bruna",
      "Érica",
    ]);
    expect(alunos.map((aluno) => aluno.nome)).toEqual(["Érica", "Bruna", "ana", "Ágata"]);
  });

  it("mantém a ordem anterior de homônimos", () => {
    const alunos = [
      { nome: "ana", id: "1" },
      { nome: "Ana", id: "2" },
    ];
    expect(ordenarAlunosDaPlanilha(alunos).map((aluno) => aluno.id)).toEqual(["1", "2"]);
    expect(
      planejarOrdenacaoLinhasPlanilha(
        alunos.map((aluno, indice) => ({ ...aluno, linha: indice + 2 })),
      ),
    ).toEqual([]);
  });

  it("troca linhas inteiras e mantém as posições de conteúdo manual e cabeçalho", () => {
    const nomes = ["Aluno", "Bruna", "Érica", "Conferência manual", "Ágata", "Total manual"];
    const movimentos = planejarOrdenacaoLinhasPlanilha(
      [2, 3, 5].map((linha) => ({ linha, nome: nomes[linha - 1] ?? "" })),
    );
    const linhas = [...nomes];
    for (const movimento of movimentos) {
      const removidas = linhas.splice(movimento.origem - 1, 1);
      linhas.splice(movimento.destino - 1, 0, ...removidas);
    }
    expect(linhas).toEqual([
      "Aluno",
      "Ágata",
      "Bruna",
      "Conferência manual",
      "Érica",
      "Total manual",
    ]);
    expect(
      planejarOrdenacaoLinhasPlanilha(
        [2, 3, 5].map((linha) => ({ linha, nome: linhas[linha - 1] ?? "" })),
      ),
    ).toEqual([]);
  });

  it("resolve linhas vizinhas em um único movimento", () => {
    expect(
      planejarOrdenacaoLinhasPlanilha([
        { linha: 3, nome: "Bruna" },
        { linha: 2, nome: "Érica" },
      ]),
    ).toEqual([{ origem: 3, destino: 2 }]);
  });

  it("não solicita movimentos sem alunos ou com um único aluno", () => {
    expect(planejarOrdenacaoLinhasPlanilha([])).toEqual([]);
    expect(planejarOrdenacaoLinhasPlanilha([{ linha: 2, nome: "Ana" }])).toEqual([]);
  });
});
