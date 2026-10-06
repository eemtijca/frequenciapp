// A remoção da aba padrão exige leitura completa, sem valores, fórmulas, notas ou gráficos.
import { afterEach, describe, expect, it, vi } from "vitest";
import { abaVaziaGoogle } from "@/infra/google-planilhas-api";

afterEach(() => vi.unstubAllGlobals());

describe("leitura de aba vazia", () => {
  it.each([
    { celula: {}, vazia: true },
    { celula: { userEnteredValue: { numberValue: 0 } }, vazia: false },
    { celula: { userEnteredValue: { boolValue: false } }, vazia: false },
    { celula: { userEnteredValue: { formulaValue: '=IF(TRUE,"","")' } }, vazia: false },
    { celula: { note: "QA Nota em célula sem valor" }, vazia: false },
  ])("confere conteúdo não exibido: $celula", async ({ celula, vazia }) => {
    const chamada = vi.fn(async (entrada: URL | string) => {
      const url = new URL(String(entrada));
      expect(url.searchParams.get("ranges")).toBe("'Sheet1'");
      expect(url.searchParams.get("includeGridData")).toBe("true");
      expect(url.searchParams.get("fields")).toContain("note");
      return Response.json({
        sheets: [
          {
            properties: { sheetId: 1, title: "Sheet1" },
            data: [{ startRow: 999, startColumn: 25, rowData: [{ values: [celula] }] }],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", chamada);
    expect(await abaVaziaGoogle("qa", "acesso", "Sheet1", 1)).toBe(vazia);
  });

  it("preserva uma aba sem células, mas com gráfico", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        sheets: [
          {
            properties: { sheetId: 1, title: "Sheet1" },
            charts: [{ chartId: 2 }],
          },
        ],
      }),
    );
    expect(await abaVaziaGoogle("qa", "acesso", "Sheet1", 1)).toBe(false);
  });

  it("não considera vazia uma resposta ausente ou com identidade diferente", async () => {
    for (const sheets of [[], [{ properties: { sheetId: 2, title: "Sheet1" } }]]) {
      vi.stubGlobal("fetch", async () => Response.json({ sheets }));
      await expect(abaVaziaGoogle("qa", "acesso", "Sheet1", 1)).rejects.toThrow("conferir");
    }
  });
});
