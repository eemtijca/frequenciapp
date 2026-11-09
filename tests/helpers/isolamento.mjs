// Guarda das fixtures antes de instanciar clientes ou iniciar limpezas.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { request } from "node:http";
import pg from "pg";
import { lstatSync, readFileSync, readlinkSync, readdirSync } from "node:fs";

export const PASTA_PROVA = "/run/frequenciapp-isolamento";
export function recusarIsolamento() {
  return new Error("Isolamento de testes não comprovado. Usar tests/isolamento/executar.mjs.");
}

/** A prova vem do executor, não de uma URL local ou de uma flag isolada. */
export function exigirIsolamento(ambiente = process.env) {
  try {
    if (ambiente.FREQUENCIAPP_ISOLAMENTO !== "1") throw recusarIsolamento();
    const arquivo = `${PASTA_PROVA}/manifesto.json`;
    const stat = lstatSync(arquivo);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid()) {
      throw recusarIsolamento();
    }
    const prova = JSON.parse(readFileSync(arquivo, "utf8"));
    if (
      prova.versao !== 1 ||
      !/^[a-f0-9]{32}$/.test(prova.rodada) ||
      !/^[a-f0-9]{64}$/.test(prova.marcador) ||
      readlinkSync("/proc/self/ns/net") !== prova.rede ||
      readdirSync("/sys/class/net").some((nome) => nome !== "lo") ||
      readFileSync("/proc/net/route", "utf8").trim().split("\n").length !== 1
    ) {
      throw recusarIsolamento();
    }
    const url = new URL(prova.databaseUrl);
    if (
      url.protocol !== "postgresql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "5432" ||
      url.username !== `ft_${prova.rodada}` ||
      url.pathname !== `/ft_${prova.rodada}` ||
      !url.password ||
      url.hash ||
      url.search !== "?schema=public" ||
      prova.appUrl !== "http://127.0.0.1:3000" ||
      ambiente.DATABASE_URL !== prova.databaseUrl ||
      ambiente.DIRECT_URL !== prova.databaseUrl ||
      ambiente.APP_URL !== prova.appUrl ||
      ambiente.TEST_BASE_URL !== prova.appUrl ||
      ambiente.DATABASE_SCHEMA !== "public" ||
      Object.keys(ambiente).some((chave) => chave.startsWith("PG") && ambiente[chave])
    ) {
      throw recusarIsolamento();
    }
    return prova;
  } catch {
    throw recusarIsolamento();
  }
}

export function assinaturaMigracoes() {
  return readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort()
    .map((nome) => [
      nome,
      createHash("sha256")
        .update(readFileSync(`prisma/migrations/${nome}/migration.sql`))
        .digest("hex"),
    ]);
}

export function assinarDesafio(prova, desafio) {
  return createHmac("sha256", prova.marcador)
    .update(`${prova.rodada}:${prova.databaseUrl}:${prova.rede}:${desafio}`)
    .digest("hex");
}

/** Apenas leitura; o provisionador já comprovou o namespace antes de conectar. */
export async function conferirBanco(cliente, prova) {
  const { rows } = await cliente.query(`select current_database() as banco, current_user as papel,
    current_schema() as schema, marcador from public._frequenciapp_isolamento`);
  const registro = rows[0];
  if (
    rows.length !== 1 ||
    registro.banco !== `ft_${prova.rodada}` ||
    registro.papel !== `ft_${prova.rodada}` ||
    registro.schema !== "public" ||
    registro.marcador !== prova.marcador
  )
    throw recusarIsolamento();
  const migracoes =
    await cliente.query(`select migration_name, checksum, finished_at, rolled_back_at
    from public._prisma_migrations order by migration_name`);
  if (
    migracoes.rows.some((item) => !item.finished_at || item.rolled_back_at) ||
    JSON.stringify(migracoes.rows.map((item) => [item.migration_name, item.checksum])) !==
      JSON.stringify(assinaturaMigracoes())
  )
    throw recusarIsolamento();
}

function consultarRuntime(desafio) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: `${PASTA_PROVA}/app.sock`, path: `/${desafio}` }, (res) => {
      let corpo = "";
      res.on("data", (parte) => {
        corpo += parte;
        if (corpo.length > 4096) req.destroy(recusarIsolamento());
      });
      res.on("error", reject);
      res.on("end", () => {
        try {
          resolve(JSON.parse(corpo));
        } catch {
          reject(recusarIsolamento());
        }
      });
    });
    req.setTimeout(3000, () => req.destroy(recusarIsolamento()));
    req.on("error", reject);
    req.end();
  });
}

/** Prova privada do processo que serve HTTP e do mesmo banco migrado. Sem cache. */
export async function verificarIsolamento() {
  const prova = exigirIsolamento();
  const desafio = randomBytes(32).toString("hex");
  const runtime = await consultarRuntime(desafio);
  const assinatura = assinarDesafio(prova, desafio);
  if (
    runtime.assinatura !== assinatura ||
    runtime.rodada !== prova.rodada ||
    runtime.rede !== prova.rede ||
    runtime.appUrl !== prova.appUrl ||
    !Number.isInteger(runtime.pid) ||
    runtime.pid <= 0
  )
    throw recusarIsolamento();
  const resposta = await fetch(`${prova.appUrl}/api/saude`, {
    headers: { "x-frequenciapp-desafio": desafio },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!resposta.ok || resposta.headers.get("x-frequenciapp-prova") !== assinatura)
    throw recusarIsolamento();
  const cliente = new pg.Client({
    connectionString: prova.databaseUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
  });
  let falhou = false;
  let original;
  try {
    await cliente.connect();
    await conferirBanco(cliente, prova);
  } catch (erro) {
    falhou = true;
    original = erro;
    throw erro;
  } finally {
    try {
      await cliente.end();
    } catch (erro) {
      if (falhou)
        throw new AggregateError([original, erro], "Falha na prova de isolamento e no fechamento.");
      throw erro;
    }
  }
  return prova;
}
