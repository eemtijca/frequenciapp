// Automação do schema de preview por pull request: preparar, limpar e faxina.
// Roda no CI com a role preview_migrador e a URL base em DIRECT_URL_PREVIEW.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { identificadorPostgres } from "../src/infra/schema-postgres.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIXO = "preview_pr_";
const TIMEOUT_CONEXAO_MS = 8000;

/** Nome do schema do pull request, validado para uso como identificador. */
export function nomeDoSchema(pr) {
  const numero = Number(pr);
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error("O número do pull request é inválido para o schema de preview.");
  }
  return `${PREFIXO}${numero}`;
}

/** Conta sintética criada em cada schema de preview. */
export function emailDaConta(pr) {
  return `preview-pr-${Number(pr)}@escola.exemplo`;
}

/** Schemas de preview cujo pull request não está mais aberto. */
export function schemasParaRemover(existentes, abertos) {
  const numerosAbertos = new Set(abertos.map(Number));
  return existentes.filter((nome) => {
    const encontrado = /^preview_pr_(\d+)$/.exec(nome);
    return encontrado ? !numerosAbertos.has(Number(encontrado[1])) : false;
  });
}

function urlDoPreview() {
  const url = process.env.DIRECT_URL_PREVIEW;
  if (!url) {
    throw new Error("DIRECT_URL_PREVIEW não definida no ambiente do workflow.");
  }
  return url;
}

async function conectar() {
  const cliente = new pg.Client({
    connectionString: urlDoPreview(),
    connectionTimeoutMillis: TIMEOUT_CONEXAO_MS,
  });
  await cliente.connect();
  return cliente;
}

async function criarEstrutura(cliente, schema) {
  const nome = identificadorPostgres(schema);
  await cliente.query(`create schema if not exists ${nome}`);
  await cliente.query(`grant usage, create on schema ${nome} to preview_migrador`);
  await cliente.query(`grant usage on schema ${nome} to preview_app`);
  await cliente.query(
    `alter default privileges for role preview_migrador in schema ${nome}
       grant select, insert, update, delete on tables to preview_app`,
  );
  await cliente.query(
    `alter default privileges for role preview_migrador in schema ${nome}
       grant usage, select on sequences to preview_app`,
  );
  await cliente.query(
    `alter default privileges for role preview_migrador in schema ${nome}
       grant usage on types to preview_app`,
  );
}

function executar(arquivo, argumentos, variaveis) {
  execFileSync(process.execPath, [path.join(RAIZ, arquivo), ...argumentos], {
    cwd: RAIZ,
    env: { ...process.env, DATABASE_URL: "", ...variaveis },
    stdio: "inherit",
  });
}

async function preparar(pr) {
  const schema = nomeDoSchema(pr);
  const cliente = await conectar();
  try {
    await criarEstrutura(cliente, schema);
  } finally {
    await cliente.end();
  }
  executar("docker/app/migrar.mjs", [], {
    DIRECT_URL: urlDoPreview(),
    DATABASE_SCHEMA: schema,
  });
  if (process.env.ADMIN_SENHA_PREVIEW) {
    executar("scripts/criar-admin.mjs", ["--somente-criar"], {
      DIRECT_URL: urlDoPreview(),
      DATABASE_SCHEMA: schema,
      ADMIN_EMAIL: emailDaConta(pr),
      ADMIN_SENHA: process.env.ADMIN_SENHA_PREVIEW,
      ADMIN_NOME: "Preview",
    });
  } else {
    console.log("[preview] ADMIN_SENHA_PREVIEW ausente; conta de teste não criada.");
  }
  await configurarVercel(schema);
}

async function limpar(pr) {
  const schema = nomeDoSchema(pr);
  const cliente = await conectar();
  try {
    await cliente.query("set lock_timeout = '5s'");
    await cliente.query(`drop schema if exists ${identificadorPostgres(schema)} cascade`);
    console.log(`[preview] Schema ${schema} removido.`);
  } finally {
    await cliente.end();
  }
}

async function listarSchemas(cliente) {
  const { rows } = await cliente.query(
    "select nspname from pg_catalog.pg_namespace where starts_with(nspname, 'preview_pr_') order by nspname",
  );
  return rows.map((linha) => linha.nspname);
}

async function prsAbertos() {
  const repositorio = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repositorio || !token) {
    throw new Error("GITHUB_REPOSITORY e GITHUB_TOKEN são necessários na faxina.");
  }
  const resposta = await fetch(
    `https://api.github.com/repos/${repositorio}/pulls?state=open&per_page=100`,
    { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` } },
  );
  if (!resposta.ok) {
    throw new Error(
      `A API do GitHub respondeu HTTP ${resposta.status} ao listar os pull requests.`,
    );
  }
  const lista = await resposta.json();
  return lista.map((item) => item.number);
}

async function faxina() {
  const cliente = await conectar();
  try {
    const existentes = await listarSchemas(cliente);
    const abertos = await prsAbertos();
    const remover = schemasParaRemover(existentes, abertos);
    for (const nome of remover) {
      await cliente.query("set lock_timeout = '5s'");
      await cliente.query(`drop schema if exists ${identificadorPostgres(nome)} cascade`);
      console.log(`[preview] Órfão removido: ${nome}`);
    }
    console.log(`[preview] Faxina concluída: ${remover.length} schema(s) removido(s).`);
  } finally {
    await cliente.end();
  }
}

async function pedir(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  if (!resposta.ok) {
    throw new Error(`${opcoes?.method ?? "GET"} ${new URL(url).pathname}: HTTP ${resposta.status}`);
  }
  return resposta.json().catch(() => ({}));
}

async function configurarVercel(schema) {
  const token = process.env.VERCEL_TOKEN;
  const projeto = process.env.VERCEL_PROJECT_ID;
  const branch = process.env.PREVIEW_BRANCH;
  if (!token || !projeto || !branch) {
    console.log(
      "[preview] Vercel sem token, projeto ou branch; o deployment usa o schema de fallback.",
    );
    return;
  }
  const consulta = process.env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`
    : "";
  const api = "https://api.vercel.com";
  const cabecalhos = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  try {
    const lista = await pedir(`${api}/v10/projects/${projeto}/env${consulta}`, {
      headers: cabecalhos,
    });
    const variaveis = Array.isArray(lista) ? lista : (lista.envs ?? []);
    const existente = variaveis.find(
      (item) => item.key === "DATABASE_SCHEMA" && item.gitBranch === branch,
    );
    if (existente) {
      await pedir(`${api}/v9/projects/${projeto}/env/${existente.id}${consulta}`, {
        method: "PATCH",
        headers: cabecalhos,
        body: JSON.stringify({ value: schema }),
      });
    } else {
      await pedir(`${api}/v10/projects/${projeto}/env${consulta}`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify({
          key: "DATABASE_SCHEMA",
          value: schema,
          type: "plain",
          target: ["preview"],
          gitBranch: branch,
        }),
      });
    }
    console.log(`[preview] DATABASE_SCHEMA=${schema} configurado para a branch ${branch}.`);
    const informacoes = await pedir(`${api}/v9/projects/${projeto}${consulta}`, {
      headers: cabecalhos,
    });
    const repoId = informacoes?.link?.repoId;
    if (!repoId) {
      console.log("[preview] Projeto sem repositório vinculado; dispare o deployment manualmente.");
      return;
    }
    await pedir(`${api}/v13/deployments${consulta}`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({
        name: projeto,
        target: "preview",
        gitSource: { type: "github", ref: branch, repoId },
      }),
    });
    console.log("[preview] Deployment de preview disparado com o schema do pull request.");
  } catch (erro) {
    console.error(
      `[preview] Não foi possível configurar a Vercel (${erro.message}). O schema já está migrado; o deployment usa o fallback até o ajuste.`,
    );
  }
}

function argumento(nome) {
  const indice = process.argv.indexOf(nome);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

async function principal() {
  switch (process.argv[2]) {
    case "preparar":
      await preparar(argumento("--pr"));
      break;
    case "limpar":
      await limpar(argumento("--pr"));
      break;
    case "faxina":
      await faxina();
      break;
    default:
      console.error("Uso: preview-schema.mjs <preparar --pr N | limpar --pr N | faxina>");
      process.exitCode = 1;
  }
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) {
  principal().catch((erro) => {
    console.error(`[preview] ${erro.message}`);
    process.exitCode = 1;
  });
}
