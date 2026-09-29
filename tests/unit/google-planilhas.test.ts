// Seleção Google: só aceita planilha acessível e resposta com estrutura válida.
import { afterEach, describe, expect, it, vi } from "vitest";
import { lerPlanilhaEscolhida } from "@/infra/google-planilhas";

afterEach(() => vi.unstubAllGlobals());

describe("planilha escolhida", () => {
  it("confere o identificador com a API do Sheets", async () => {
    const chamada = vi.fn(async (_url: URL, opcoes: RequestInit) => {
      expect(opcoes.headers).toEqual({ Authorization: "Bearer acesso-de-teste" });
      return Response.json({
        spreadsheetId: "arquivo123456",
        properties: { title: "Frequência", timeZone: "America/Fortaleza" },
        sheets: [{ properties: { title: "3 ano A", sheetId: 1 } }],
      });
    });
    vi.stubGlobal("fetch", chamada);
    const planilha = await lerPlanilhaEscolhida("arquivo123456", "acesso-de-teste");
    expect(planilha.properties.title).toBe("Frequência");
    expect(chamada).toHaveBeenCalledOnce();
  });

  it("recusa arquivo sem acesso sem divulgar o token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("proibido", { status: 403 })),
    );
    await expect(lerPlanilhaEscolhida("arquivo123456", "acesso-de-teste")).rejects.toThrow(
      "não tem acesso",
    );
  });
});
