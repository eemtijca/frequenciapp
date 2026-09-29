// Abas e cópias pela Sheets API: proteção da aba manual e comandos enviados.
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarAbaGoogle, removerAbaGoogle } from "@/infra/google-planilhas-abas";
import { copiasDaAbaGoogle } from "@/infra/google-planilhas-copias";
import type { DocumentoGoogle } from "@/infra/google-planilhas-api";

afterEach(() => vi.unstubAllGlobals());

const documento: DocumentoGoogle = {
  spreadsheetId: "planilha-de-teste",
  properties: { title: "Teste" },
  sheets: [
    {
      properties: {
        sheetId: 7,
        title: "Turma",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
    },
    {
      properties: {
        sheetId: 8,
        title: "Outra",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
    },
  ],
};

describe("abas da Sheets API", () => {
  it("cria aba, cabeçalho e marcador no mesmo lote", async () => {
    const lotes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string, opcoes?: RequestInit) => {
        if (String(entrada).endsWith("/developerMetadata:search")) {
          return Response.json({ matchedDeveloperMetadata: [] });
        }
        if (opcoes?.method === "POST") {
          lotes.push(JSON.parse(String(opcoes.body)) as unknown);
          return Response.json({ replies: [] });
        }
        return Response.json(documento);
      }),
    );
    expect(await criarAbaGoogle("planilha-de-teste", "acesso", "Nova")).toEqual({ aba: "Nova" });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({
      requests: [
        { addSheet: { properties: { title: "Nova" } } },
        { createDeveloperMetadata: { developerMetadata: { metadataKey: "frequenciapp.aba" } } },
        {
          updateCells: {
            rows: [
              {
                values: [
                  { userEnteredValue: { stringValue: "Aluno" } },
                  { userEnteredValue: { stringValue: "Turma atual" } },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  it("não remove aba sem marcador da integração", async () => {
    const chamada = vi.fn(async (entrada: URL | string) =>
      Response.json(
        String(entrada).endsWith("/developerMetadata:search")
          ? { matchedDeveloperMetadata: [] }
          : documento,
      ),
    );
    vi.stubGlobal("fetch", chamada);
    await expect(removerAbaGoogle("planilha-de-teste", "acesso", "Turma")).rejects.toThrow(
      "não foi criada pela integração",
    );
    expect(chamada).toHaveBeenCalledTimes(2);
  });

  it("separa cópias de abas com nomes parecidos", () => {
    const comCopias: DocumentoGoogle = {
      ...documento,
      sheets: [
        ...documento.sheets,
        {
          properties: {
            sheetId: 9,
            title: "_frequenciapp_backup_Turma_20260928-183000-000",
            gridProperties: {},
          },
        },
        {
          properties: {
            sheetId: 10,
            title: "_frequenciapp_backup_Turma B_20260928-183000-000",
            gridProperties: {},
          },
        },
      ],
    };
    expect(copiasDaAbaGoogle(comCopias, "Turma").map((item) => item.properties.sheetId)).toEqual([
      9,
    ]);
  });
});
