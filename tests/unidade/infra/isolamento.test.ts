// Recusa fixtures antes da primeira conexão, inclusive em execuções filtradas.
import { afterEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { exigirIsolamento } from "../../helpers/isolamento.mjs";
import { comBanco } from "../../ponta-a-ponta/helpers/banco";

const { connect, end, query } = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  end: vi.fn(async () => undefined),
  query: vi.fn(async () => ({ rows: [{ uso: true }] })),
}));
vi.mock("pg", () => ({
  default: {
    Client: vi.fn(function () {
      return { connect, end, query };
    }),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("isolamento das fixtures", () => {
  it("não aceita URLs locais e opt-in sem prova do provisionador", () => {
    expect(() =>
      exigirIsolamento({
        NODE_ENV: "test",
        FREQUENCIAPP_ISOLAMENTO: "1",
        DATABASE_URL: "postgresql://teste:teste@127.0.0.1:5432/teste",
        DIRECT_URL: "postgresql://teste:teste@127.0.0.1:5432/teste",
        APP_URL: "http://127.0.0.1:3000",
        TEST_BASE_URL: "http://127.0.0.1:3000",
      }),
    ).toThrow(/isolamento/i);
  });
  it("recusa configuração ausente antes de criar cliente, conectar ou limpar", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DIRECT_URL", "");
    vi.stubEnv("FREQUENCIAPP_ISOLAMENTO", "");
    const limpar = vi.fn(async () => undefined);
    const erro = await comBanco(limpar).then(
      () => null,
      (erro: unknown) => erro,
    );
    expect(erro).toBeInstanceOf(Error);
    expect(pg.Client).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(limpar).not.toHaveBeenCalled();
  });
});
