// Tradução das leituras da Sheets API para a estrutura usada pela frequência.
import { afterEach, describe, expect, it, vi } from "vitest";
import { estruturaGoogle, lerGoogle, mesclagensDaAssinatura } from "@/infra/google-planilhas-api";

afterEach(() => vi.unstubAllGlobals());

const documento = {
  spreadsheetId: "planilha-de-teste",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/planilha-de-teste/edit",
  properties: { title: "Escola", timeZone: "America/Fortaleza" },
  sheets: [
    {
      properties: {
        sheetId: 7,
        title: "Turma",
        sheetType: "GRID",
        gridProperties: { rowCount: 100, columnCount: 26, frozenRowCount: 1 },
      },
      merges: [],
      data: [
        {
          rowMetadata: [
            {},
            {
              developerMetadata: [
                {
                  metadataId: 1,
                  metadataKey: "frequenciapp.aluno",
                  metadataValue: "00000000-0000-4000-8000-000000000001",
                  location: {
                    dimensionRange: { sheetId: 7, dimension: "ROWS", startIndex: 1, endIndex: 2 },
                  },
                },
              ],
            },
          ],
          columnMetadata: [
            {},
            {
              developerMetadata: [
                {
                  metadataId: 2,
                  metadataKey: "frequenciapp.coluna",
                  metadataValue: "1",
                  location: {
                    dimensionRange: {
                      sheetId: 7,
                      dimension: "COLUMNS",
                      startIndex: 1,
                      endIndex: 2,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("leitura pela Sheets API", () => {
  it.each([
    [401, 409, "GOOGLE_RECONECTAR", "Reconecte a conta Google."],
    [403, 403, "GOOGLE_ACESSO", "A conta Google não tem acesso à planilha escolhida."],
    [404, 403, "GOOGLE_ACESSO", "A conta Google não tem acesso à planilha escolhida."],
  ] as const)(
    "identifica a recusa HTTP %i do Google sem confundir com sessão expirada",
    async (httpGoogle, status, codigo, message) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const chamada = vi.fn(async () => Response.json({}, { status: httpGoogle }));
      vi.stubGlobal("fetch", chamada);
      try {
        await expect(estruturaGoogle("planilha-de-teste", "acesso")).rejects.toMatchObject({
          status,
          codigo,
          message,
        });
      } finally {
        log.mockRestore();
      }
    },
  );

  it("identifica o limite temporário de leituras sem confundir com falta de acesso", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }),
      ),
    );
    try {
      await expect(estruturaGoogle("planilha-de-teste", "acesso")).rejects.toMatchObject({
        status: 429,
        message: "O Google limitou as leituras da planilha. Aguarde um minuto e tente novamente.",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("ignora mesclagens verticais na assinatura como o planejador do aplicativo", () => {
    const aba = {
      properties: { sheetId: 7, title: "Turma" },
      merges: [
        { startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
        { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 3 },
      ],
    };
    expect(mesclagensDaAssinatura(aba)).toEqual(["B1:C1"]);
  });

  it("lê valores exibidos, fórmula e código do aluno sem trocar as posições", async () => {
    const chamada = vi.fn(async (entrada: URL | string) => {
      const url = new URL(String(entrada));
      if (url.pathname.endsWith("/developerMetadata:search")) {
        return Response.json({ matchedDeveloperMetadata: [] });
      }
      if (url.pathname.includes("/values/")) {
        return Response.json({
          values: [
            ["Aluno", "Dia"],
            ["Ana", '=IF(1;"F";"")'],
          ],
        });
      }
      if (url.searchParams.get("includeGridData") === "true") {
        return Response.json({
          sheets: [
            {
              data: [
                {
                  startColumn: 1,
                  rowData: [
                    { values: [{ formattedValue: "Dia" }] },
                    {
                      values: [
                        {
                          formattedValue: "F",
                          userEnteredValue: { formulaValue: '=IF(1,"F","")' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        });
      }
      return Response.json(documento);
    });
    vi.stubGlobal("fetch", chamada);
    const leitura = await lerGoogle("planilha-de-teste", "acesso", "Turma", [
      { coluna: 2, colunas: 1 },
    ]);
    expect(leitura.blocos[0]?.valores).toEqual([["Dia"], ["F"]]);
    expect(leitura.blocos[0]?.formula).toEqual([[false], [true]]);
    expect(leitura.alunosDasLinhas).toEqual([
      { linha: 2, alunoId: "00000000-0000-4000-8000-000000000001" },
    ]);
    expect(leitura.colunasCriadas).toEqual([2]);
    expect(chamada).toHaveBeenCalledTimes(4);
    expect(chamada.mock.calls.some(([entrada]) => String(entrada).includes("rowMetadata"))).toBe(
      true,
    );
    expect(chamada.mock.calls.some(([entrada]) => String(entrada).includes("columnMetadata"))).toBe(
      true,
    );
  });

  it("recupera vínculos pela busca quando o GET omite os metadados das linhas", async () => {
    const chamada = vi.fn(async (entrada: URL | string, opcoes?: RequestInit) => {
      const url = new URL(String(entrada));
      if (url.pathname.endsWith("/developerMetadata:search")) {
        expect(opcoes?.method).toBe("POST");
        const corpo = JSON.parse(String(opcoes?.body)) as {
          dataFilters: { developerMetadataLookup: { metadataKey: string } }[];
        };
        expect(corpo.dataFilters.map((item) => item.developerMetadataLookup.metadataKey)).toContain(
          "frequenciapp.aluno",
        );
        return Response.json({
          matchedDeveloperMetadata: [
            {
              developerMetadata: {
                metadataId: 91,
                metadataKey: "frequenciapp.aluno",
                metadataValue: "00000000-0000-4000-8000-000000000001",
                location: {
                  dimensionRange: { sheetId: 7, dimension: "ROWS", startIndex: 1, endIndex: 2 },
                },
              },
            },
            {
              developerMetadata: {
                metadataId: 92,
                metadataKey: "frequenciapp.coluna",
                metadataValue: "1",
                location: {
                  dimensionRange: { sheetId: 7, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
                },
              },
            },
          ],
        });
      }
      if (url.pathname.includes("/values/")) {
        return Response.json({
          values: [
            ["Aluno", "Dia"],
            ["Ana", "F"],
          ],
        });
      }
      if (url.searchParams.get("includeGridData") === "true") {
        return Response.json({ sheets: [{ data: [{ rowData: [{}, {}] }] }] });
      }
      return Response.json({
        ...documento,
        sheets: documento.sheets.map((aba) => ({ ...aba, data: [] })),
      });
    });
    vi.stubGlobal("fetch", chamada);
    const leitura = await lerGoogle("planilha-de-teste", "acesso", "Turma", [
      { coluna: 2, colunas: 1 },
    ]);
    expect(leitura.alunosDasLinhas).toEqual([
      { linha: 2, alunoId: "00000000-0000-4000-8000-000000000001" },
    ]);
    expect(leitura.colunasCriadas).toEqual([2]);
  });

  it("reconhece a primeira dimensão quando o Google omite o índice inicial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        const url = new URL(String(entrada));
        if (url.pathname.endsWith("/developerMetadata:search"))
          return Response.json({
            matchedDeveloperMetadata: [
              {
                developerMetadata: {
                  metadataId: 93,
                  metadataKey: "frequenciapp.aluno",
                  metadataValue: "00000000-0000-4000-8000-000000000001",
                  location: { dimensionRange: { sheetId: 7, dimension: "ROWS", endIndex: 1 } },
                },
              },
              {
                developerMetadata: {
                  metadataId: 94,
                  metadataKey: "frequenciapp.coluna",
                  metadataValue: "1",
                  location: { dimensionRange: { sheetId: 7, dimension: "COLUMNS", endIndex: 1 } },
                },
              },
            ],
          });
        if (url.pathname.includes("/values/")) return Response.json({ values: [["Ana", "F"]] });
        if (url.searchParams.get("includeGridData") === "true")
          return Response.json({ sheets: [{ data: [{ rowData: [{}] }] }] });
        return Response.json({
          ...documento,
          sheets: documento.sheets.map((aba) => ({ ...aba, data: [] })),
        });
      }),
    );
    const leitura = await lerGoogle("planilha-de-teste", "acesso", "Turma", [
      { coluna: 2, colunas: 1 },
    ]);
    expect(leitura.alunosDasLinhas).toEqual([
      { linha: 1, alunoId: "00000000-0000-4000-8000-000000000001" },
    ]);
    expect(leitura.colunasCriadas).toEqual([1]);
  });

  it("devolve a estrutura com dimensões utilizadas e fuso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        const url = new URL(String(entrada));
        if (url.pathname.endsWith("/developerMetadata:search")) {
          return Response.json({ matchedDeveloperMetadata: [] });
        }
        if (url.pathname.includes("/values/"))
          return Response.json({ values: [["Aluno"], ["Ana"]] });
        if (url.searchParams.get("includeGridData") === "true") {
          return Response.json({
            sheets: [
              {
                data: [
                  {
                    rowData: [
                      { values: [{ formattedValue: "Aluno" }] },
                      { values: [{ formattedValue: "Ana" }] },
                    ],
                  },
                ],
              },
            ],
          });
        }
        return Response.json(documento);
      }),
    );
    const estrutura = await estruturaGoogle("planilha-de-teste", "acesso");
    expect(estrutura.planilha.fuso).toBe("America/Fortaleza");
    expect(estrutura.abas[0]).toMatchObject({
      nome: "Turma",
      linhas: 2,
      colunas: 1,
      congeladasLinhas: 1,
      amostra: [["Aluno"], ["Ana"]],
    });
  });
});
