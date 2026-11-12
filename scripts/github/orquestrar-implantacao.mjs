// Um proprietário por destino: validar e construir antes de migrar, publicar e promover.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validarPublicacao } from "./validar-publicacao.mjs";

// O build da Vercel não recebe os segredos do projeto; valores descartáveis
// permitem validar o ambiente sem gravar credenciais reais no runner.
const AMBIENTE_DE_BUILD = [
  "DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia",
  "DIRECT_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia",
  "AUTH_SECRET=segredo-dummy-de-32-bytes-para-build-0000",
  "TZ_APP=America/Fortaleza",
  "",
].join("\n");

// A promoção do alias é eventualmente consistente: a primeira resposta pode vir
// do deployment anterior ou de um redirecionamento temporário. A saúde repete
// com espera crescente e só aceita a revisão promovida.
const TENTATIVAS_SAUDE = 6;
const ESPERAS_SAUDE_MS = [2000, 4000, 8000, 16000, 30000];
const dormirPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function prepararAmbienteDeBuild(diretorio = ".vercel") {
  mkdirSync(diretorio, { recursive: true });
  writeFileSync(path.join(diretorio, ".env.production.local"), AMBIENTE_DE_BUILD, "utf8");
}

const filas = new Map();
export function selecionarEvento({ evento, ref }) {
  if (["push", "workflow_dispatch"].includes(evento) && ref === "refs/heads/main") return "main";
  if (
    ["release", "workflow_dispatch"].includes(evento) &&
    /^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(ref)
  )
    return "tag";
  throw new Error("Evento fora do regime: main ou tag estável vX.Y.Z.");
}

export async function orquestrar({ sha, destino, executar }) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !destino)
    throw new Error("Revisão ou destino de implantação inválido.");
  const anterior = filas.get(destino) ?? Promise.resolve();
  const rodada = anterior
    .catch(() => {})
    .then(async () => {
      let migracaoIniciada = false;
      for (const etapa of ["validar", "build", "migrar", "publicar", "promover", "saude"]) {
        if (etapa === "migrar") migracaoIniciada = true;
        try {
          await executar(etapa, sha);
        } catch {
          throw new Error(
            `Falha na etapa ${etapa}; ${migracaoIniciada ? "schema pode já ter sido aplicado; rollback de imagem não reverte o banco" : "interrompida antes da migração"}. Nenhuma repetição automática.`,
          );
        }
      }
    });
  filas.set(destino, rodada);
  try {
    await rodada;
  } finally {
    if (filas.get(destino) === rodada) filas.delete(destino);
  }
}

// Apenas o executor de Vercel está habilitado. Outros destinos exigem adaptador e aceite próprios.
/**
 * @param {Record<string, string | undefined>} ambiente
 * @param {{
 *   comando?: (...args: unknown[]) => unknown,
 *   buscar?: typeof fetch,
 *   dormir?: (ms: number) => Promise<unknown>
 * }} [opcoes]
 */
export function executorVercel(
  ambiente,
  { comando = execFileSync, buscar = fetch, dormir = dormirPadrao } = {},
) {
  const sha = ambiente.GITHUB_SHA;
  const base = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "CI", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]
      .filter((c) => ambiente[c] !== undefined)
      .map((c) => [c, ambiente[c]]),
  );
  const token = ambiente.VERCEL_TOKEN;
  let deployment;
  const rodar = (cmd, args, extras = {}, capturar = false) =>
    comando(cmd, args, {
      env: { ...base, COMMIT_SHA: sha, ...extras },
      encoding: "utf8",
      stdio: capturar ? ["ignore", "pipe", "inherit"] : "inherit",
    });
  const vercel = (args, capturar = false) =>
    rodar("pnpm", ["exec", "vercel", ...args, `--token=${token}`], {}, capturar);
  return async (etapa) => {
    switch (etapa) {
      case "validar": {
        if (!token || !ambiente.DIRECT_URL_PROD || !ambiente.APP_URL)
          throw new Error("Configuração de implantação ausente.");
        const revisao = rodar("git", ["rev-parse", "HEAD"], {}, true).trim();
        if (revisao !== sha) throw new Error("Revisão alterada.");
        const url = new URL(ambiente.APP_URL);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new Error("APP_URL exige HTTPS sem credenciais.");
        const configuracao = JSON.parse(readFileSync("vercel.json", "utf8"));
        if (configuracao.git?.deploymentEnabled?.main !== false)
          throw new Error("O auto-deploy da main precisa estar desligado no vercel.json.");
        break;
      }
      case "build":
        vercel(["pull", "--yes", "--environment=production"]);
        prepararAmbienteDeBuild();
        vercel(["build", "--prod"]);
        break;
      case "migrar":
        rodar(process.execPath, ["docker/app/migrar.mjs"], {
          DIRECT_URL: ambiente.DIRECT_URL_PROD,
          ...(ambiente.DATABASE_SCHEMA ? { DATABASE_SCHEMA: ambiente.DATABASE_SCHEMA } : {}),
        });
        break;
      case "publicar": {
        const saida = vercel(
          [
            "deploy",
            "--prebuilt",
            "--prod",
            "--skip-domain",
            "--yes",
            "--env",
            `COMMIT_SHA=${sha}`,
            "--meta",
            `commit=${sha}`,
          ],
          true,
        ).trim();
        const url = new URL(saida);
        if (
          url.protocol !== "https:" ||
          !url.hostname.endsWith(".vercel.app") ||
          url.username ||
          url.password
        )
          throw new Error("Deployment inválido.");
        deployment = url.href;
        break;
      }
      case "promover":
        if (!deployment) throw new Error("Deployment ausente.");
        vercel(["promote", deployment, "--yes"]);
        break;
      case "saude": {
        const url = new URL("/api/saude", ambiente.APP_URL);
        let ultimo = "sem resposta";
        for (let tentativa = 0; tentativa < TENTATIVAS_SAUDE; tentativa++) {
          try {
            const resposta = await buscar(url, {
              redirect: "manual",
              signal: AbortSignal.timeout(15000),
            });
            if (resposta.status === 401 || resposta.status === 403) {
              const erro = new Error(
                `Saúde protegida por autenticação (HTTP ${resposta.status}); confira o Deployment Protection e a APP_URL.`,
              );
              erro.permanente = true;
              throw erro;
            }
            if (resposta.status >= 300 && resposta.status < 400) {
              ultimo = `redirecionamento HTTP ${resposta.status}`;
            } else if (!resposta.ok) {
              ultimo = `HTTP ${resposta.status}`;
            } else {
              let corpo;
              try {
                corpo = await resposta.json();
              } catch {
                ultimo = "resposta JSON inválida";
              }
              if (corpo) {
                if (corpo.ok !== true) {
                  ultimo = "ok diferente de true";
                } else if (corpo.commit !== sha) {
                  ultimo = `commit ${String(corpo.commit ?? "ausente").slice(0, 12)} diferente de ${sha.slice(0, 12)}`;
                } else {
                  return;
                }
              }
            }
          } catch (erro) {
            if (erro?.permanente) throw erro;
            ultimo = erro?.name === "TimeoutError" ? "tempo esgotado" : "falha de rede";
          }
          if (tentativa < TENTATIVAS_SAUDE - 1) {
            await dormir(ESPERAS_SAUDE_MS[tentativa] ?? 30000);
          }
        }
        throw new Error(
          `Saúde indisponível após ${TENTATIVAS_SAUDE} tentativas (${ultimo}). ` +
            "Confira a propagação do alias, o Deployment Protection e a APP_URL.",
        );
      }
      default:
        throw new Error("Etapa desconhecida.");
    }
  };
}

async function principal() {
  const ambiente = process.env;
  if (![undefined, "", "vercel"].includes(ambiente.DEPLOY_TARGET))
    throw new Error("Destino sem adaptador aprovado; não migrar isoladamente.");
  const evento = JSON.parse(readFileSync(ambiente.GITHUB_EVENT_PATH, "utf8"));
  const modo = selecionarEvento({
    evento: ambiente.GITHUB_EVENT_NAME,
    ref: ambiente.GITHUB_REF,
  });
  if (modo === "tag") {
    if (evento.release?.draft || evento.release?.prerelease)
      throw new Error("Release não estável.");
    // O reusable recebe inputs próprios, que não precisam existir no evento do caller.
    const versao = (
      evento.release?.tag_name ??
      (ambiente.IMPLANTACAO_VERSAO || evento.inputs?.versao)
    )?.replace(/^v/, "");
    validarPublicacao({ versao, ref: ambiente.GITHUB_REF, sha: ambiente.GITHUB_SHA });
  }
  await orquestrar({
    sha: ambiente.GITHUB_SHA,
    destino: "producao",
    executar: executorVercel(ambiente),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  principal().catch((erro) => {
    console.error(erro.message);
    process.exitCode = 1;
  });
