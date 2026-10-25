// Cliente da base de feriados: páginas completas, sem vazar o token.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "token-super-secreto-da-base-de-feriados";
const SEGREDO = "segredo-ficticio-com-mais-de-32-caracteres";

function ambienteBase() {
  vi.stubEnv("DATABASE_URL", "postgresql://teste:teste@localhost:5432/teste");
  vi.stubEnv("AUTH_SECRET", SEGREDO);
  vi.stubEnv("FERIADOS_API_TOKEN", TOKEN);
  vi.stubEnv("FERIADOS_API_URL", "https://feriados.exemplo.test");
}

function item(indice: number) {
  const data = new Date(Date.UTC(2026, 0, 1 + indice));
  const dia = String(data.getUTCDate()).padStart(2, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return { data: `${dia}/${mes}/2026`, nome: `Feriado ${indice + 1}` };
}

function chamadaDe(mock: { mock: { calls: readonly (readonly unknown[])[] } }, indice = 0) {
  const chamada = mock.mock.calls[indice];
  const entrada = chamada?.[0];
  const init = chamada?.[1];
  if (typeof entrada !== "string" && !(entrada instanceof URL)) {
    throw new Error("A consulta não foi registrada.");
  }
  if (typeof init !== "object" || init === null) {
    throw new Error("A consulta não foi registrada.");
  }
  return { url: new URL(entrada), init: init as RequestInit };
}

function resposta(feriados: { data: string; nome: string }[], total?: number, status = 200) {
  return new Response(
    JSON.stringify({ feriados, ...(total === undefined ? {} : { meta: { total } }) }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function respostaDeErro(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  ambienteBase();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cliente da base de feriados", () => {
  it("lê o ano nacional e não coloca o token na URL", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
      return resposta(
        [
          { data: "21/04/2026", nome: "Tiradentes" },
          { data: "01/01/2026", nome: "Confraternização" },
        ],
        2,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).resolves.toEqual([
      { dia: "2026-01-01", nome: "Confraternização" },
      { dia: "2026-04-21", nome: "Tiradentes" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url: primeira, init } = chamadaDe(fetchMock);
    const cabecalhos = new Headers(init.headers);
    expect(primeira.origin).toBe("https://feriados.exemplo.test");
    expect(primeira.pathname).toBe("/api/v1/feriados/nacionais");
    expect(primeira.searchParams.get("ano")).toBe("2026");
    expect(primeira.searchParams.get("limit")).toBe("100");
    expect(primeira.searchParams.get("facultativos")).toBe("false");
    expect(primeira.toString()).not.toContain(TOKEN);
    expect(cabecalhos.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(init.redirect).toBe("manual");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("usa o município quando o IBGE está configurado e ignora a UF", async () => {
    vi.stubEnv("FERIADOS_UF", "ce");
    vi.stubEnv("FERIADOS_IBGE", "2304400");
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      resposta([{ data: "25/12/2026", nome: "Natal" }], 1),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { abrangenciaFeriados, buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    expect(abrangenciaFeriados()).toBe("municipais");
    await buscarFeriadosDoAno(2026);
    expect(chamadaDe(fetchMock).url.pathname).toBe("/api/v1/feriados/cidade/2304400");
  });

  it("usa a UF quando não há município", async () => {
    vi.stubEnv("FERIADOS_UF", "ce");
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      resposta([{ data: "25/03/2026", nome: "Data magna" }], 1),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { abrangenciaFeriados, buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    expect(abrangenciaFeriados()).toBe("estaduais");
    await buscarFeriadosDoAno(2026);
    expect(chamadaDe(fetchMock).url.pathname).toBe("/api/v1/feriados/estado/CE");
  });

  it("percorre a página seguinte quando a primeira vem cheia", async () => {
    const cheia = Array.from({ length: 100 }, (_, indice) => item(indice));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta(cheia, 101))
      .mockResolvedValueOnce(resposta([item(100)], 101));
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    const feriados = await buscarFeriadosDoAno(2026);
    expect(feriados).toHaveLength(101);
    expect(feriados[0]?.dia).toBe("2026-01-01");
    expect(feriados[100]?.dia).toBe("2026-04-11");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recusa a lista quando o total anunciado não chega", async () => {
    const cheia = Array.from({ length: 100 }, (_, indice) => item(indice));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resposta(cheia, 300))
      .mockResolvedValueOnce(resposta([], 300));
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "Não foi possível consultar os feriados agora. Tente novamente.",
    );
    const registrado = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(registrado).not.toContain(TOKEN);
    expect(registrado).toContain("paginação incompleta");
  });

  it("traduz falha de credencial e de rede sem repetir o token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("segredo interno", { status: 401 }))
      .mockRejectedValueOnce(new Error(`falha ${TOKEN}`));
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "A chave da base de feriados foi recusada. Confira o token da integração.",
    );
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "Não foi possível consultar os feriados agora. Tente novamente.",
    );
    const registrado = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(registrado).not.toContain(TOKEN);
    expect(registrado).not.toContain("segredo interno");
  });

  it("separa a chave inválida da recusa de plano e registra o motivo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaDeErro(401, { error: "Invalid API Key" }))
      .mockResolvedValueOnce(
        respostaDeErro(403, {
          error: "Upgrade required",
          message: "This endpoint is not available on the Free plan",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "A chave da base de feriados foi recusada. Confira o token da integração.",
    );
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "A base de feriados recusou a consulta. Confira o plano da integração.",
    );
    const registrado = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(registrado).toContain("HTTP 401: Invalid API Key");
    expect(registrado).toContain(
      "HTTP 403: Upgrade required - This endpoint is not available on the Free plan",
    );
    expect(registrado).not.toContain(TOKEN);
  });

  it("redige o token quando o motivo da recusa o repete", async () => {
    const fetchMock = vi.fn(async () => respostaDeErro(403, { error: `recusado para ${TOKEN}` }));
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "A base de feriados recusou a consulta. Confira o plano da integração.",
    );
    const registrado = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(registrado).toContain("recusado para ***");
    expect(registrado).not.toContain(TOKEN);
  });

  it("não segue redirecionamento", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno } = await import("@/infra/feriados-api");
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "Não foi possível consultar os feriados agora. Tente novamente.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recusa a consulta quando o token não foi configurado", async () => {
    vi.stubEnv("FERIADOS_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { buscarFeriadosDoAno, consultaFeriadosConfigurada } =
      await import("@/infra/feriados-api");
    expect(consultaFeriadosConfigurada()).toBe(false);
    await expect(buscarFeriadosDoAno(2026)).rejects.toThrow(
      "A consulta de feriados não está configurada.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aceita a base local e recusa endereço inseguro ou com caminho", async () => {
    vi.stubEnv("FERIADOS_API_URL", "http://127.0.0.1:4010");
    const { ambiente } = await import("@/infra/ambiente");
    expect(ambiente.feriados.url).toBe("http://127.0.0.1:4010");

    vi.resetModules();
    vi.stubEnv("FERIADOS_API_URL", "http://feriadosapi.com");
    await expect(import("@/infra/ambiente")).rejects.toThrow("Configuração de ambiente inválida");

    vi.resetModules();
    vi.stubEnv("FERIADOS_API_URL", "https://feriadosapi.com/api");
    await expect(import("@/infra/ambiente")).rejects.toThrow("Configuração de ambiente inválida");
  });
});
