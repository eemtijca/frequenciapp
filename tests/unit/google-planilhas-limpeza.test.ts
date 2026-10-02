// Limpeza das cópias antigas com Google simulado, preservando turmas e abas manuais.
import { afterEach, describe, expect, it, vi } from "vitest";
import { listarAbasBackupGoogle, removerAbasBackupGoogle } from "@/infra/google-planilhas-limpeza";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const antiga = "_frequenciapp_backup_2º A_20260930-130258-674";
function preparar(comMarcador = true) {
  const pedidos: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: URL | string, opcoes?: RequestInit) => {
      if (String(entrada).includes("developerMetadata:search"))
        return Response.json({ matchedDeveloperMetadata: [] });
      if (opcoes?.method === "POST") {
        pedidos.push(
          ...(JSON.parse(String(opcoes.body)) as { requests: Record<string, unknown>[] }).requests,
        );
        return Response.json({ replies: [] });
      }
      return Response.json({
        spreadsheetId: "arquivo",
        properties: { title: "QA" },
        sheets: [
          { properties: { sheetId: 1, title: "2º A" } },
          {
            properties: { sheetId: 2, title: antiga, hidden: true },
            developerMetadata: comMarcador
              ? [
                  {
                    metadataId: 1,
                    metadataKey: "frequenciapp.copia",
                    metadataValue: "1",
                    location: { sheetId: 2 },
                  },
                ]
              : [],
          },
          { properties: { sheetId: 3, title: "_frequenciapp_backup_anotação" } },
          { properties: { sheetId: 4, title: "_frequenciapp_backup_manual_20260930-130258-674" } },
        ],
      });
    }),
  );
  return pedidos;
}
describe("limpeza das antigas cópias Google", () => {
  it("lista apenas cópias com carimbo e marcador da integração", async () => {
    const pedidos = preparar();
    await expect(listarAbasBackupGoogle("arquivo", "acesso")).resolves.toEqual({
      copias: [antiga],
    });
    expect(pedidos).toEqual([]);
  });
  it("remove somente as cópias conferidas, preservando todas as abas normais", async () => {
    const pedidos = preparar();
    await expect(removerAbasBackupGoogle("arquivo", "acesso", [antiga])).resolves.toEqual({
      removidas: 1,
    });
    expect(pedidos).toEqual([{ deleteSheet: { sheetId: 2 } }]);
  });
  it("recusa apagar uma aba com nome de backup sem o marcador", async () => {
    const pedidos = preparar(false);
    await expect(removerAbasBackupGoogle("arquivo", "acesso", [antiga])).rejects.toThrow(
      "As cópias mudaram",
    );
    expect(pedidos).toEqual([]);
  });
  it("recusa remover uma turma ou uma lista alterada depois da prévia", async () => {
    const pedidos = preparar();
    await expect(removerAbasBackupGoogle("arquivo", "acesso", [antiga, "2º A"])).rejects.toThrow(
      "As cópias mudaram",
    );
    expect(pedidos).toEqual([]);
  });
});
