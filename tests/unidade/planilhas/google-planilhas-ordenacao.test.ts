// Ordena linhas completas ao final da escrita, preservando vínculos e colunas auxiliares.
import { describe, expect, it } from "vitest";
import { assinarAba } from "@/domain/planilha";
import { planejarEscritaGoogle } from "@/infra/google/planilhas-escrita";
import { mesclagensDaAssinatura, type DocumentoGoogle } from "@/infra/google/planilhas-api";

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

describe("escrita com ordenação de saídas por turma", () => {
  const cabecalho = ["Data", "Aluno", "Turma", "Observação"];
  const ordenar = {
    tipo: "ordenarSaidas",
    colunaAluno: 2,
    colunaTurma: 3,
    colunaData: 1,
    anoReferencia: 2026,
  };
  function documentoSaidas(
    linhas: number[],
    merges?: DocumentoGoogle["sheets"][number]["merges"],
  ): DocumentoGoogle {
    return {
      spreadsheetId: "qa-saidas",
      properties: { title: "QA Saídas" },
      sheets: [
        {
          properties: {
            sheetId: 7,
            title: "Saídas",
            gridProperties: { rowCount: 100, columnCount: 26 },
          },
          merges,
          developerMetadata: linhas.map((linha) => ({
            metadataId: linha,
            metadataKey: "frequenciapp.linha",
            metadataValue: "1",
            location: {
              dimensionRange: {
                sheetId: 7,
                startRowIndex: linha - 1,
                endRowIndex: linha,
              },
            },
          })),
        },
      ],
    };
  }
  function planejar(
    valores: string[][],
    linhas: number[],
    formulas: boolean[][] = [],
    operacoes: unknown[] = [ordenar],
  ) {
    return planejarEscritaGoogle(
      documentoSaidas(linhas),
      "Saídas",
      valores,
      formulas,
      1,
      assinarAba("Saídas", cabecalho, []),
      operacoes,
      true,
    );
  }
  function mover(valores: string[][], requests: Record<string, unknown>[]) {
    const resultado = valores.map((linha) => [...linha]);
    for (const pedido of requests) {
      if (!pedido.moveDimension) continue;
      const { source, destinationIndex } = pedido.moveDimension as {
        source: { startIndex: number; endIndex: number };
        destinationIndex: number;
      };
      const removidas = resultado.splice(source.startIndex, source.endIndex - source.startIndex);
      resultado.splice(
        destinationIndex > source.startIndex
          ? destinationIndex - removidas.length
          : destinationIndex,
        0,
        ...removidas,
      );
    }
    return resultado;
  }

  it("agrupa turmas numericamente, alunos alfabeticamente e datas entre meses sem mover linhas manuais", () => {
    const valores = [
      cabecalho,
      ["01/09/2026", "Ana", "10º ano A", "Dez"],
      ["01/10/2026", "Érica", "2º ano B", "Outubro"],
      ["Conferência manual"],
      ["30/09/2026", "Érica", "2º ano B", "Setembro"],
      ["05/10/2026", "Ágata", "2º ano B", "Ágata"],
      ["01/09/2026", "Zélia", "2º ano A", "A"],
    ];
    const linhas = [2, 3, 5, 6, 7];
    const plano = planejar(valores, linhas);
    const resultado = mover(valores, plano.requests);
    expect(resultado).toEqual([
      valores[0],
      valores[6],
      valores[5],
      valores[3],
      valores[4],
      valores[2],
      valores[1],
    ]);
    expect(plano.destrutiva).toBe(false);
    expect(plano.requests.every((pedido) => pedido.moveDimension)).toBe(true);
    expect(planejar(resultado, linhas).requests).toEqual([]);
  });

  it("preserva nomes, turmas e datas com fórmula, campos ausentes e linhas apenas vinculadas", () => {
    const valores = [
      cabecalho,
      ["01/10/2026", "Zélia", "2º ano B"],
      ["01/10/2026", "Ana", "1º ano A"],
      ["01/10/2026", "Bruna", "1º ano A"],
      ["01/10/2026", "Carla", "1º ano A"],
      ["", "Daniela", "1º ano A"],
      ["01/10/2026", "Eva", ""],
      ["Inválida", "Flávia", "1º ano A"],
      ["01/10/2026", "Gabriela", "1º ano A"],
    ];
    const doc = documentoSaidas([2, 3, 4, 5, 6, 7, 8]);
    doc.sheets[0]?.developerMetadata?.push({
      metadataId: 99,
      metadataKey: "frequenciapp.aluno",
      metadataValue: alunoId,
      location: {
        dimensionRange: { sheetId: 7, startRowIndex: 8, endRowIndex: 9 },
      },
    });
    const plano = planejarEscritaGoogle(
      doc,
      "Saídas",
      valores,
      [[], [], [false, true], [false, false, true], [true]],
      1,
      assinarAba("Saídas", cabecalho, []),
      [ordenar],
      false,
    );
    expect(plano.requests).toEqual([]);
  });

  it("ordena depois de criar, preencher e excluir linhas sem reutilizar posições antigas", () => {
    const valores = [
      cabecalho,
      ["01/10/2026", "Zélia", "3º ano A"],
      ["01/10/2026", "Bruna", "2º ano A"],
      ["Manual"],
    ];
    const plano = planejar(
      valores,
      [2, 3],
      [],
      [
        {
          tipo: "criarLinhas",
          itens: [
            {
              linha: 5,
              celulas: [
                { coluna: 1, valor: "02/10/2026" },
                { coluna: 2, valor: "Ana" },
              ],
            },
          ],
        },
        { tipo: "preencher", linha: 5, coluna: 3, valor: "1º ano A" },
        { tipo: "removerLinhas", linhas: [2] },
        ordenar,
      ],
    );
    const depoisDaEscrita = [
      cabecalho,
      valores[2] ?? [],
      valores[3] ?? [],
      ["02/10/2026", "Ana", "1º ano A"],
    ];
    expect(mover(depoisDaEscrita, plano.requests)).toEqual([
      cabecalho,
      ["02/10/2026", "Ana", "1º ano A"],
      valores[3],
      valores[2],
    ]);
    expect(plano.requests.at(-1)).toHaveProperty("moveDimension");
  });

  it("recusa operações posteriores à ordenação", () => {
    expect(() =>
      planejar(
        [cabecalho],
        [],
        [],
        [ordenar, { tipo: "preencher", linha: 2, coluna: 2, valor: "Ana" }],
      ),
    ).toThrow("A ordenação deve concluir o envio da planilha.");
  });

  it("reencontra Data, Aluno e Turma após inserir uma coluna antes delas", () => {
    const valores = [
      cabecalho,
      ["01/10/2026", "Ana", "3º ano A"],
      ["01/10/2026", "Zélia", "2º ano A"],
    ];
    const plano = planejar(
      valores,
      [2, 3],
      [],
      [{ tipo: "inserirColunas", antesDe: 1, cabecalhoLinha: 1, rotulos: ["Auxiliar"] }, ordenar],
    );
    expect(mover(valores, plano.requests)).toEqual([valores[0], valores[2], valores[1]]);
    expect(plano.requests.at(-1)).toHaveProperty("moveDimension");
  });

  it("recusa mesclagens verticais antes de escrever ou movimentar as saídas", () => {
    const doc = documentoSaidas(
      [2, 3],
      [{ sheetId: 7, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 3, endColumnIndex: 4 }],
    );
    const aba = doc.sheets[0];
    if (!aba) throw new Error("Aba sintética ausente.");
    expect(() =>
      planejarEscritaGoogle(
        doc,
        "Saídas",
        [cabecalho, ["01/10/2026", "Zélia", "2º ano A"], ["01/10/2026", "Ana", "1º ano A"]],
        [],
        1,
        assinarAba("Saídas", cabecalho, mesclagensDaAssinatura(aba)),
        [ordenar],
        false,
      ),
    ).toThrow("Confira as células mescladas na tabela antes de ordenar as saídas.");
  });
});
