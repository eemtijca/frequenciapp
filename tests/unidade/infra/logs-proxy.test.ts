// Caracteriza o retorno OAuth com marcadores fictícios; não examina nem valida logs de proxy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ trocar: vi.fn(), conferir: vi.fn(), gravar: vi.fn(), log: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "cookie-ficticio" }), delete: vi.fn() }),
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({ integracaoPlanilha: { findUnique: async () => null } }),
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: async (acao: (tx: unknown) => Promise<unknown>) =>
    acao({ integracaoPlanilha: { upsert: h.gravar } }),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/infra/ambiente", () => ({
  ambiente: { google: { redirectUri: "https://app.escola.exemplo/api/planilha/google/retorno" } },
}));
vi.mock("@/infra/google/oauth", () => ({
  conferirEstado: h.conferir,
  trocarCodigo: h.trocar,
  cifrarToken: () => "cifrado-ficticio",
}));
vi.mock("@/infra/http", () => ({ exigirAdmin: async () => ({ ok: true, usuario: { id: "u" } }) }));
vi.mock("@/application/planilha-comum", () => ({ idDaIntegracao: () => "chamadas" }));
vi.mock("@/application/planilha-reconexao", () => ({ concluirReconexaoGoogle: vi.fn() }));
import { GET } from "@/app/api/planilha/google/retorno/route";
beforeEach(() => {
  vi.clearAllMocks();
  h.trocar.mockResolvedValue("CANARIO_REFRESH");
  h.conferir.mockReturnValue({ verifier: "verificador-ficticio", finalidade: "chamadas" });
  vi.spyOn(console, "error").mockImplementation(h.log);
  vi.spyOn(console, "warn").mockImplementation(h.log);
});
afterEach(() => vi.restoreAllMocks());
describe("caracterização de URLs no retorno OAuth", () => {
  for (const modo of ["sucesso", "erro", "cancelado"]) {
    it(`não propaga canários no redirecionamento de ${modo}`, async () => {
      if (modo === "erro") h.trocar.mockRejectedValue(new Error("CANARIO_ERRO"));
      const resposta = await GET(
        new Request(
          `https://app.escola.exemplo/api/planilha/google/retorno?code=CANARIO_CODE&state=CANARIO_STATE${modo === "cancelado" ? "&error=CANARIO_ERRO" : ""}`,
        ),
      );
      expect(resposta.status).toBe(302);
      const local = resposta.headers.get("location") ?? "";
      expect(new URL(local).pathname).toBe("/");
      expect(new URL(local).searchParams.get("google")).toBe(
        modo === "sucesso" ? "conectado" : modo,
      );
      expect(local).not.toMatch(/CANARIO|code=|state=/);
      expect(h.log).not.toHaveBeenCalled();
      expect(h.conferir).toHaveBeenCalledWith("cookie-ficticio", "CANARIO_STATE", "u");
      if (modo !== "cancelado")
        expect(h.trocar).toHaveBeenCalledWith("CANARIO_CODE", "verificador-ficticio");
    });
  }
});
