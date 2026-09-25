// Migrador idempotente das migrações Prisma. Aplica cada
// prisma/migrations/*/migration.sql uma vez, na ordem, registrando em
// _prisma_migrations no mesmo formato do Prisma 7, de modo que um
// `prisma migrate deploy` posterior reconheça o estado e não reaplique
// nada. Erros de conexão encerram com código 2 para o entrypoint
// tentar de novo.
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..");
const pasta = path.join(raiz, "prisma", "migrations");

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[migrar] DIRECT_URL ou DATABASE_URL não definida.");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });

async function conectar() {
  try {
    await cliente.connect();
  } catch (erro) {
    console.error("[migrar] Sem conexão com o banco:", erro.message);
    process.exit(2);
  }
}

async function listar() {
  const entradas = await readdir(pasta, { withFileTypes: true });
  return entradas
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

async function main() {
  await conectar();

  await cliente.query(
    `create table if not exists _prisma_migrations (
       id varchar(36) primary key,
       checksum varchar(64) not null,
       finished_at timestamptz not null default now(),
       migration_name varchar(255) not null,
       logs text,
       rolled_back_at timestamptz,
       started_at timestamptz not null default now(),
       applied_steps_count integer not null default 0
     )`,
  );

  const aplicadas = new Set(
    (await cliente.query("select migration_name from _prisma_migrations")).rows.map(
      (linha) => linha.migration_name,
    ),
  );

  const pastas = await listar();
  if (pastas.length === 0) {
    console.error("[migrar] Nenhuma migração encontrada em prisma/migrations.");
    process.exit(1);
  }

  let novas = 0;
  for (const nome of pastas) {
    if (aplicadas.has(nome)) continue;
    const sql = await readFile(path.join(pasta, nome, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    try {
      await cliente.query("begin");
      await cliente.query(sql);
      await cliente.query(
        `insert into _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
         values ($1, $2, now(), $3, null, now(), 1)`,
        [randomUUID(), checksum, nome],
      );
      await cliente.query("commit");
      novas += 1;
      console.log(`[migrar] Aplicada: ${nome}`);
    } catch (erro) {
      await cliente.query("rollback").catch(() => undefined);
      console.error(`[migrar] Falha em ${nome}:`, erro.message);
      process.exit(3);
    }
  }

  if (novas === 0) {
    console.log("[migrar] Banco já está na última revisão.");
  }
  await cliente.end();
}

main();
