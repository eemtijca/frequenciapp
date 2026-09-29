// Testa cópia e restauração em uma planilha sintética sem chamar o Google real.
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarCopiaGoogle, restaurarCopiaGoogle } from "@/infra/google-planilhas-copias";
import type { DocumentoGoogle } from "@/infra/google-planilhas-api";

afterEach(() => vi.unstubAllGlobals());

function planilha(): DocumentoGoogle {
  return {
    spreadsheetId: "planilha-de-teste",
    properties: { title: "Teste" },
    sheets: [
      {
        properties: {
          sheetId: 7,
          title: "Turma",
          gridProperties: { rowCount: 100, columnCount: 26, frozenRowCount: 1 },
        },
      },
      {
        properties: {
          sheetId: 8,
          title: "_frequenciapp_backup_Turma_20260928-180000-000",
          hidden: true,
          gridProperties: { rowCount: 80, columnCount: 20, frozenRowCount: 1 },
        },
        merges: [{ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }],
      },
    ],
  };
}

function googleFalso(doc: DocumentoGoogle) {
  const lotes: { requests: Record<string, unknown>[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_entrada: URL | string, opcoes?: RequestInit) => {
      if (opcoes?.method !== "POST") return Response.json(doc);
      const lote = JSON.parse(String(opcoes.body)) as { requests: Record<string, unknown>[] };
      lotes.push(lote);
      for (const pedido of lote.requests) {
        const duplicacao = pedido.duplicateSheet as
          { newSheetId: number; newSheetName: string } | undefined;
        if (duplicacao) {
          doc.sheets.push({
            properties: {
              sheetId: duplicacao.newSheetId,
              title: duplicacao.newSheetName,
              hidden: true,
              gridProperties: { rowCount: 100, columnCount: 26 },
            },
          });
        }
      }
      return Response.json({ replies: lote.requests.map(() => ({})) });
    }),
  );
  return lotes;
}

describe("cópias pela Sheets API", () => {
  it("duplica a aba e a oculta antes de marcar a cópia", async () => {
    const lotes = googleFalso(planilha());
    const nome = await criarCopiaGoogle("planilha-de-teste", "acesso", "Turma");
    expect(nome).toMatch(/^_frequenciapp_backup_Turma_\d{8}-\d{6}-\d{3}$/);
    expect(lotes[0]?.requests[0]).toMatchObject({
      duplicateSheet: { sourceSheetId: 7, newSheetName: nome },
    });
    expect(lotes[0]?.requests[1]).toMatchObject({
      updateSheetProperties: { properties: { hidden: true } },
    });
    expect(lotes[1]?.requests[0]).toMatchObject({
      createDeveloperMetadata: { developerMetadata: { metadataKey: "frequenciapp.copia" } },
    });
  });

  it("restaura dentro da mesma aba e preserva seu identificador", async () => {
    const lotes = googleFalso(planilha());
    const resultado = await restaurarCopiaGoogle(
      "planilha-de-teste",
      "acesso",
      "Turma",
      "_frequenciapp_backup_Turma_20260928-180000-000",
    );
    expect(resultado.aba).toBe("Turma");
    const restauracao = lotes.find((lote) => lote.requests.some((pedido) => "copyPaste" in pedido));
    expect(restauracao?.requests).toContainEqual(
      expect.objectContaining({
        copyPaste: expect.objectContaining({
          source: expect.objectContaining({ sheetId: 8 }),
          destination: expect.objectContaining({ sheetId: 7 }),
          pasteType: "PASTE_NORMAL",
        }),
      }),
    );
    expect(restauracao?.requests).toContainEqual({
      mergeCells: {
        range: {
          sheetId: 7,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        mergeType: "MERGE_ALL",
      },
    });
  });
});
