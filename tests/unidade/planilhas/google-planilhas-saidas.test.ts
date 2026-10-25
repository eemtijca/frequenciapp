// Exercita o protocolo de saídas pela Sheets API com respostas sintéticas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { assinarAba } from "@/domain/planilha";
import { executarAcaoGoogle } from "@/infra/google/planilhas-api";
import { enviarLotesGoogle } from "@/infra/google/planilhas-escrita";

afterEach(() => vi.unstubAllGlobals());

describe("planilha de saídas pela Sheets API", () => {
  it("mantém a ordenação inteira no mesmo lote ao atingir o limite de pedidos", async () => {
    const lotes: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opcoes: RequestInit) => {
        const corpo = JSON.parse(String(opcoes.body)) as { requests: unknown[] };
        lotes.push(corpo.requests);
        return Response.json({ replies: [] });
      }),
    );
    const anteriores = Array.from({ length: 499 }, (_, indice) => ({
      updateDimensionProperties: {
        range: { sheetId: 1, dimension: "ROWS", startIndex: indice, endIndex: indice + 1 },
        properties: { pixelSize: 30 },
        fields: "pixelSize",
      },
    }));
    const movimentos = [
      {
        moveDimension: {
          source: { sheetId: 1, dimension: "ROWS", startIndex: 3, endIndex: 4 },
          destinationIndex: 1,
        },
      },
      {
        moveDimension: {
          source: { sheetId: 1, dimension: "ROWS", startIndex: 2, endIndex: 3 },
          destinationIndex: 4,
        },
      },
    ];
    await enviarLotesGoogle("qa-planilha", "qa-acesso", [...anteriores, ...movimentos]);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.slice(-2)).toEqual(movimentos);
  });

  it("cria a linha e o marcador sem exigir vínculo de aluno", async () => {
    const lotes: unknown[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string, opcoes?: RequestInit) => {
        const url = new URL(String(entrada));
        if (url.pathname.endsWith("/developerMetadata:search")) {
          return Response.json({ matchedDeveloperMetadata: [] });
        }
        if (url.pathname.endsWith(":batchUpdate")) {
          const corpo = JSON.parse(String(opcoes?.body)) as { requests: unknown[] };
          lotes.push(corpo.requests);
          return Response.json({ replies: [] });
        }
        if (url.pathname.includes("/values/")) {
          return Response.json({ values: [["Data", "Aluno"]] });
        }
        if (url.searchParams.get("includeGridData") === "true") {
          return Response.json({
            sheets: [
              {
                data: [
                  {
                    rowData: [
                      { values: [{ formattedValue: "Data" }, { formattedValue: "Aluno" }] },
                    ],
                  },
                ],
              },
            ],
          });
        }
        return Response.json({
          spreadsheetId: "planilha-saidas",
          properties: { title: "Saídas", timeZone: "America/Fortaleza" },
          sheets: [
            {
              properties: {
                sheetId: 12,
                title: "Registro",
                gridProperties: { rowCount: 100, columnCount: 26 },
              },
            },
          ],
        });
      }),
    );
    const resultado = (await executarAcaoGoogle("planilha-saidas", "acesso", {
      acao: "aplicar",
      aba: "Registro",
      cabecalhoLinha: 1,
      assinatura: assinarAba("Registro", ["Data", "Aluno"], []),
      modoCompleto: false,
      operacoes: [
        {
          tipo: "criarLinhas",
          itens: [
            {
              linha: 2,
              celulas: [
                { coluna: 1, valor: "28/09/2026" },
                { coluna: 2, valor: "Aluna Sintética" },
              ],
            },
          ],
        },
      ],
    })) as Record<string, number>;
    expect(resultado.linhasCriadas).toBe(1);
    const texto = JSON.stringify(lotes);
    expect(texto).toContain("frequenciapp.linha");
    expect(texto).toContain("Aluna Sintética");
    expect(texto).not.toContain("frequenciapp.aluno");
  });
});
