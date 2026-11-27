// Exercita a aprovação do migrador com transações e travas do PostgreSQL 17.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, rm, statfs, symlink, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as esperar } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";

const executar = promisify(execFile);
const raiz = fileURLToPath(new URL("../../", import.meta.url));
const pastaAutorizacao = "/run/frequenciapp-migracao";
const autorizacao = `${pastaAutorizacao}/autorizar`;
const aplicadas = [["20260101000000_base", 'CREATE TABLE "sintetica" ("id" INTEGER);\n']];
const pendentes = [
  ["20260102000000_coluna", 'ALTER TABLE "sintetica" ADD COLUMN "nova" TEXT;\n'],
  ["20260103000000_tabela", 'CREATE TABLE "outra" ("id" INTEGER);\n'],
];
const nomesEHashes = (lote) =>
  lote.map(([nome, sql]) => ({ nome, sha256: createHash("sha256").update(sql).digest("hex") }));

async function urlDeEnsaio() {
  assert.equal(process.env.MIGRADOR_BANCO_DESCARTAVEL, "true");
  assert.notEqual(process.getuid(), 0);
  const interfaces = networkInterfaces();
  assert.deepEqual(Object.keys(interfaces), ["lo"]);
  assert.ok(interfaces.lo.length > 0 && interfaces.lo.every(({ internal }) => internal));
  await assert.rejects(lstat("/run/docker.sock"), { code: "ENOENT" });
  const pasta = await lstat(pastaAutorizacao);
  assert.ok(
    pasta.isDirectory() && pasta.uid === process.getuid() && (pasta.mode & 0o777) === 0o700,
  );
  assert.equal(
    (await statfs(pastaAutorizacao)).type,
    0x01021994,
    "A autorização exige tmpfs privado.",
  );
  const url = new URL(process.env.DIRECT_URL);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.hostname === "127.0.0.1" && ["5432", "55432"].includes(url.port));
  assert.ok(url.username === "ensaio" && url.pathname === "/postgres" && !url.search && !url.hash);
  assert.ok(!Object.keys(process.env).some((nome) => nome.startsWith("PG")));
  return url;
}

async function fixture(t) {
  const url = await urlDeEnsaio();
  await assert.rejects(lstat(autorizacao), { code: "ENOENT" });
  const admin = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 3000 });
  await admin.connect();
  const banco = `migracao_qa_${randomBytes(8).toString("hex")}`;
  const clientes = [];
  let criado = false;
  t.after(async () => {
    try {
      await Promise.all(clientes.map((cliente) => cliente.end()));
      if (criado) await admin.query(`DROP DATABASE ${banco} WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });
  const {
    rows: [observada],
  } = await admin.query(`SELECT
    current_database() AS banco, current_user AS usuario, host(inet_server_addr()) AS ip,
    inet_server_port()::text AS porta, current_setting('server_version_num') AS versao,
    current_setting('data_directory') AS pasta`);
  assert.equal(observada.banco, "postgres");
  assert.equal(observada.usuario, "ensaio");
  assert.equal(observada.ip, "127.0.0.1");
  assert.equal(observada.porta, url.port);
  assert.match(observada.versao, /^17\d{4}$/);
  assert.equal(observada.pasta, url.port === "5432" ? "/var/lib/postgresql/data" : "/tmp/base");
  t.after(() => rm(autorizacao, { force: true }));
  await admin.query(`CREATE DATABASE ${banco}`);
  criado = true;
  url.pathname = `/${banco}`;
  async function conectar() {
    const cliente = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 3000 });
    await cliente.connect();
    clientes.push(cliente);
    await cliente.query("SET statement_timeout = '10s'");
    return cliente;
  }
  const cliente = await conectar();
  const pasta = await mkdtemp(path.join(tmpdir(), "migracao-auto-lock-"));
  t.after(() => rm(pasta, { recursive: true, force: true }));
  for (const arquivo of ["docker/app/migrar.mjs", "src/infra/schema-postgres.mjs"]) {
    const destino = path.join(pasta, arquivo);
    await mkdir(path.dirname(destino), { recursive: true });
    await copyFile(path.join(raiz, arquivo), destino);
  }
  await symlink(path.join(raiz, "node_modules"), path.join(pasta, "node_modules"));

  async function escrever([nome, sql]) {
    const dir = path.join(pasta, "prisma/migrations", nome);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "migration.sql"), sql);
  }
  async function migrar(ambiente = {}) {
    try {
      const saida = await executar(process.execPath, [path.join(pasta, "docker/app/migrar.mjs")], {
        cwd: pasta,
        env: { DIRECT_URL: url.href, ...ambiente },
        timeout: 10000,
      });
      return { ...saida, status: 0 };
    } catch (erro) {
      assert.equal(typeof erro.code, "number", "O migrador precisa concluir sem sinal ou timeout.");
      return { stdout: erro.stdout, stderr: erro.stderr, status: erro.code };
    }
  }
  for (const arquivo of aplicadas) await escrever(arquivo);
  const inicial = await migrar();
  assert.equal(inicial.status, 0, inicial.stderr);
  for (const arquivo of pendentes) await escrever(arquivo);
  const {
    rows: [identidade],
  } = await cliente.query(`
    SELECT (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      current_database() AS banco,
      (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS "bancoOid",
      'public' AS schema, 'public'::regnamespace::oid::text AS "schemaOid", current_user AS usuario,
      host(inet_server_addr()) AS ip
  `);
  const lote = {
    ...identidade,
    base: "a".repeat(40),
    alvo: "b".repeat(40),
    aplicadas: nomesEHashes(aplicadas),
    pendentes: nomesEHashes(pendentes),
  };
  const auto = async (aprovacao = lote, { prova } = {}) => {
    const envelope = Buffer.from(JSON.stringify(aprovacao)).toString("base64url");
    await rm(autorizacao, { force: true });
    if (prova !== null)
      await writeFile(autorizacao, prova ?? envelope, { mode: 0o600, flag: "wx" });
    return migrar({
      MIGRACAO_AUTOMATICA: "true",
      MIGRACAO_LOTE_APROVADO: envelope,
    });
  };
  async function estado() {
    const { rows } = await cliente.query(`SELECT
      (SELECT array_agg(migration_name ORDER BY started_at) FROM public._prisma_migrations) AS historico,
      EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.sintetica'::regclass
        AND attname = 'nova' AND NOT attisdropped) AS coluna,
      to_regclass('public.outra') IS NOT NULL AS tabela`);
    return rows[0];
  }
  return { cliente, conectar, lote, migrar, auto, escrever, estado };
}

const baseIntacta = { historico: [aplicadas[0][0]], coluna: false, tabela: false };
const alvoCompleto = {
  historico: [...aplicadas, ...pendentes].map(([nome]) => nome),
  coluna: true,
  tabela: true,
};

test("modo automático sem aprovação recusa a DDL e não avança o histórico", async (t) => {
  const { migrar, estado } = await fixture(t);
  const resultado = await migrar({ MIGRACAO_AUTOMATICA: "true" });
  assert.notEqual(resultado.status, 0, "O migrador aplicou DDL sem receber aprovação.");
  assert.deepEqual(await estado(), baseIntacta);
});

test("aplica o lote exato e confirma a reapresentação sem reescrever o histórico", async (t) => {
  const { cliente, auto, estado } = await fixture(t);
  const primeira = await auto();
  assert.equal(primeira.status, 0, primeira.stderr);
  assert.deepEqual(await estado(), alvoCompleto);
  const consulta = "SELECT *, xmin::text FROM public._prisma_migrations ORDER BY started_at";
  const { rows: antes } = await cliente.query(consulta);
  const segunda = await auto(undefined, { prova: null });
  assert.equal(segunda.status, 0, segunda.stderr);
  assert.match(segunda.stdout, /já está na última revisão/);
  assert.deepEqual((await cliente.query(consulta)).rows, antes);
});

test("exige autorização byte a byte e não reaplica após removê-la e restaurar a base", async (t) => {
  const { cliente, lote, auto, estado } = await fixture(t);
  const envelope = Buffer.from(JSON.stringify(lote)).toString("base64url");
  async function recusar(prova) {
    const resultado = await auto(lote, { prova });
    assert.equal(resultado.status, 4, resultado.stdout || resultado.stderr);
    assert.match(resultado.stderr, /Autorização de escrita/);
    assert.doesNotMatch(resultado.stdout, /aplicado/);
    assert.deepEqual(await estado(), baseIntacta);
  }
  await recusar(null);
  await recusar(`${envelope[0] === "A" ? "B" : "A"}${envelope.slice(1)}`);
  await recusar(`${envelope}\n`);
  const primeira = await auto();
  assert.equal(primeira.status, 0, primeira.stderr);
  assert.deepEqual(await estado(), alvoCompleto);
  await rm(autorizacao);
  await cliente.query(`BEGIN;
    DROP TABLE public.outra;
    ALTER TABLE public.sintetica DROP COLUMN nova;
    DELETE FROM public._prisma_migrations WHERE migration_name <> '${aplicadas[0][0]}';
    COMMIT`);
  assert.deepEqual(await estado(), baseIntacta);
  await recusar(null);
});

test("recusa IP diferente na conexão efetiva, mesmo com a autorização exata", async (t) => {
  const { lote, auto, estado } = await fixture(t);
  assert.equal(lote.ip, "127.0.0.1");
  const resultado = await auto({ ...lote, ip: "127.0.0.2" });
  assert.equal(resultado.status, 4, resultado.stdout || resultado.stderr);
  assert.match(resultado.stderr, /Identidade do PostgreSQL divergente/);
  assert.doesNotMatch(resultado.stdout, /aplicado/);
  assert.deepEqual(await estado(), baseIntacta);
  const correto = await auto();
  assert.equal(correto.status, 0, correto.stderr);
  assert.deepEqual(await estado(), alvoCompleto);
});

test("recusa identidade divergente e SQL diferente dos bytes aprovados", async (t) => {
  const { lote, auto, escrever, estado } = await fixture(t);
  for (const campo of ["cluster", "banco", "bancoOid", "schema", "schemaOid", "usuario"]) {
    const modificado = { ...lote, [campo]: /^\d/.test(lote[campo]) ? "1234567" : "outro" };
    assert.equal((await auto(modificado)).status, 4, campo);
    assert.deepEqual(await estado(), baseIntacta);
  }
  await escrever([pendentes[1][0], `${pendentes[1][1]}-- Mudança posterior.\n`]);
  assert.equal((await auto()).status, 4);
  assert.deepEqual(await estado(), baseIntacta);
});

test("recusa aplicação parcial e histórico com herança", async (t) => {
  const { cliente, lote, auto, estado } = await fixture(t);
  const [{ nome, sha256 }] = lote.pendentes;
  await cliente.query(
    `INSERT INTO public._prisma_migrations
      (id, migration_name, checksum, applied_steps_count) VALUES ('parcial', $1, $2, 1)`,
    [nome, sha256],
  );
  assert.match((await auto()).stderr, /histórico do PostgreSQL não corresponde/);
  assert.deepEqual(await estado(), { ...baseIntacta, historico: [aplicadas[0][0], nome] });
  await cliente.query("DELETE FROM public._prisma_migrations WHERE id = 'parcial'");
  await cliente.query(
    "CREATE TABLE public.historico_filho () INHERITS (public._prisma_migrations)",
  );
  assert.match((await auto()).stderr, /Tabela de histórico não suportada/);
  assert.deepEqual(await estado(), baseIntacta);
});

test("reverte a primeira DDL e o histórico quando a segunda DDL falha", async (t) => {
  const { lote, auto, escrever, estado } = await fixture(t);
  const invalida = [pendentes[1][0], 'ALTER TABLE "ausente" ADD COLUMN "nova" TEXT;'];
  await escrever(invalida);
  const resultado = await auto({ ...lote, pendentes: nomesEHashes([pendentes[0], invalida]) });
  assert.equal(resultado.status, 3, resultado.stderr);
  assert.match(resultado.stderr, /42P01/);
  assert.doesNotMatch(resultado.stderr, /ausente/);
  assert.doesNotMatch(resultado.stdout, /aplicad/i);
  assert.deepEqual(await estado(), baseIntacta);
});

async function esperarTrava(cliente, relacao, modo, concedida = false) {
  for (let i = 0; i < 150; i += 1) {
    const { rowCount } = await cliente.query(
      `SELECT FROM pg_locks
        WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND relation = $1::regclass AND mode = $2 AND granted = $3`,
      [relacao, modo, concedida],
    );
    if (rowCount === 1) return;
    await esperar(20);
  }
  assert.fail(`O PostgreSQL não observou a trava ${modo} em ${relacao} (concedida: ${concedida}).`);
}

test("revalida a autorização se ela some durante a espera pelo histórico", async (t) => {
  const { cliente, conectar, auto, estado } = await fixture(t);
  const bloqueador = await conectar();
  await bloqueador.query("BEGIN");
  await bloqueador.query("LOCK TABLE public._prisma_migrations IN SHARE ROW EXCLUSIVE MODE");
  const execucao = auto();
  try {
    await esperarTrava(cliente, "public._prisma_migrations", "ShareRowExclusiveLock");
    await rm(autorizacao);
  } finally {
    await bloqueador.query("ROLLBACK");
    await execucao;
  }
  const resultado = await execucao;
  assert.equal(resultado.status, 4, resultado.stdout || resultado.stderr);
  assert.match(resultado.stderr, /Autorização de escrita/);
  assert.deepEqual(await estado(), baseIntacta);
});

test("relê o histórico após uma escrita concorrente confirmar antes da trava", async (t) => {
  const { cliente, conectar, auto, estado } = await fixture(t);
  const escritor = await conectar();
  await escritor.query("BEGIN");
  await escritor.query("UPDATE public._prisma_migrations SET rolled_back_at = clock_timestamp()");
  const execucao = auto();
  try {
    await esperarTrava(cliente, "public._prisma_migrations", "ShareRowExclusiveLock");
    await escritor.query("COMMIT");
  } finally {
    await escritor.query("ROLLBACK");
    const resultado = await execucao;
    assert.equal(resultado.status, 4, resultado.stderr);
  }
  assert.deepEqual(await estado(), baseIntacta);
});

const funcaoGatilho = `CREATE FUNCTION public.gatilho_qa() RETURNS event_trigger
  LANGUAGE plpgsql AS $$ BEGIN NULL; END; $$`;
const criarGatilho =
  "CREATE EVENT TRIGGER gatilho_qa ON ddl_command_start EXECUTE FUNCTION public.gatilho_qa()";

test("revalida o catálogo após a confirmação de um gatilho de evento concorrente", async (t) => {
  const { cliente, conectar, auto, estado } = await fixture(t);
  await cliente.query(funcaoGatilho);
  const escritor = await conectar();
  await escritor.query("BEGIN");
  await escritor.query(criarGatilho);
  const execucao = auto();
  try {
    // O CREATE já retornou, mas o XID da escrita continua em curso mesmo
    // depois de o migrador conseguir a trava SHARE do catálogo.
    await esperarTrava(cliente, "pg_catalog.pg_event_trigger", "ShareLock", true);
    const antesDoCommit = await Promise.race([execucao, esperar(300, "em curso")]);
    assert.equal(antesDoCommit, "em curso");
    assert.deepEqual(await estado(), baseIntacta);
    await escritor.query("COMMIT");
  } finally {
    await escritor.query("ROLLBACK");
    await execucao;
  }
  const resultado = await execucao;
  assert.equal(resultado.status, 4, resultado.stderr);
  assert.match(resultado.stderr, /gatilho de evento/);
  assert.deepEqual(await estado(), baseIntacta);
});

test("retém as travas do catálogo e histórico enquanto o DDL aguarda a tabela alvo", async (t) => {
  const { cliente, conectar, auto, estado } = await fixture(t);
  await cliente.query(funcaoGatilho);
  const bloqueador = await conectar();
  await bloqueador.query("BEGIN");
  await bloqueador.query("LOCK TABLE public.sintetica IN ACCESS SHARE MODE");
  const execucao = auto();
  try {
    await esperarTrava(cliente, "public.sintetica", "AccessExclusiveLock");
    await cliente.query("SET lock_timeout = '200ms'");
    await assert.rejects(
      cliente.query("UPDATE public._prisma_migrations SET checksum = 'divergente'"),
      { code: "55P03" },
    );
    await assert.rejects(cliente.query(criarGatilho), { code: "55P03" });
  } finally {
    await bloqueador.query("ROLLBACK");
    const resultado = await execucao;
    assert.equal(resultado.status, 0, resultado.stderr);
  }
  assert.deepEqual(await estado(), alvoCompleto);
});
