// Ordem do almoço: validação da lista do dia, leitura renumerada e dias aceitos.
import { describe, expect, it } from "vitest";
import {
  ehDiaOrdemAlmoco,
  itensEmOrdem,
  ordemDoDia,
  problemaNaOrdemAlmoco,
} from "@/domain/ordem-almoco";

describe("validação da ordem do almoço", () => {
  it("aceita lista vazia, sem horários ou com horários em ordem", () => {
    expect(problemaNaOrdemAlmoco([])).toBeNull();
    expect(
      problemaNaOrdemAlmoco([
        { turmaId: "a", inicio: null },
        { turmaId: "b", inicio: null },
      ]),
    ).toBeNull();
    expect(
      problemaNaOrdemAlmoco([
        { turmaId: "a", inicio: "11:50" },
        { turmaId: "b", inicio: null },
        { turmaId: "c", inicio: "11:50" },
        { turmaId: "d", inicio: "12:10" },
      ]),
    ).toBeNull();
  });

  it("recusa turma repetida", () => {
    expect(
      problemaNaOrdemAlmoco([
        { turmaId: "a", inicio: null },
        { turmaId: "a", inicio: null },
      ]),
    ).toMatch(/duas vezes/);
  });

  it("recusa horário inválido e horário fora da ordem", () => {
    expect(problemaNaOrdemAlmoco([{ turmaId: "a", inicio: "25:00" }])).toMatch(
      /Horário inválido na 1ª posição/,
    );
    expect(
      problemaNaOrdemAlmoco([
        { turmaId: "a", inicio: "12:10" },
        { turmaId: "b", inicio: null },
        { turmaId: "c", inicio: "12:00" },
      ]),
    ).toMatch(/3ª posição vem antes/);
  });
});

describe("leitura da ordem do almoço", () => {
  it("ordena pela posição e renumera as lacunas a partir de 1", () => {
    expect(
      itensEmOrdem([
        { turmaId: "c", posicao: 7, inicio: null },
        { turmaId: "a", posicao: 2, inicio: "11:50" },
      ]),
    ).toEqual([
      { turmaId: "a", posicao: 1, inicio: "11:50" },
      { turmaId: "c", posicao: 2, inicio: null },
    ]);
  });

  it("devolve a lista vazia para o dia sem ordem", () => {
    const dias = [{ diaSemana: 1, itens: [{ turmaId: "a", posicao: 1, inicio: null }] }];
    expect(ordemDoDia(dias, 1)).toHaveLength(1);
    expect(ordemDoDia(dias, 2)).toEqual([]);
  });

  it.each([
    [1, true],
    [6, true],
    [0, false],
    [7, false],
  ])("dia %i aceito: %s", (dia, aceito) => {
    expect(ehDiaOrdemAlmoco(dia)).toBe(aceito);
  });
});
