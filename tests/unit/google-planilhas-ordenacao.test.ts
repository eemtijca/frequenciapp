// Ordena linhas completas ao final da escrita, preservando vínculos e colunas auxiliares.
import { describe, expect, it } from "vitest";
import { assinarAba } from "@/domain/planilha";
import { planejarEscritaGoogle } from "@/infra/google-planilhas-escrita";
import { mesclagensDaAssinatura, type DocumentoGoogle } from "@/infra/google-planilhas-api";

const alunoId = "00000000-0000-4000-8000-000000000001";
const documento: DocumentoGoogle = {
  spreadsheetId: "qa-ordem",
  properties: { title: "QA" },
  sheets: [
    {
      properties: {
        sheetId: 7,
        title: "Turma",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
      developerMetadata: [2, 3].map((linha) => ({
        metadataId: linha,
        metadataKey: "frequenciapp.aluno",
        metadataValue: `${linha}`,
        location: { dimensionRange: { sheetId: 7, startRowIndex: linha - 1, endRowIndex: linha } },
      })),
    },
  ],
};
const valores = [
  ["Aluno", "10/09/2026", "Observação"],
  ["Bruna", "F", "Auxiliar"],
  ["Érica", "P", ""],
  ["Conferência manual", "Texto manual", ""],
];
const assinatura = assinarAba("Turma", valores[0] ?? [], []);

describe("escrita com ordenação de alunos", () => {
  it("conclui a criação e as marcações antes de mover linhas inteiras", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      valores.map(() => [false, false, false]),
      1,
      assinatura,
      [
        {
          tipo: "criarLinhas",
          itens: [{ linha: 5, alunoId, celulas: [{ coluna: 1, valor: "Ágata" }] }],
        },
        { tipo: "preencher", linha: 5, coluna: 2, valor: "FJ" },
        { tipo: "ordenarAlunos", coluna: 1 },
      ],
      false,
    );
    expect(plano.requests.filter((pedido) => pedido.moveDimension)).toEqual([
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 4, endIndex: 5 },
          destinationIndex: 1,
        },
      },
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 },
          destinationIndex: 5,
        },
      },
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 4, endIndex: 5 },
          destinationIndex: 2,
        },
      },
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 3, endIndex: 4 },
          destinationIndex: 5,
        },
      },
    ]);
    expect(plano.requests.slice(-4).every((pedido) => pedido.moveDimension)).toBe(true);
    expect(plano.contagens.linhasCriadas).toBe(1);
    expect(plano.contagens.preenchidas).toBe(1);
    expect(plano.destrutiva).toBe(false);
  });

  it("não ordena nomes com fórmula nem linhas sem identificação", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      [[], [], [true], []],
      1,
      assinatura,
      [{ tipo: "ordenarAlunos", coluna: 1 }],
      false,
    );
    expect(plano.requests).toEqual([]);
  });

  it("localiza a coluna de nomes após inserir uma coluna anterior", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      [valores[0] ?? [], valores[2] ?? [], valores[1] ?? []],
      [],
      1,
      assinatura,
      [
        { tipo: "inserirColunas", antesDe: 1, cabecalhoLinha: 1, rotulos: ["11/09/2026"] },
        { tipo: "ordenarAlunos", coluna: 1 },
      ],
      false,
    );
    expect(plano.requests.at(-1)).toEqual({
      moveDimension: {
        source: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 },
        destinationIndex: 1,
      },
    });
  });

  it("recalcula as posições dos alunos depois de excluir uma linha autorizada", () => {
    const marcado = structuredClone(documento);
    const aba = marcado.sheets[0];
    if (!aba) throw new Error("Aba sintética ausente.");
    aba.developerMetadata?.push({
      metadataId: 10,
      metadataKey: "frequenciapp.linha",
      metadataValue: "1",
      location: { dimensionRange: { sheetId: 7, startRowIndex: 1, endRowIndex: 2 } },
    });
    const plano = planejarEscritaGoogle(
      marcado,
      "Turma",
      valores,
      [],
      1,
      assinatura,
      [
        {
          tipo: "criarLinhas",
          itens: [{ linha: 5, alunoId, celulas: [{ coluna: 1, valor: "Ágata" }] }],
        },
        { tipo: "removerLinhas", linhas: [2] },
        { tipo: "ordenarAlunos", coluna: 1 },
      ],
      true,
    );
    expect(plano.requests.filter((pedido) => pedido.moveDimension)).toEqual([
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 3, endIndex: 4 },
          destinationIndex: 1,
        },
      },
      {
        moveDimension: {
          source: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 },
          destinationIndex: 4,
        },
      },
    ]);
  });

  it("exige ordenação no fim para não invalidar coordenadas de escrita", () => {
    expect(() =>
      planejarEscritaGoogle(
        documento,
        "Turma",
        valores,
        [],
        1,
        assinatura,
        [
          { tipo: "ordenarAlunos", coluna: 1 },
          { tipo: "preencher", linha: 5, coluna: 2, valor: "P" },
        ],
        false,
      ),
    ).toThrow("A ordenação deve concluir o envio da planilha.");
  });

  it.each([{ startRowIndex: 1, endRowIndex: 3 }, { endRowIndex: 3 }, { startRowIndex: 1 }])(
    "recusa mesclagem de várias linhas na tabela antes de qualquer escrita: %j",
    (faixa) => {
      const mesclado = structuredClone(documento);
      const aba = mesclado.sheets[0];
      if (!aba) throw new Error("Aba sintética ausente.");
      aba.merges = [{ sheetId: 7, ...faixa, startColumnIndex: 1, endColumnIndex: 2 }];
      expect(() =>
        planejarEscritaGoogle(
          mesclado,
          "Turma",
          valores,
          [],
          1,
          assinarAba("Turma", valores[0] ?? [], mesclagensDaAssinatura(aba)),
          [
            {
              tipo: "criarLinhas",
              itens: [{ linha: 5, alunoId, celulas: [{ coluna: 1, valor: "Ágata" }] }],
            },
            { tipo: "ordenarAlunos", coluna: 1 },
          ],
          false,
        ),
      ).toThrow("Confira as células mescladas na tabela antes de ordenar os alunos.");
    },
  );
});
