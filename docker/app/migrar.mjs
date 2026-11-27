// Migrador idempotente das migrações Prisma: aplica cada migration.sql uma vez
// e registra em _prisma_migrations. Erro de conexão encerra com código 2.
import { constants } from "node:fs";
import { open, readdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isIPv4 } from "node:net";
import path from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  identificadorPostgres,
  resolverSchema,
  selecionarSchema,
} from "../../src/infra/schema-postgres.mjs";

const TIMEOUT_CONEXAO_MS = 5000;
const TIMEOUT_TRAVA_AUTO_MS = 5000;
const AUTORIZACAO_ESCRITA = "/run/frequenciapp-migracao/autorizar";
// Roteiro de recuperação citado nas mensagens de bloqueio.
const RECUPERACAO = "docs/auto-hospedagem.md#migração-incompleta-ou-checksum-divergente";

// Trava própria do migrador: dois contêineres subindo ao mesmo tempo
// serializam as migrações em vez de tentar aplicar a mesma em paralelo.
const CHAVE_TRAVA = 727001;
// Trava que o Prisma CLI usa internamente em `prisma migrate deploy`. Tomá-la
// também serializa este migrador com execuções manuais do CLI no mesmo schema.
const CHAVE_TRAVA_PRISMA = 72707369;

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
      return "A tabela esperada não existe. Confira as migrações do schema configurado.";
    case "3F000":
      return "Confira o schema de DIRECT_URL ou DATABASE_URL antes de aplicar migrações.";
    case "42501":
      return "Confira as permissões da conexão no schema configurado.";
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
const automatica = process.env.MIGRACAO_AUTOMATICA === "true";
const manual = process.env.MIGRACAO_MANUAL_PROTEGIDA === "true";
const protegida = automatica || manual;
if (!url) {
  console.error("[migrar] DIRECT_URL ou DATABASE_URL não definida.");
  process.exit(1);
}
try {
  resolverSchema({ url, schemaExplicito: process.env.DATABASE_SCHEMA });
} catch (erro) {
  console.error(`[migrar] ${erro.message}`);
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
    const motivo = protegida ? codigoDoErro(erro) : descreverErro(erro);
    console.error(`[migrar] Sem conexão com o banco (${motivo})`);
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

class RecusaAutomatica extends Error {}

function exigirAprovacao(condicao, motivo) {
  if (!condicao) throw new RecusaAutomatica(motivo);
}

function lerAprovacao(codificada) {
  const recusa = "Aprovação do lote ausente ou inválida.";
  exigirAprovacao(codificada && codificada.length <= 120000, recusa);
  const bytes = Buffer.from(codificada, "base64url");
  exigirAprovacao(bytes.toString("base64url") === codificada, recusa);
  let lote;
  try {
    lote = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw new RecusaAutomatica(recusa);
  }
  const confere = (padrao, valor) => typeof valor === "string" && padrao.exec(valor)?.[0] === valor;
  exigirAprovacao(
    lote && typeof lote === "object" && Object.keys(lote).length === (manual ? 12 : 11),
    recusa,
  );
  const {
    cluster,
    banco,
    bancoOid,
    schema,
    schemaOid,
    usuario,
    ip,
    base,
    alvo,
    aplicadas,
    pendentes,
  } = lote;
  exigirAprovacao(
    confere(/^[1-9][0-9]{0,19}$/, cluster) &&
      [bancoOid, schemaOid].every((oid) => confere(/^[1-9][0-9]{0,9}$/, oid)) &&
      [banco, usuario].every((nome) => confere(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/, nome)) &&
      typeof ip === "string" &&
      isIPv4(ip) &&
      (manual ? confere(/^[0-9]+\.[0-9]{6}$/, lote.inicio) : !Object.hasOwn(lote, "inicio")) &&
      confere(/^[a-z_][a-z0-9_]{0,62}$/, schema) &&
      !schema.startsWith("pg_") &&
      schema !== "information_schema" &&
      [base, alvo].every((sha) => confere(/^[0-9a-f]{40}$/, sha)) &&
      base !== alvo &&
      Array.isArray(aplicadas) &&
      aplicadas.length > 0 &&
      Array.isArray(pendentes) &&
      (manual || (pendentes.length > 0 && pendentes.length <= 64)) &&
      aplicadas.length + pendentes.length <= 2048,
    recusa,
  );
  const nomes = new Set();
  let ultimo = "";
  for (const entrada of [...aplicadas, ...pendentes]) {
    exigirAprovacao(
      entrada &&
        Object.keys(entrada).length === 2 &&
        confere(/^[0-9]{14}_[a-z0-9_]{1,120}$/, entrada.nome) &&
        (manual ? !nomes.has(entrada.nome) : entrada.nome > ultimo) &&
        confere(/^[0-9a-f]{64}$/, entrada.sha256),
      recusa,
    );
    ultimo = entrada.nome;
    nomes.add(entrada.nome);
  }
  if (!manual)
    exigirAprovacao(pendentes[0].nome.slice(0, 14) > aplicadas.at(-1).nome.slice(0, 14), recusa);
  return lote;
}

async function conferirAutorizacaoEscrita(envelope) {
  const esperado = Buffer.from(envelope, "ascii");
  const recusa = "Autorização de escrita ausente ou divergente para o lote aprovado.";
  try {
    const arquivo = await open(
      AUTORIZACAO_ESCRITA,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await arquivo.stat();
      exigirAprovacao(info.isFile() && info.size === esperado.length, recusa);
      const bytes = Buffer.alloc(esperado.length + 1);
      let total = 0;
      while (total < bytes.length) {
        const { bytesRead } = await arquivo.read(bytes, total, bytes.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      exigirAprovacao(bytes.subarray(0, total).equals(esperado), recusa);
    } finally {
      await arquivo.close();
    }
  } catch {
    throw new RecusaAutomatica(recusa);
  }
}

async function lerSqlAprovado(lote) {
  const arquivos = [...lote.aplicadas, ...lote.pendentes].sort((a, b) =>
    a.nome < b.nome ? -1 : a.nome === b.nome ? 0 : 1,
  );
  const pendentes = new Map(lote.pendentes.map(({ nome }, i) => [nome, i]));
  const pastas = await listar();
  const recusa = "Os arquivos de migração não correspondem ao lote aprovado.";
  exigirAprovacao(
    pastas.length === arquivos.length && pastas.every((nome, i) => nome === arquivos[i].nome),
    recusa,
  );
  const sqls = [];
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  for (const { nome, sha256 } of arquivos) {
    const bytes = await readFile(path.join(pasta, nome, "migration.sql"));
    exigirAprovacao(createHash("sha256").update(bytes).digest("hex") === sha256, recusa);
    // Executar a mesma leitura verificada, sem buscar novamente o arquivo.
    if (pendentes.has(nome)) sqls[pendentes.get(nome)] = decoder.decode(bytes);
  }
  return sqls;
}

async function esperarEscritasAnteriores() {
  // CREATE EVENT TRIGGER pode soltar a trava da relação de catálogo antes do
  // commit. Os XIDs dessas escritas ainda estão travados, inclusive em PREPARE.
  // Depois do SHARE de catálogo, novas transações não podem iniciar tais escritas.
  // pg_locks não identifica o banco dos XIDs preparados: o limite é conservador
  // e pode recusar o lote enquanto outra escrita no cluster não terminar.
  const xidsEmCurso = `SELECT transactionid FROM pg_catalog.pg_locks
    WHERE locktype = 'transactionid' AND mode = 'ExclusiveLock' AND granted
      AND pid IS DISTINCT FROM pg_catalog.pg_backend_pid()`;
  const { rows } = await cliente.query(xidsEmCurso);
  if (rows.length === 0) return;
  const xids = rows.map(({ transactionid }) => transactionid);
  const prazo = performance.now() + TIMEOUT_TRAVA_AUTO_MS;
  while (performance.now() < prazo) {
    const { rowCount } = await cliente.query(
      `${xidsEmCurso} AND transactionid = ANY($1::xid[]) LIMIT 1`,
      [xids],
    );
    if (rowCount === 0) return;
    await esperar(50);
  }
  throw new RecusaAutomatica("Escrita concorrente não concluída antes da conferência do catálogo.");
}

async function conferirBaseBloqueada(lote, historico, progresso = 0) {
  // Os locks e a leitura não podem compartilhar o mesmo snapshot: uma escrita
  // que terminou enquanto LOCK aguardava precisa aparecer na primeira leitura.
  await cliente.query(
    "LOCK TABLE pg_catalog.pg_event_trigger, pg_catalog.pg_namespace IN SHARE MODE",
  );
  await cliente.query(`LOCK TABLE ONLY ${historico} IN SHARE ROW EXCLUSIVE MODE`);
  await esperarEscritasAnteriores();
  const {
    rows: [atual],
  } = await cliente.query(
    `SELECT (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS cluster,
      current_database() AS banco,
      (SELECT oid::text FROM pg_catalog.pg_database WHERE datname = current_database()) AS "bancoOid",
      nspname AS schema, n.oid::text AS "schemaOid", current_user AS usuario,
      pg_catalog.host(pg_catalog.inet_server_addr()) AS ip,
      ${manual ? "EXTRACT(epoch FROM pg_catalog.pg_postmaster_start_time())::text AS inicio," : ""}
      NOT pg_catalog.pg_is_in_recovery() AS primario,
      NOT EXISTS (SELECT FROM pg_catalog.pg_event_trigger WHERE evtenabled <> 'D') AS sem_gatilhos,
      EXISTS (
        SELECT FROM pg_catalog.pg_class c
        WHERE c.relnamespace = n.oid AND c.relname = '_prisma_migrations'
          AND c.relkind = 'r' AND c.relpersistence = 'p' AND NOT c.relispartition
          AND NOT c.relrowsecurity AND NOT c.relhasrules AND NOT c.relhastriggers
          AND NOT EXISTS (SELECT FROM pg_catalog.pg_inherits WHERE inhparent = c.oid OR inhrelid = c.oid)
      ) AS historico_simples
      FROM pg_catalog.pg_namespace n WHERE nspname = $1`,
    [lote.schema],
  );
  exigirAprovacao(
    atual?.primario === true &&
      atual.sem_gatilhos === true &&
      [
        "cluster",
        "banco",
        "bancoOid",
        "schema",
        "schemaOid",
        "usuario",
        ...(!manual ? ["ip"] : []),
      ].every((campo) => atual[campo] === lote[campo]),
    "Identidade do PostgreSQL divergente ou gatilho de evento habilitado.",
  );
  exigirAprovacao(
    atual.historico_simples === true,
    "Tabela de histórico não suportada pela aprovação automática.",
  );
  const { rows: registros } = await cliente.query(
    `SELECT migration_name, checksum,
      (rolled_back_at IS NULL AND finished_at IS NOT NULL AND finished_at >= started_at
        AND pg_catalog.isfinite(started_at) AND pg_catalog.isfinite(finished_at)
        AND applied_steps_count > 0 AND count(*) OVER (PARTITION BY started_at) = 1) AS completa
      FROM ONLY ${historico} ${manual ? "WHERE rolled_back_at IS NULL" : ""}
      ORDER BY started_at LIMIT $1`,
    [lote.aplicadas.length + lote.pendentes.length + 1],
  );
  const completas = [...lote.aplicadas, ...lote.pendentes];
  if (manual) {
    const porNome = new Map(registros.map((r) => [r.migration_name, r]));
    const confere = (esperadas) =>
      registros.length === esperadas.length &&
      esperadas.every(({ nome, sha256 }) => {
        const r = porNome.get(nome);
        return r?.completa === true && r.checksum === sha256;
      });
    if (progresso === 0 && confere(completas)) return true;
    exigirAprovacao(
      atual.ip === lote.ip && atual.inicio === lote.inicio,
      "O endpoint ou a partida do PostgreSQL mudou antes da migração manual.",
    );
    exigirAprovacao(
      confere(completas.slice(0, lote.aplicadas.length + progresso)),
      "O histórico diverge da base ou do progresso desta execução manual.",
    );
    return false;
  }
  exigirAprovacao(
    (registros.length === lote.aplicadas.length || registros.length === completas.length) &&
      registros.every(
        ({ migration_name, checksum, completa }, i) =>
          completa === true &&
          migration_name === completas[i].nome &&
          checksum === completas[i].sha256,
      ),
    "O histórico do PostgreSQL não corresponde à base nem ao lote completo aprovado.",
  );
  return registros.length === completas.length;
}

async function aplicarLoteAutomatico(lote, sqls, envelope) {
  const schema = identificadorPostgres(lote.schema);
  const historico = `${schema}._prisma_migrations`;
  await cliente.query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
  try {
    const concluido = await conferirBaseBloqueada(lote, historico);
    if (!concluido) {
      // pg_temp no fim evita precedência implícita para nomes de relações.
      await cliente.query("SELECT pg_catalog.set_config('search_path', $1, true)", [
        `${schema}, pg_temp`,
      ]);
      await conferirAutorizacaoEscrita(envelope);
      for (const [i, { nome, sha256 }] of lote.pendentes.entries()) {
        await cliente.query(sqls[i]);
        // now() seria constante neste lote; o histórico exige ordem estrita.
        await cliente.query(
          `INSERT INTO ${historico}
            (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
           SELECT $1, $2, instante, $3, NULL, instante, 1
             FROM (SELECT greatest(clock_timestamp(), max(started_at) + interval '1 microsecond')
               AS instante FROM ${historico}) AS tempo`,
          [randomUUID(), sha256, nome],
        );
      }
    }
    await cliente.query("COMMIT");
    if (concluido) console.log("[migrar] Banco já está na última revisão.");
    else console.log(`[migrar] Lote automático aplicado: ${lote.pendentes.length} migrações.`);
  } catch (erro) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw erro;
  }
}

async function aplicarLoteManual(lote, sqls, envelope) {
  const schema = identificadorPostgres(lote.schema);
  const historico = `${schema}._prisma_migrations`;
  // Só esta invocação avança sobre seu próprio progresso; outra partida não
  // adota um histórico parcial. O commit continua sendo feito por migração.
  for (let i = 0; i < Math.max(1, lote.pendentes.length); i += 1) {
    await cliente.query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
    try {
      if (await conferirBaseBloqueada(lote, historico, i)) {
        await cliente.query("ROLLBACK");
        console.log("[migrar] Banco já está na última revisão.");
        return;
      }
      await cliente.query("SELECT pg_catalog.set_config('search_path', $1, true)", [
        `${schema}, pg_temp`,
      ]);
      await conferirAutorizacaoEscrita(envelope);
      const { nome, sha256 } = lote.pendentes[i];
      await cliente.query(sqls[i]);
      await cliente.query(
        `INSERT INTO ${historico}
          (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
        VALUES ($1, $2, now(), $3, NULL, now(), 1)`,
        [randomUUID(), sha256, nome],
      );
      await cliente.query("COMMIT");
      console.log(`[migrar] Aplicada: ${nome}`);
    } catch (erro) {
      await cliente.query("ROLLBACK").catch(() => undefined);
      throw erro;
    }
  }
}

async function main() {
  const envelope = process.env.MIGRACAO_LOTE_APROVADO;
  exigirAprovacao(!(manual && automatica), "Modos manual e automático incompatíveis.");
  const lote = protegida ? lerAprovacao(envelope) : undefined;
  const sqls = lote ? await lerSqlAprovado(lote) : undefined;
  if (lote) {
    exigirAprovacao(
      resolverSchema({ url, schemaExplicito: process.env.DATABASE_SCHEMA }) === lote.schema,
      "O schema configurado não corresponde ao lote aprovado.",
    );
  }
  await conectar();
  if (lote) {
    // Limita tanto as travas consultivas quanto a espera por travas de DDL.
    await cliente.query(`SET lock_timeout = '${TIMEOUT_TRAVA_AUTO_MS}ms'`);
    await cliente.query("SET statement_timeout = '30s'");
    await cliente.query("SET search_path = pg_catalog");
  } else {
    await selecionarSchema(cliente, url);
  }
  // A ordem fixa das travas evita deadlock com o CLI do Prisma.
  await cliente.query("select pg_advisory_lock($1)", [CHAVE_TRAVA_PRISMA]);
  await cliente.query("select pg_advisory_lock($1)", [CHAVE_TRAVA]);

  if (lote) {
    if (manual) await aplicarLoteManual(lote, sqls, envelope);
    else await aplicarLoteAutomatico(lote, sqls, envelope);
    await cliente.end();
    return;
  }

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

  const registros = (
    await cliente.query(
      "select migration_name, checksum, finished_at from _prisma_migrations where rolled_back_at is null",
    )
  ).rows;
  const incompleta = registros.find((linha) => linha.finished_at == null);
  if (incompleta) {
    console.error(
      `[migrar] A migração ${incompleta.migration_name} está incompleta e não foi revertida. ` +
        "A aplicação de migrações foi interrompida antes de aplicar novas migrações. " +
        `Preserve o banco e consulte o roteiro de recuperação em ${RECUPERACAO}.`,
    );
    process.exit(4);
  }
  const aplicadas = new Map(registros.map((linha) => [linha.migration_name, linha.checksum]));

  const pastas = await listar();
  if (pastas.length === 0) {
    console.error("[migrar] Nenhuma migração encontrada em prisma/migrations.");
    process.exit(1);
  }

  // Migração já aplicada não pode mudar de conteúdo: o banco e o repositório
  // precisam contar a mesma história. A recuperação segue o roteiro da documentação.
  for (const nome of pastas) {
    if (!aplicadas.has(nome)) continue;
    const sql = await readFile(path.join(pasta, nome, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (aplicadas.get(nome) !== checksum) {
      console.error(
        `[migrar] A migração ${nome} já aplicada teve o conteúdo alterado. ` +
          "A aplicação de migrações foi interrompida antes de aplicar novas migrações. " +
          `Preserve o banco e consulte o roteiro de recuperação em ${RECUPERACAO}.`,
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
  await cliente.query("select pg_advisory_unlock($1)", [CHAVE_TRAVA_PRISMA]);
  await cliente.end();
}

main().catch(async (erro) => {
  const motivo = protegida
    ? erro instanceof RecusaAutomatica
      ? erro.message
      : codigoDoErro(erro)
    : descreverErro(erro);
  console.error(`[migrar] Não foi possível preparar as migrações (${motivo})`);
  await cliente.end().catch(() => undefined);
  process.exitCode = erro instanceof RecusaAutomatica ? 4 : 3;
});
