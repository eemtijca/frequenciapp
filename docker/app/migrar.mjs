// Migrador idempotente das migrações Prisma: aplica cada migration.sql uma vez
// e registra em _prisma_migrations. Erro de conexão encerra com código 2.
import { readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const TIMEOUT_CONEXAO_MS = 5000;

// Chave fixa da trava consultiva: dois contêineres subindo ao mesmo tempo
// serializam as migrações em vez de tentar aplicar a mesma em paralelo.
const CHAVE_TRAVA = 727001;

function codigoDoErro(erro) {
  if (erro && typeof erro === "object" && "code" in erro && typeof erro.code === "string") {
    return erro.code;
  }
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  if (/timeout|timed out/i.test(mensagem)) return "ETIMEDOUT";
  if (/getaddrinfo|ENOTFOUND/i.test(mensagem)) return "ENOTFOUND";
  if (/ECONNREFUSED|connection refused/i.test(mensagem)) return "ECONNREFUSED";
  return "SEM_CODIGO";
}

function orientacaoDoErro(codigo) {
  switch (codigo) {
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
      return "A conexão expirou. Verifique a rede do contêiner, VPN, firewall e o host do banco.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Não foi possível resolver o hostname do banco. Confira DIRECT_URL, DATABASE_URL e o DNS.";
    case "ECONNREFUSED":
      return "O banco recusou a conexão. Verifique se o PostgreSQL está ouvindo na porta configurada.";
    case "28P01":
      return "Usuário ou senha inválidos. Confira as credenciais da connection string.";
    case "3D000":
      return "O banco informado não existe. Confira o nome do banco na connection string.";
    case "42P01":
      return "O schema esperado não existe. Aplique as migrations ou corrija o schema configurado.";
    default:
      return "Verifique as credenciais, o banco e a rede entre os contêineres.";
  }
}

function descreverErro(erro) {
  const codigo = codigoDoErro(erro);
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return `${codigo}: ${mensagem} ${orientacaoDoErro(codigo)}`;
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..");
const pasta = path.join(raiz, "prisma", "migrations");

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[migrar] DIRECT_URL ou DATABASE_URL não definida.");
  process.exit(1);
}

const cliente = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: TIMEOUT_CONEXAO_MS,
});

async function conectar() {
  try {
    await cliente.connect();
  } catch (erro) {
    console.error(`[migrar] Sem conexão com o banco (${descreverErro(erro)})`);
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
  await cliente.query("select pg_advisory_lock($1)", [CHAVE_TRAVA]);

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

  const aplicadas = new Map(
    (
      await cliente.query(
        "select migration_name, checksum from _prisma_migrations where rolled_back_at is null",
      )
    ).rows.map((linha) => [linha.migration_name, linha.checksum]),
  );

  const pastas = await listar();
  if (pastas.length === 0) {
    console.error("[migrar] Nenhuma migração encontrada em prisma/migrations.");
    process.exit(1);
  }

  // Migração já aplicada não pode mudar de conteúdo: o banco e o repositório
  // precisam contar a mesma história. Recrie o ambiente para seguir.
  for (const nome of pastas) {
    if (!aplicadas.has(nome)) continue;
    const sql = await readFile(path.join(pasta, nome, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (aplicadas.get(nome) !== checksum) {
      console.error(
        `[migrar] A migração ${nome} já aplicada teve o conteúdo alterado. ` +
          "Recrie o banco (migrate reset ou docker compose down -v) antes de continuar.",
      );
      process.exit(4);
    }
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
  await cliente.query("select pg_advisory_unlock($1)", [CHAVE_TRAVA]);
  await cliente.end();
}

main();
