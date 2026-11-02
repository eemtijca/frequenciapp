import pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  criarFeriadoDaFixture,
  lerFeriados,
  removerFeriadoDaFixture,
} from "../helpers/feriados-banco";

const ClientOriginal = pg.Client;
const url = "postgresql://teste:senha@localhost:5432/sintetico?schema=preview";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("DIRECT_URL", url);
  vi.stubEnv("DATABASE_SCHEMA", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function clienteFalso(opcoes: { ocupado?: boolean; trava?: boolean; falhar?: string } = {}) {
  const cliente = new ClientOriginal({ connectionString: url });
  const advisory = new ClientOriginal({ connectionString: url });
  const consulta = (sql: string) => {
    if (opcoes.falhar && sql.startsWith(opcoes.falhar)) throw new Error("falha simulada");
    if (sql.includes("pg_try_advisory_xact_lock"))
      return { rows: [{ obtida: opcoes.trava ?? true }] };
    if (sql === "show lock_timeout") return { rows: [{ lock_timeout: "0" }] };
    if (sql.includes("exists")) return { rows: [{ ocupado: opcoes.ocupado ?? false }] };
    return { rows: [] };
  };
  const query = vi.fn(async (sql: string, _params?: unknown[]) => consulta(sql));
  const queryAdvisory = vi.fn(async (sql: string, _params?: unknown[]) => consulta(sql));
  cliente.query = query as unknown as pg.Client["query"];
  advisory.query = queryAdvisory as unknown as pg.Client["query"];
  advisory.connect = vi.fn(async () => {}) as unknown as typeof advisory.connect;
  advisory.end = vi.fn(async () => {}) as typeof advisory.end;
  vi.spyOn(pg, "Client").mockImplementation(function () {
    return advisory;
  } as unknown as typeof pg.Client);
  return { cliente, query, queryAdvisory };
}

describe("feriados da fixture com SQL simulado", () => {
  it("adquire advisory antes da tabela e qualifica schema antes de inserir", async () => {
    const { cliente, query, queryAdvisory } = clienteFalso();
    await criarFeriadoDaFixture(cliente, "2026-06-03", "QA único");
    expect(queryAdvisory.mock.calls).toEqual([
      ["begin"],
      [expect.stringContaining("pg_try_advisory_xact_lock"), [0x46524551, 1]],
      ["rollback"],
    ]);
    expect(query.mock.calls).toEqual([
      ["show lock_timeout"],
      ["set lock_timeout = '5s'"],
      ["begin isolation level serializable"],
      ['lock table "preview"."feriados" in share row exclusive mode'],
      [expect.stringContaining('from "preview"."feriados"'), ["2026-06-03"]],
      [expect.stringContaining('insert into "preview"."feriados"'), ["2026-06-03", "QA único"]],
      ["commit"],
      ["select set_config('lock_timeout', $1, false)", ["0"]],
    ]);
    expect(query.mock.calls[4]?.[0]).toContain('from "preview"."frequencias"');
    expect(query.mock.calls[4]?.[0]).toContain('from "preview"."frequencias_parciais"');
  });

  it("recusa trava indisponível antes de tocar a tabela e reverte", async () => {
    const { cliente, query, queryAdvisory } = clienteFalso({ trava: false });
    await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow(/trava/i);
    expect(query).not.toHaveBeenCalled();
    expect(queryAdvisory.mock.calls.at(-1)?.[0]).toBe("rollback");
  });

  it("recusa data ocupada e reverte", async () => {
    const { cliente, query } = clienteFalso({ ocupado: true });
    await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow(/ocupad/i);
    expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
  });

  it.each(["SELECT pg_try_advisory_xact_lock", "lock table"])(
    "reverte falha ao executar %s sem escrita",
    async (falhar) => {
      const { cliente, query, queryAdvisory } = clienteFalso({ falhar });
      await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow(
        "falha simulada",
      );
      expect(queryAdvisory.mock.calls.at(-1)?.[0]).toBe("rollback");
      if (falhar === "lock table")
        expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
      expect(query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(false);
    },
  );

  it("reverte falhas de inserção e remoção", async () => {
    for (const falhar of ["insert", "delete"]) {
      const { cliente, query } = clienteFalso({ falhar });
      const operacao = falhar === "insert" ? criarFeriadoDaFixture : removerFeriadoDaFixture;
      await expect(operacao(cliente, "2026-06-03", "QA")).rejects.toThrow("falha simulada");
      expect(query.mock.calls.map(([sql]) => sql)).toContain("rollback");
      vi.restoreAllMocks();
    }
  });

  it("remove somente o dia e nome próprios, sob ambas as travas", async () => {
    const { cliente, query, queryAdvisory } = clienteFalso();
    await removerFeriadoDaFixture(cliente, "2026-06-03", "QA único");
    expect(queryAdvisory.mock.calls[1]).toEqual([
      expect.stringContaining("pg_try_advisory_xact_lock"),
      [0x46524551, 1],
    ]);
    expect(query.mock.calls).toContainEqual([
      'delete from "preview"."feriados" where dia=$1::date and nome=$2',
      ["2026-06-03", "QA único"],
    ]);
    expect(query.mock.calls.map(([sql]) => sql)).toContain("commit");
  });

  it("usa DATABASE_SCHEMA para leitura e escrita", async () => {
    vi.stubEnv("DATABASE_SCHEMA", "outro-schema");
    const { cliente, query } = clienteFalso();
    await lerFeriados(cliente);
    await criarFeriadoDaFixture(cliente, "2026-06-03", "QA");
    expect(query.mock.calls[0]?.[0]).toContain('from "outro-schema"."feriados"');
    expect(query.mock.calls[4]?.[0]).toContain('"outro-schema"."feriados"');
  });

  it.each([
    ["DIRECT_URL", ""],
    ["DATABASE_URL", ""],
    ["DIRECT_URL", "postgresql://teste@outro/sintetico"],
    ["DIRECT_URL", `${url}&host=outro`],
  ])("falha antes de qualquer SQL quando %s não verifica identidade", async (variavel, valor) => {
    vi.stubEnv(variavel, valor);
    const { cliente, query } = clienteFalso();
    await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("recusa parâmetros de roteamento mesmo quando ambas as URLs são iguais", async () => {
    const ambigua = `${url}&host=outro`;
    vi.stubEnv("DATABASE_URL", ambigua);
    vi.stubEnv("DIRECT_URL", ambigua);
    const { cliente, query } = clienteFalso();
    await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("recusa cliente conectado a outro endereço antes de qualquer SQL", async () => {
    const { query } = clienteFalso();
    const cliente = new ClientOriginal({
      connectionString: "postgresql://teste@outro:5432/sintetico",
    });
    cliente.query = query as unknown as pg.Client["query"];
    await expect(removerFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("simula concorrência, falha não bloqueante e liberação em commit e rollback", async () => {
    let ocupada = false;
    let liberar!: () => void;
    let sinalizar!: () => void;
    const iniciou = new Promise<void>((r) => {
      sinalizar = r;
    });
    const espera = new Promise<void>((r) => {
      liberar = r;
    });
    vi.spyOn(pg, "Client").mockImplementation(function () {
      const advisory = new ClientOriginal({ connectionString: url });
      let dona = false;
      advisory.connect = vi.fn(async () => {}) as unknown as typeof advisory.connect;
      advisory.end = vi.fn(async () => {
        if (dona) ocupada = false;
      }) as typeof advisory.end;
      advisory.query = vi.fn(async (sql: string) => {
        if (sql.includes("pg_try_advisory")) {
          dona = !ocupada;
          if (dona) ocupada = true;
          return { rows: [{ obtida: dona }] };
        }
        if (sql === "rollback" && dona) {
          ocupada = false;
          dona = false;
        }
        return { rows: [] };
      }) as unknown as pg.Client["query"];
      return advisory;
    } as unknown as typeof pg.Client);
    const criarDados = (bloquear = false, falhar = false) => {
      const cliente = new ClientOriginal({ connectionString: url });
      const query = vi.fn(async (sql: string) => {
        if (sql === "show lock_timeout") return { rows: [{ lock_timeout: "0" }] };
        if (sql.includes("exists")) return { rows: [{ ocupado: false }] };
        if (sql.startsWith("insert")) {
          if (bloquear) {
            sinalizar();
            await espera;
          }
          if (falhar) throw new Error("falha simulada");
        }
        return { rows: [] };
      });
      cliente.query = query as unknown as pg.Client["query"];
      return { cliente, query };
    };
    const primeiro = criarDados(true);
    const emAndamento = criarFeriadoDaFixture(primeiro.cliente, "2026-06-03", "QA");
    await iniciou;
    const segundo = criarDados();
    await expect(removerFeriadoDaFixture(segundo.cliente, "2026-06-03", "QA")).rejects.toThrow(
      /trava/i,
    );
    expect(segundo.query).not.toHaveBeenCalled();
    liberar();
    await emAndamento;
    expect(ocupada).toBe(false);
    const falho = criarDados(false, true);
    await expect(criarFeriadoDaFixture(falho.cliente, "2026-06-04", "QA")).rejects.toThrow(
      "falha simulada",
    );
    expect(ocupada).toBe(false);
    const proximo = criarDados();
    await removerFeriadoDaFixture(proximo.cliente, "2026-06-03", "QA");
    expect(proximo.query.mock.calls.map(([sql]) => sql)).toContain("commit");
    expect(ocupada).toBe(false);
  });

  it("rejeita schema inválido antes de executar SQL", async () => {
    vi.stubEnv("DATABASE_SCHEMA", 'inseguro"; drop table feriados;--');
    const { cliente, query } = clienteFalso();
    await expect(criarFeriadoDaFixture(cliente, "2026-06-03", "QA")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
