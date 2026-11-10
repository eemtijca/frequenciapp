import pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { comBanco } from "../ponta-a-ponta/helpers/banco";

it("não mascara erro da operação quando fechamento da conexão falha", async () => {
  const original = new Error("operação");
  const cliente = new pg.Client();
  cliente.connect = vi.fn(async () => {}) as unknown as typeof cliente.connect;
  const fechamento = new Error("fechamento");
  cliente.end = vi.fn(async () => {
    throw fechamento;
  }) as typeof cliente.end;
  cliente.query = vi.fn(async (sql: string) =>
    sql.includes("has_schema_privilege") ? { rows: [{ uso: true }] } : { rows: [] },
  ) as unknown as typeof cliente.query;
  vi.stubEnv("E2E_BANCO_SINTETICO", "true");
  vi.stubEnv("TEST_BASE_URL", "http://localhost:3000");
  vi.stubEnv("DATABASE_URL", "postgresql://teste:senha@localhost/sintetico");
  vi.stubEnv("DIRECT_URL", "postgresql://teste:senha@localhost/sintetico");
  vi.spyOn(pg, "Client").mockImplementation(function () {
    return cliente;
  } as unknown as typeof pg.Client);
  await expect(
    comBanco(async () => {
      throw original;
    }),
  ).rejects.toMatchObject({ errors: [original, fechamento] });
  expect(cliente.end).toHaveBeenCalled();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
