// Exercita o migrador real contra um PostgreSQL 17 descartável: cada caso cria
// um banco migracao_qa_*, prepara _prisma_migrations e derruba o banco no finally.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db"]);
const PREFIXO_BANCO = "migracao_qa_";
const TIMEOUT_MIGRADOR_MS = 120000;
const DATA_SINTETICA = "2026-01-01T00:00:00.000Z";

const migracoes = (await readdir(path.join(raiz, "prisma", "migrations"), { withFileTypes: true }))
  .filter((entrada) => entrada.isDirectory())
  .map((entrada) => entrada.name)
  .sort();
assert.ok(migracoes.length > 0, "Nenhuma migração encontrada em prisma/migrations.");

const primeiraMigracao = migracoes[0];
const sqlPrimeira = await readFile(
  path.join(raiz, "prisma", "migrations", primeiraMigracao, "migration.sql"),
  "utf8",
);
const checksumPrimeira = createHash("sha256").update(sqlPrimeira).digest("hex");

// Espelha a tabela que o Prisma CLI cria: finished_at aceita nulo para
// representar a migração interrompida que o migrador precisa recusar.
const TABELA_MIGRACOES = `create table _prisma_migrations (
  id varchar(36) primary key,
  checksum varchar(64) not null,
  finished_at timestamptz,
  migration_name varchar(255) not null,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz not null default now(),
  applied_steps_count integer not null default 0
)`;

// A confirmação explícita e a lista de hosts impedem que uma variável herdada
// aponte o ensaio para um banco real, já que o teste cria e derruba bancos.
function urlBase() {
  if (process.env.MIGRADOR_BANCO_DESCARTAVEL !== "true") {
    throw new Error("O ensaio cria e derruba bancos. Defina MIGRADOR_BANCO_DESCARTAVEL=true.");
  }
  const valor = process.env.DIRECT_URL?.trim() ?? "";
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error("Defina DIRECT_URL com uma conexão PostgreSQL completa.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Defina DIRECT_URL com uma conexão PostgreSQL completa.");
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("A URL do ensaio precisa usar localhost, 127.0.0.1, ::1 ou o serviço db.");
  }
  url.searchParams.delete("schema");
  return url;
}

function urlAdmin() {
  const url = urlBase();
  url.pathname = "/postgres";
  return url.toString();
}

function urlDoBanco(nome) {
  const url = urlBase();
  url.pathname = `/${nome}`;
  return url.toString();
}

async function conectar(url) {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await cliente.connect();
  return cliente;
}

async function comCliente(url, corpo) {
  const cliente = await conectar(url);
  try {
    return await corpo(cliente);
  } finally {
    await cliente.end();
  }
}

async function criarBanco(nome) {
  await comCliente(urlAdmin(), (cliente) => cliente.query(`create database ${nome}`));
}

async function derrubarBanco(nome) {
  await comCliente(urlAdmin(), (cliente) =>
    cliente.query(`drop database if exists ${nome} with (force)`),
  );
}

async function comBancoDescartavel(corpo) {
  const nome = `${PREFIXO_BANCO}${randomBytes(4).toString("hex")}`;
  assert.match(nome, /^migracao_qa_[0-9a-f]{8}$/);
  await criarBanco(nome);
  try {
    return await corpo({ nome, url: urlDoBanco(nome) });
  } finally {
    await derrubarBanco(nome);
  }
}

async function prepararRegistro(
  url,
  { concluida, revertida = false, checksum = checksumPrimeira },
) {
  await comCliente(url, async (cliente) => {
    await cliente.query(TABELA_MIGRACOES);
    await cliente.query(
      `insert into _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       values ($1, $2, $3, $4, null, $5, now(), 1)`,
      [
        randomUUID(),
        checksum,
        concluida ? DATA_SINTETICA : null,
        primeiraMigracao,
        revertida ? DATA_SINTETICA : null,
      ],
    );
  });
}

// O migrador usa DIRECT_URL e o mesmo banco em DATABASE_URL para não herdar
// uma conexão de runtime; DATABASE_SCHEMA fica fora para não trocar o schema.
function executarMigrador(url) {
  const ambiente = { ...process.env, DIRECT_URL: url, DATABASE_URL: url };
  delete ambiente.DATABASE_SCHEMA;
  const resultado = spawnSync(process.execPath, ["docker/app/migrar.mjs"], {
    cwd: raiz,
    encoding: "utf8",
    timeout: TIMEOUT_MIGRADOR_MS,
    maxBuffer: 10 * 1024 * 1024,
    env: ambiente,
  });
  assert.ifError(resultado.error);
  assert.equal(resultado.signal, null, `O migrador foi interrompido: ${resultado.signal}`);
  return resultado;
}

function conferirBloqueio(resultado, trecho) {
  assert.equal(
    resultado.status,
    4,
    `O migrador deveria bloquear com código 4. Saída: ${resultado.stdout}\n${resultado.stderr}`,
  );
  assert.match(resultado.stderr, trecho);
  assert.ok(
    resultado.stderr.includes(primeiraMigracao),
    `A mensagem não cita ${primeiraMigracao}: ${resultado.stderr}`,
  );
  assert.doesNotMatch(resultado.stderr, /migrate reset/i);
}

async function tabelaExiste(url, tabela) {
  return comCliente(url, async (cliente) => {
    const resultado = await cliente.query("select to_regclass($1) as tabela", [`public.${tabela}`]);
    return resultado.rows[0]?.tabela != null;
  });
}

async function registrosDaMigracao(url) {
  return comCliente(url, async (cliente) => {
    const resultado = await cliente.query(
      `select finished_at, rolled_back_at
         from _prisma_migrations
        where migration_name = $1
        order by started_at`,
      [primeiraMigracao],
    );
    return resultado.rows;
  });
}

async function totalAplicado(url) {
  return comCliente(url, async (cliente) => {
    const resultado = await cliente.query(
      "select count(*)::integer as total from _prisma_migrations where rolled_back_at is null",
    );
    return resultado.rows[0].total;
  });
}

test("registro incompleto bloqueia a migração real com código 4", async () => {
  await comBancoDescartavel(async ({ url }) => {
    await prepararRegistro(url, { concluida: false });

    const resultado = executarMigrador(url);
    conferirBloqueio(resultado, /incompleta/);
    assert.equal(await tabelaExiste(url, "usuarios"), false);
  });
});

test("checksum divergente bloqueia a migração real com código 4", async () => {
  await comBancoDescartavel(async ({ url }) => {
    await prepararRegistro(url, { concluida: true, checksum: "0".repeat(64) });

    const resultado = executarMigrador(url);
    conferirBloqueio(resultado, /conteúdo alterado/);
    assert.equal(await tabelaExiste(url, "usuarios"), false);
  });
});

test("registro revertido é reaplicado e a segunda execução fica idempotente", async () => {
  await comBancoDescartavel(async ({ url }) => {
    await prepararRegistro(url, { concluida: false, revertida: true });

    const primeiraExecucao = executarMigrador(url);
    assert.equal(primeiraExecucao.status, 0, primeiraExecucao.stderr);
    assert.match(primeiraExecucao.stdout, new RegExp(`Aplicada: ${primeiraMigracao}`));
    assert.equal(await tabelaExiste(url, "usuarios"), true);
    assert.equal(await totalAplicado(url), migracoes.length);

    const registros = await registrosDaMigracao(url);
    assert.equal(registros.length, 2);
    assert.ok(
      registros.some((linha) => linha.finished_at !== null && linha.rolled_back_at === null),
    );
    assert.ok(registros.some((linha) => linha.rolled_back_at !== null));

    const segundaExecucao = executarMigrador(url);
    assert.equal(segundaExecucao.status, 0, segundaExecucao.stderr);
    assert.match(segundaExecucao.stdout, /Banco já está na última revisão/);
    assert.equal((await registrosDaMigracao(url)).length, 2);
  });
});
