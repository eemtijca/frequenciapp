import { afterEach, describe, expect, it, vi } from "vitest";

// Carrega os contratos reais com hooks e cliente sintéticos: nunca abre rede ou banco.
async function carregar(caminho: string) {
  vi.resetModules();
  const hooks: { before?: () => Promise<void>; after?: () => Promise<void> } = {};
  const casos = new Map<string, () => Promise<void>>();
  const registrar = (nome: string, fn: () => Promise<void>) => casos.set(nome, fn);
  registrar.each = () => () => undefined;
  const query = vi.fn(async (..._args: unknown[]) => ({
    rows: [{ id: "00000000-0000-4000-8000-000000000001" }],
    rowCount: 1,
  }));
  const connect = vi.fn(async () => undefined);
  const end = vi.fn(async () => undefined);
  const selecionar = vi.fn(async () => undefined);
  const criar = vi.fn(async (..._args: unknown[]) => undefined);
  const remover = vi.fn(async (..._args: unknown[]) => undefined);
  vi.doMock("vitest", async (original) => ({
    ...(await original<typeof import("vitest")>()),
    beforeAll: (fn: () => Promise<void>) => {
      hooks.before = fn;
    },
    beforeEach: () => undefined,
    afterAll: (fn: () => Promise<void>) => {
      hooks.after = fn;
    },
    describe: (_nome: string, fn: () => void) => fn(),
    it: registrar,
  }));
  vi.doMock("pg", () => ({
    default: {
      Client: class {
        connect = connect;
        end = end;
        query = query;
      },
    },
  }));
  vi.doMock("@/infra/schema-postgres.mjs", () => ({ selecionarSchema: selecionar }));
  vi.doMock("../helpers/isolamento.mjs", () => ({ verificarIsolamento: async () => ({}) }));
  vi.doMock("../helpers/feriados-banco", () => ({
    conferirConexaoFixture: () => undefined,
    lerFeriados: async () => [],
    lerDiasComFrequencia: async () => [],
    criarFeriadoDaFixture: criar,
    removerFeriadoDaFixture: remover,
  }));
  vi.stubEnv("DATABASE_URL", "postgres://fixture:fixture@localhost/fixture?schema=fixture");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status: 200, headers: new Headers({ "set-cookie": "s=x" }) })),
  );
  await import(caminho);
  if (!hooks.before || !hooks.after) throw new Error("Hooks não encontrados");
  return {
    before: hooks.before,
    after: hooks.after,
    casos,
    query,
    connect,
    end,
    selecionar,
    criar,
    remover,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("vitest");
  vi.doUnmock("pg");
  vi.doUnmock("../helpers/isolamento.mjs");
  vi.doUnmock("@/infra/schema-postgres.mjs");
  vi.doUnmock("../helpers/feriados-banco");
});

describe("segurança dos hooks das fixtures", () => {
  it.each([
    "../api/chamada/sabado-letivo.test.ts",
    "../api/chamada/justificativas-antecipadas.test.ts",
    "../api/gestao/diretores.test.ts",
  ])("não limpa schema não selecionado e preserva falha de seleção em %s", async (caminho) => {
    const f = await carregar(caminho);
    const falha = new Error("seleção");
    f.selecionar.mockRejectedValueOnce(falha);
    f.end.mockRejectedValueOnce(new Error("encerramento"));
    await expect(f.before()).rejects.toBe(falha);
    await f.after().catch(() => undefined);
    expect(f.query).not.toHaveBeenCalled();
    expect(f.end).toHaveBeenCalled();
  });

  it("tenta limpar feriado de commit incerto mesmo se outra limpeza falhar e fecha sem mascarar", async () => {
    const f = await carregar("../api/chamada/justificativas-antecipadas.test.ts");
    await f.before();
    const criacao = new Error("resultado incerto após commit");
    f.criar.mockRejectedValueOnce(criacao);
    const caso = f.casos.get(
      "grava o período sem domingos ou feriados e recusa sobreposição sem gravar parte do lote",
    );
    if (!caso) throw new Error("Caso não encontrado");
    await expect(caso()).rejects.toBe(criacao);
    const falhaLimpeza = new Error("limpeza de frequências");
    f.query.mockRejectedValueOnce(falhaLimpeza);
    f.end.mockRejectedValueOnce(new Error("encerramento"));
    await expect(f.after()).rejects.toBe(falhaLimpeza);
    expect(f.remover).toHaveBeenCalledOnce();
    expect(f.remover.mock.calls[0]?.slice(1)).toEqual(f.criar.mock.calls[0]?.slice(1));
    expect(f.remover.mock.calls[0]?.slice(1)).toEqual([
      expect.any(String),
      expect.stringMatching(/^QA Antecipadas /),
    ]);
    expect(
      f.query.mock.calls.some(([sql]) => String(sql).includes("delete from justificativas")),
    ).toBe(true);
    expect(f.end).toHaveBeenCalledTimes(2);
    expect(f.end.mock.contexts[0]).toBe(f.remover.mock.calls[0]?.[0]);
    expect(f.end.mock.contexts[1]).not.toBe(f.end.mock.contexts[0]);
  });

  it("fecha o sábado mesmo quando a limpeza falha e preserva essa falha", async () => {
    const f = await carregar("../api/chamada/sabado-letivo.test.ts");
    await f.before();
    const falha = new Error("limpeza");
    f.query.mockRejectedValueOnce(falha);
    f.end.mockRejectedValueOnce(new Error("encerramento"));
    await expect(f.after()).rejects.toBe(falha);
    expect(f.end).toHaveBeenCalledOnce();
  });
});
