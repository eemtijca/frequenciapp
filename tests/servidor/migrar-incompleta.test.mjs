// Exercita o migrador real com registros sintéticos e um cliente pg estrito.
// Execute em ambiente isolado, sem rede e sem acesso a banco ou credenciais.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nome = "20260101000000_exemplo";
const sql = "select 123;\n";
const checksum = createHash("sha256").update(sql).digest("hex");
const registro = (campos = {}) => ({
  migration_name: nome,
  checksum,
  finished_at: "2026-01-01T00:00:00.000Z",
  rolled_back_at: null,
  ...campos,
});

// Este dublê modela a projeção SQL: não entrega colunas não selecionadas.
// Uma instrução inesperada falha, em vez de fingir sucesso.
const pgFalso = `
const fs = require('node:fs');
const assert = require('node:assert/strict');
const registros = JSON.parse(process.env.REGISTROS_SINTETICOS);
const consultas = process.env.CONSULTAS_SINTETICAS;
class Client {
  constructor(config) {
    assert.equal(config.connectionString, 'postgresql://sintetico@invalido/sintetico');
    assert.equal(config.connectionTimeoutMillis, 5000);
  }
  async connect() {}
  async end() {}
  async query(text, params) {
    const q = text.trim().replace(/\\s+/g, ' ').toLowerCase();
    fs.appendFileSync(consultas, JSON.stringify({ q, params }) + '\\n');
    if (q === "select pg_catalog.has_schema_privilege(oid, 'usage') as uso from pg_catalog.pg_namespace where nspname = $1") {
      assert.deepEqual(params, ['public']); return {rows: [{uso: true}]};
    }
    if (q === "select pg_catalog.set_config('search_path', $1, false)") {
      assert.deepEqual(params, ['"public"']); return {rows: [{}]};
    }
    if (/^select pg_advisory_(lock|unlock)\\(\\$1\\)$/.test(q)) {
      assert.ok([727001, 72707369].includes(params[0])); return {rows: [{}]};
    }
    if (/^create table if not exists _prisma_migrations \\(/.test(q)) return {rows: []};
    const selecao = /^select ([a-z_, ]+) from _prisma_migrations where rolled_back_at is null$/.exec(q);
    if (selecao) {
      const colunas = selecao[1].split(',').map(x => x.trim());
      assert.ok(colunas.length && colunas.every(x => ['migration_name', 'checksum', 'finished_at', 'rolled_back_at'].includes(x)));
      return {rows: registros.filter(r => r.rolled_back_at === null).map(r => Object.fromEntries(colunas.map(c => [c, r[c]])))};
    }
    if (['begin', 'commit', 'rollback', 'select 123;'].includes(q)) return {rows: []};
    if (/^insert into _prisma_migrations /.test(q)) {
      assert.equal(params.length, 3);
      assert.match(params[0], /^[0-9a-f-]{36}$/);
      assert.equal(params[1], ${JSON.stringify(checksum)});
      assert.equal(params[2], ${JSON.stringify(nome)});
      return {rows: []};
    }
    throw Error('Consulta inesperada no pg sintético: ' + q);
  }
}
module.exports = {Client};
`;

async function executar(registros) {
  const pasta = await mkdtemp(path.join(os.tmpdir(), "migrador-sintetico-"));
  try {
    for (const dir of ["docker/app", "src/infra", `prisma/migrations/${nome}`, "node_modules/pg"]) {
      await mkdir(path.join(pasta, dir), { recursive: true });
    }
    await copyFile(
      path.join(raiz, "docker/app/migrar.mjs"),
      path.join(pasta, "docker/app/migrar.mjs"),
    );
    await copyFile(
      path.join(raiz, "src/infra/schema-postgres.mjs"),
      path.join(pasta, "src/infra/schema-postgres.mjs"),
    );
    await writeFile(path.join(pasta, "node_modules/pg/index.js"), pgFalso);
    await writeFile(path.join(pasta, `prisma/migrations/${nome}/migration.sql`), sql);
    const consultas = path.join(pasta, "consultas.jsonl");
    const resultado = spawnSync(process.execPath, ["docker/app/migrar.mjs"], {
      cwd: pasta,
      encoding: "utf8",
      timeout: 5000,
      env: {
        DIRECT_URL: "postgresql://sintetico@invalido/sintetico",
        REGISTROS_SINTETICOS: JSON.stringify(registros),
        CONSULTAS_SINTETICAS: consultas,
      },
    });
    assert.ifError(resultado.error);
    const log = (await readFile(consultas, "utf8")).trim().split("\n").map(JSON.parse);
    return { ...resultado, consultas: log.map((entrada) => entrada.q) };
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

function semAplicacao(resultado) {
  assert.ok(
    !resultado.consultas.some(
      (q) => q === "begin" || q === "select 123;" || q.startsWith("insert into _prisma_migrations"),
    ),
  );
}

test("registro concluído existente e checksum correto são aceitos sem reaplicar", async () => {
  const resultado = await executar([registro()]);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.match(resultado.stdout, /Banco já está na última revisão/);
  semAplicacao(resultado);
});

test("registro sem conclusão nem rollback bloqueia a migração sem alteração destrutiva", async () => {
  const resultado = await executar([registro({ finished_at: null })]);
  assert.notEqual(resultado.status, 0, `registro incompleto foi aceito: ${resultado.stdout}`);
  assert.match(resultado.stderr, /incompleta|não concluída/i);
  assert.match(resultado.stderr, new RegExp(nome));
  assert.doesNotMatch(resultado.stderr, /migrate reset|down -v|recrie o banco/i);
  semAplicacao(resultado);
});

test("registro incompleto desconhecido também bloqueia antes de novas migrações", async () => {
  const desconhecida = "20250101000000_ausente";
  const resultado = await executar([registro({ migration_name: desconhecida, finished_at: null })]);
  assert.notEqual(resultado.status, 0, `registro incompleto foi aceito: ${resultado.stdout}`);
  assert.match(resultado.stderr, new RegExp(desconhecida));
  semAplicacao(resultado);
});

test("registro incompleto não é ocultado por outro concluído com mesmo nome", async () => {
  const resultado = await executar([registro({ finished_at: null }), registro()]);
  assert.notEqual(resultado.status, 0, `registro incompleto foi aceito: ${resultado.stdout}`);
  assert.match(resultado.stderr, new RegExp(nome));
  semAplicacao(resultado);
});

test("checksum divergente de registro concluído continua bloqueando", async () => {
  const resultado = await executar([registro({ checksum: "a".repeat(64) })]);
  assert.equal(resultado.status, 4, resultado.stderr);
  assert.match(resultado.stderr, /conteúdo alterado/);
  assert.match(resultado.stderr, new RegExp(nome));
  semAplicacao(resultado);
});

test("registro revertido não impede reaplicação da migração", async () => {
  const resultado = await executar([
    registro({ finished_at: null, rolled_back_at: "2026-01-01T00:00:00.000Z" }),
  ]);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.match(resultado.stdout, /Aplicada:/);
  assert.ok(resultado.consultas.includes("select 123;"));
  assert.ok(resultado.consultas.some((q) => q.startsWith("insert into _prisma_migrations")));
});
