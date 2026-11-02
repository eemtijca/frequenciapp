import pg from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { criarFeriadoDaFixture, removerFeriadoDaFixture } from "../helpers/feriados-banco";

const url = "postgresql://teste:senha@localhost:5432/sintetico?schema=preview";
const ClientOriginal = pg.Client;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("DIRECT_URL", url);
  vi.stubEnv("DATABASE_SCHEMA", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function preparar(
  falhas: string[] = [],
  ocupadas = falhas.includes("ocupada") ? Number.POSITIVE_INFINITY : 0,
) {
  const eventos: string[] = [];
  const dados = new ClientOriginal({ connectionString: url });
  const advisory = new ClientOriginal({ connectionString: url });
  let tentativasOcupadas = ocupadas;
  const query = (origem: string) =>
    vi.fn(async (sql: string) => {
      eventos.push(`${origem}:${sql}`);
      if (falhas.includes(`${origem}:${sql}`)) throw new Error(`falhou ${origem}:${sql}`);
      if (sql.includes("pg_try_advisory")) {
        if (tentativasOcupadas > 0) {
          tentativasOcupadas -= 1;
          return { rows: [{ obtida: false }] };
        }
        return { rows: [{ obtida: !falhas.includes("ocupada") }] };
      }
      if (sql === "show lock_timeout") return { rows: [{ lock_timeout: "0" }] };
      if (sql.includes("exists")) return { rows: [{ ocupado: false }] };
      return { rows: [] };
    });
  dados.query = query("dados") as unknown as pg.Client["query"];
  advisory.query = query("advisory") as unknown as pg.Client["query"];
  dados.end = vi.fn(async () => {
    eventos.push("dados:end");
  }) as typeof dados.end;
  advisory.connect = vi.fn(async () => {
    eventos.push("advisory:connect");
  }) as unknown as typeof advisory.connect;
  advisory.end = vi.fn(async () => {
    eventos.push("advisory:end");
  }) as typeof advisory.end;
  vi.spyOn(pg, "Client").mockImplementation(function () {
    return advisory;
  } as unknown as typeof pg.Client);
  return { dados, eventos };
}

it.each([criarFeriadoDaFixture, removerFeriadoDaFixture])(
  "separa advisory e dados, trava tabela como primeiro comando serializable",
  async (operacao) => {
    const { dados, eventos } = preparar();
    await operacao(dados, "2026-06-03", "QA");
    expect(eventos).toContain(
      "advisory:SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
    );
    expect(
      eventos.indexOf(
        "advisory:SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
      ),
    ).toBeLessThan(eventos.indexOf("dados:begin isolation level serializable"));
    const inicio = eventos.indexOf("dados:begin isolation level serializable");
    expect(eventos[inicio + 1]).toBe(
      'dados:lock table "preview"."feriados" in share row exclusive mode',
    );
    expect(eventos.indexOf("dados:commit")).toBeLessThan(eventos.indexOf("advisory:rollback"));
    expect(eventos.at(-1)).toBe("advisory:end");
  },
);

it("não abre transação de dados quando advisory está ocupada", async () => {
  const { dados, eventos } = preparar(["ocupada"]);
  await expect(criarFeriadoDaFixture(dados, "2026-06-03", "QA")).rejects.toThrow(/trava/i);
  expect(eventos.some((evento) => evento.startsWith("dados:"))).toBe(false);
  expect(eventos.at(-1)).toBe("advisory:end");
});

it("aguarda a trava temporariamente ocupada antes de seguir", async () => {
  const { dados, eventos } = preparar([], 2);
  await removerFeriadoDaFixture(dados, "2026-06-03", "QA", 1_000);
  expect(eventos.filter((evento) => evento.includes("pg_try_advisory"))).toHaveLength(3);
  expect(eventos).toContain("dados:begin isolation level serializable");
});

it("preserva erro original ao falhar rollback e ainda libera advisory", async () => {
  const { dados, eventos } = preparar([
    'dados:lock table "preview"."feriados" in share row exclusive mode',
    "dados:rollback",
    "advisory:rollback",
  ]);
  await expect(criarFeriadoDaFixture(dados, "2026-06-03", "QA")).rejects.toThrow(
    "falhou dados:lock table",
  );
  expect(eventos).toContain("dados:rollback");
  expect(eventos.indexOf("dados:end")).toBeGreaterThan(eventos.indexOf("dados:rollback"));
  expect(eventos.indexOf("dados:end")).toBeLessThan(eventos.indexOf("advisory:rollback"));
  expect(eventos).toContain("advisory:rollback");
  expect(eventos.at(-1)).toBe("advisory:end");
});
