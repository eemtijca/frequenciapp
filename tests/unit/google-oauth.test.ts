// OAuth da planilha: estado vinculado à sessão, PKCE, cifra e recusa de
// respostas inválidas sem expor credenciais.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres");
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo-google-de-teste");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.exemplo.test/api/planilha/google/retorno");
  vi.stubEnv("GOOGLE_PICKER_API_KEY", "chave-de-teste");
  vi.stubEnv("GOOGLE_PROJECT_NUMBER", "123456789012");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuth da planilha", () => {
  it("assina o estado e vincula PKCE e administrador", async () => {
    const { conferirEstado, iniciarAutorizacao } = await import("@/infra/google-oauth");
    const admin = "00000000-0000-4000-8000-000000000001";
    const pedido = iniciarAutorizacao(admin);
    const url = new URL(pedido.url);
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(conferirEstado(pedido.cookie, url.searchParams.get("state") ?? "", admin)).toEqual({
      verifier: expect.stringMatching(/^[\w-]+$/),
      finalidade: "FREQUENCIA",
    });
    expect(() => conferirEstado(pedido.cookie, "outro-estado", admin)).toThrow();
    expect(() =>
      conferirEstado(
        pedido.cookie,
        url.searchParams.get("state") ?? "",
        "00000000-0000-4000-8000-000000000002",
      ),
    ).toThrow();
    expect(() =>
      conferirEstado(`${pedido.cookie}x`, url.searchParams.get("state") ?? "", admin),
    ).toThrow();
  });

  it.each(["SAIDAS", "PARCIAL"] as const)(
    "vincula a autorização à finalidade %s",
    async (finalidade) => {
      const { conferirEstado, iniciarAutorizacao } = await import("@/infra/google-oauth");
      const admin = "00000000-0000-4000-8000-000000000001";
      const pedido = iniciarAutorizacao(admin, finalidade);
      const estado = new URL(pedido.url).searchParams.get("state") ?? "";
      expect(conferirEstado(pedido.cookie, estado, admin).finalidade).toBe(finalidade);
    },
  );

  it("cifra o token persistente e rejeita adulteração", async () => {
    const { cifrarToken, decifrarToken } = await import("@/infra/google-oauth");
    const cifrado = cifrarToken("token-google-de-teste");
    expect(cifrado).not.toContain("token-google-de-teste");
    expect(decifrarToken(cifrado)).toBe("token-google-de-teste");
    const partes = cifrado.split(".");
    const tag = partes[1] ?? "";
    partes[1] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decifrarToken(partes.join("."))).toThrow("conexão Google precisa ser refeita");
  });

  it("troca o código sem enviar o segredo no endereço", async () => {
    const { trocarCodigo } = await import("@/infra/google-oauth");
    const chamada = vi.fn(async (_url: string, opcoes: RequestInit) => {
      expect(opcoes.method).toBe("POST");
      expect(String(opcoes.body)).toContain("code_verifier=verificador");
      return Response.json({ access_token: "acesso", refresh_token: "renovacao" });
    });
    vi.stubGlobal("fetch", chamada);
    expect(await trocarCodigo("codigo", "verificador")).toBe("renovacao");
    expect(chamada).toHaveBeenCalledOnce();
    expect(String(chamada.mock.calls[0]?.[0])).not.toContain("segredo-google-de-teste");
  });

  it("recusa autorização sem token de atualização", async () => {
    const { trocarCodigo } = await import("@/infra/google-oauth");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "temporario" })),
    );
    await expect(trocarCodigo("codigo", "verificador")).rejects.toThrow(
      "Google não autorizou acesso contínuo",
    );
  });

  it("renova o acesso com o token cifrado", async () => {
    const { cifrarToken, renovarAcesso } = await import("@/infra/google-oauth");
    const chamada = vi.fn(async (_url: string, opcoes: RequestInit) => {
      const corpo = new URLSearchParams(String(opcoes.body));
      expect(corpo.get("grant_type")).toBe("refresh_token");
      expect(corpo.get("refresh_token")).toBe("renovacao-de-teste");
      return Response.json({ access_token: "acesso-renovado" });
    });
    vi.stubGlobal("fetch", chamada);
    expect(await renovarAcesso(cifrarToken("renovacao-de-teste"))).toBe("acesso-renovado");
  });
});
