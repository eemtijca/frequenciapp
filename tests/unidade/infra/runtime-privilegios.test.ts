// Contratos estáticos do SQL real e de seu ensaio preparado, sem executar PostgreSQL.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lerSql = () =>
  readFileSync("scripts/banco/provisionar-runtime.sql", "utf8")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ");

describe("contrato estático de privilégios do runtime", () => {
  it("recusa CREATE sem USAGE e toda dependência de ownership antes de provisionar", () => {
    const sql = lerSql();
    const inicioDdl = sql.indexOf("execute format('create schema");
    expect(inicioDdl).toBeGreaterThan(0);
    const guardas = sql.slice(0, inicioDdl);
    // CREATE não pode depender de USAGE, nem excluir schemas de sistema.
    expect
      .soft(guardas)
      .toMatch(/from pg_namespace n where has_schema_privilege\(runtime, n\.oid, 'CREATE'\) or \(/);
    // pg_shdepend registra ownership também de funções, tipos, schemas e banco.
    // A consulta não filtra só pg_class nem varre objetos locais de outros bancos.
    expect
      .soft(guardas)
      .toContain(
        "from pg_shdepend d where d.refclassid = 'pg_authid'::regclass and d.refobjid = r.oid and d.deptype = 'o' and (d.dbid = 0 or d.dbid = (select oid from pg_database where datname = current_database()))",
      );
    expect.soft(guardas).toContain("Runtime não pode ser owner de objetos.");
  });

  it("preserva recusa de atributos, membership e privilégios efetivos do banco", () => {
    const sql = lerSql();
    for (const atributo of [
      "rolsuper",
      "rolcreatedb",
      "rolcreaterole",
      "rolreplication",
      "rolbypassrls",
    ]) {
      expect(sql).toContain(`r.${atributo}`);
      expect(sql).toContain(`m.${atributo}`);
    }
    for (const papel of ["r", "m"])
      expect(sql).toContain(`pg_has_role(${papel}.oid, p.oid, 'MEMBER')`);
    expect(sql).toContain("has_database_privilege(runtime, current_database(), 'CREATE')");
    expect(sql).toContain("has_database_privilege(runtime, current_database(), 'TEMP')");
    expect(sql).toContain("has_schema_privilege(runtime, n.oid, 'USAGE')");
  });

  it("mantém DML, defaults do migrador e isolamento sem reparar ownership ou PUBLIC global", () => {
    const sql = lerSql();
    expect(sql).toContain("grant select, insert, update, delete on all tables in schema %I to %I");
    expect(sql).toContain("grant usage, select on all sequences in schema %I to %I");
    expect(sql).toContain("grant usage on type %I.%I to %I");
    expect(sql).toContain("revoke all privileges on all tables in schema %I from %I");
    expect(sql).toContain("revoke all privileges on all functions in schema %I from %I");
    expect(sql).toContain("revoke all privileges on type %I.%I from %I");
    expect(sql).toContain("alter default privileges for role %I in schema %I grant");
    expect(sql).toContain("revoke all privileges on table %I._prisma_migrations from %I");
    expect(sql).toContain("nenhuma transferência automática");
    expect(sql).not.toMatch(/reassign owned|drop owned|drop role|create role|grant all/i);
    expect(sql).not.toMatch(/revoke[^;]*(?:on database|on schema public)/i);
  });

  it("mantém a entrada protegida e o ensaio ligado ao provisionador real", () => {
    const ensaio = readFileSync("tests/apoio/privilegios-runtime.mjs", "utf8");
    const entrada = readFileSync("tests/servidor/privilegios-runtime.sh", "utf8");
    expect(entrada).toContain(
      "tests/isolamento/executar.mjs -- node tests/apoio/privilegios-runtime.mjs",
    );
    expect(ensaio.indexOf("await verificarIsolamento()")).toBeLessThan(
      ensaio.indexOf("new pg.Client"),
    );
    expect(ensaio).toContain('readFileSync("scripts/banco/provisionar-runtime.sql", "utf8")');
    expect(ensaio).toContain('await admin.query("rollback")');
    expect(ensaio).toContain("app_schema: schema");
    expect(ensaio).toContain("papel_runtime: runtime");
    expect(ensaio).toContain("papel_migracao: migrador");
  });
});
