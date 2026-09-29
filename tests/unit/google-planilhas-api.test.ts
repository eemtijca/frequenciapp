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
                    dimensionRange: { sheetId: 7, startRowIndex: 1, endRowIndex: 2 },
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
                    dimensionRange: { sheetId: 7, startColumnIndex: 1, endColumnIndex: 2 },
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
    expect(chamada).toHaveBeenCalledTimes(3);
    expect(String(chamada.mock.calls[0]?.[0])).toContain("rowMetadata");
    expect(String(chamada.mock.calls[0]?.[0])).toContain("columnMetadata");
  });

  it("devolve a estrutura com dimensões utilizadas e fuso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        const url = new URL(String(entrada));
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
