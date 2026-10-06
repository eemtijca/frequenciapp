// OAuth da planilha: estado vinculado à sessão, PKCE, cifra e recusa de
// respostas inválidas sem expor credenciais.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

const SEGREDO_TESTE = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";

function assinarEstadoDeTeste(dados: Record<string, unknown>): string {
  const texto = Buffer.from(JSON.stringify(dados)).toString("base64url");
  const chave = createHash("sha256").update(`oauth-estado:${SEGREDO_TESTE}`).digest();
  const assinatura = createHmac("sha256", chave).update(texto).digest("base64url");
  return `${texto}.${assinatura}`;
}

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", SEGREDO_TESTE);
  vi.stubEnv("GOOGLE_CLIENT_ID", "cliente.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo-google-de-teste");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.exemplo.test/api/planilha/google/retorno");
  vi.stubEnv("GOOGLE_PICKER_API_KEY", "chave-de-teste");
  vi.stubEnv("GOOGLE_PROJECT_NUMBER", "123456789012");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

  it.each([undefined, "2026-10"])("assina o vínculo da reconexão e o mês %s", async (mes) => {
    const { conferirEstado, iniciarAutorizacao } = await import("@/infra/google-oauth");
    const admin = "00000000-0000-4000-8000-000000000001";
    const reconexao = { vinculo: "a".repeat(64), ...(mes ? { mes } : {}) };
    const pedido = iniciarAutorizacao(admin, "FREQUENCIA", { reconexao });
    const url = new URL(pedido.url);
    expect(conferirEstado(pedido.cookie, url.searchParams.get("state") ?? "", admin)).toEqual({
      verifier: expect.any(String),
      finalidade: "FREQUENCIA",
      reconexao,
    });
    expect(pedido.url).not.toContain(reconexao.vinculo);
  });

  it("rejeita a troca do vínculo e do mês no estado assinado", async () => {
    const { conferirEstado, iniciarAutorizacao } = await import("@/infra/google-oauth");
    const admin = "00000000-0000-4000-8000-000000000001";
    const pedido = iniciarAutorizacao(admin, "FREQUENCIA", {
      reconexao: { vinculo: "a".repeat(64), mes: "2026-10" },
    });
    const [texto, assinatura] = pedido.cookie.split(".");
    const dados = JSON.parse(Buffer.from(texto ?? "", "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    for (const reconexao of [
      { vinculo: "b".repeat(64), mes: "2026-10" },
      { vinculo: "a".repeat(64), mes: "2026-11" },
    ]) {
      const alterado = Buffer.from(JSON.stringify({ ...dados, reconexao })).toString("base64url");
      expect(() =>
        conferirEstado(
          `${alterado}.${assinatura}`,
          new URL(pedido.url).searchParams.get("state") ?? "",
          admin,
        ),
      ).toThrow("não pôde ser confirmada");
    }
  });

  it.each([
    { vinculo: "arquivo" },
    { vinculo: "g".repeat(64) },
    { vinculo: "a".repeat(64), mes: "2026-13" },
    { vinculo: "a".repeat(64), mes: "10/2026" },
  ])("rejeita reconexão malformada mesmo com assinatura válida: %o", async (reconexao) => {
    const { conferirEstado, iniciarAutorizacao } = await import("@/infra/google-oauth");
    const admin = "00000000-0000-4000-8000-000000000001";
    expect(() => iniciarAutorizacao(admin, "FREQUENCIA", { reconexao })).toThrow(
      "Confira a conexão Google",
    );
    const cookie = assinarEstadoDeTeste({
      adminId: admin,
      finalidade: "FREQUENCIA",
      state: "estado",
      verifier: "verificador",
      expiraEm: Date.now() + 60_000,
      reconexao,
    });
    expect(() => conferirEstado(cookie, "estado", admin)).toThrow("conexão Google expirou");
  });

  it("rejeita estado de reconexão vencido", async () => {
    const { conferirEstado } = await import("@/infra/google-oauth");
    const admin = "00000000-0000-4000-8000-000000000001";
    const cookie = assinarEstadoDeTeste({
      adminId: admin,
      finalidade: "FREQUENCIA",
      state: "estado",
      verifier: "verificador",
      expiraEm: Date.now() - 1,
      reconexao: { vinculo: "a".repeat(64), mes: "2026-10" },
    });
    expect(() => conferirEstado(cookie, "estado", admin)).toThrow("conexão Google expirou");
  });

  it("cifra o token persistente e rejeita adulteração", async () => {
    const { cifrarToken, decifrarToken } = await import("@/infra/google-oauth");
    const cifrado = cifrarToken("token-google-de-teste");
    expect(cifrado).not.toContain("token-google-de-teste");
    expect(decifrarToken(cifrado)).toBe("token-google-de-teste");
    const partes = cifrado.split(".");
    const tag = partes[1] ?? "";
    partes[1] = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decifrarToken(partes.join("."))).toThrow("conexão Google precisa ser refeita");
    expect(() => decifrarToken(partes.join("."))).toThrow(
      expect.objectContaining({ status: 409, codigo: "GOOGLE_RECONECTAR" }),
    );
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

  it.each([
    [400, "invalid_grant", 409, "GOOGLE_RECONECTAR"],
    [401, "invalid_client", 503, "GOOGLE_CONFIGURACAO"],
    [400, "unauthorized_client", 503, "GOOGLE_CONFIGURACAO"],
    [400, "invalid_scope", 503, "GOOGLE_CONFIGURACAO"],
    [400, "temporarily_unavailable", 502, "GOOGLE_TEMPORARIO"],
    [400, "server_error", 502, "GOOGLE_TEMPORARIO"],
    [429, "temporarily_unavailable", 503, "GOOGLE_TEMPORARIO"],
    [500, "server_error", 503, "GOOGLE_TEMPORARIO"],
    [503, "invalid_grant", 503, "GOOGLE_TEMPORARIO"],
    [403, "detalhe-com-segredo", 502, "GOOGLE_TEMPORARIO"],
  ] as const)(
    "classifica HTTP %i e %s sem expirar a sessão ou repetir o pedido",
    async (httpGoogle, error, status, codigo) => {
      const { cifrarToken, renovarAcesso } = await import("@/infra/google-oauth");
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const chamada = vi.fn(async () =>
        Response.json(
          { error, error_description: "descrição com renovacao-secreta e segredo-google-de-teste" },
          { status: httpGoogle },
        ),
      );
      vi.stubGlobal("fetch", chamada);
      await expect(renovarAcesso(cifrarToken("renovacao-secreta"))).rejects.toMatchObject({
        status,
        codigo,
      });
      expect(chamada).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledOnce();
      const registro = JSON.stringify(log.mock.calls);
      for (const sensivel of [
        "renovacao-secreta",
        "segredo-google-de-teste",
        "descrição com",
        "detalhe-com-segredo",
      ]) {
        expect(registro).not.toContain(sensivel);
      }
    },
  );

  it.each([200, 400, 503])("trata JSON inválido em HTTP %i sem expor o corpo", async (status) => {
    const { cifrarToken, renovarAcesso } = await import("@/infra/google-oauth");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("segredo-invalido", { status })),
    );
    await expect(renovarAcesso(cifrarToken("renovacao-de-teste"))).rejects.toMatchObject({
      status: status >= 500 ? 503 : 502,
      codigo: "GOOGLE_TEMPORARIO",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo-invalido");
  });

  it("trata sucesso sem token como indisponibilidade temporária", async () => {
    const { cifrarToken, renovarAcesso } = await import("@/infra/google-oauth");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "" })),
    );
    await expect(renovarAcesso(cifrarToken("renovacao-de-teste"))).rejects.toMatchObject({
      status: 502,
      codigo: "GOOGLE_TEMPORARIO",
    });
  });

  it("trata falha de rede sem registrar o erro externo nem repetir o pedido", async () => {
    const { cifrarToken, renovarAcesso } = await import("@/infra/google-oauth");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const chamada = vi.fn(async () => {
      throw new Error("falha com renovacao-secreta");
    });
    vi.stubGlobal("fetch", chamada);
    await expect(renovarAcesso(cifrarToken("renovacao-secreta"))).rejects.toMatchObject({
      status: 502,
      codigo: "GOOGLE_TEMPORARIO",
    });
    expect(chamada).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith("[google-oauth] sem resposta: falha_de_rede");
  });

  it("distingue a configuração incompleta sem consultar o Google", async () => {
    const { ambiente } = await import("@/infra/ambiente");
    const { iniciarAutorizacao } = await import("@/infra/google-oauth");
    const original = ambiente.google.clientSecret;
    const chamada = vi.fn();
    vi.stubGlobal("fetch", chamada);
    try {
      ambiente.google.clientSecret = undefined;
      expect(() => iniciarAutorizacao("00000000-0000-4000-8000-000000000001")).toThrow(
        expect.objectContaining({ status: 503, codigo: "GOOGLE_CONFIGURACAO" }),
      );
      expect(chamada).not.toHaveBeenCalled();
    } finally {
      ambiente.google.clientSecret = original;
    }
  });
});
