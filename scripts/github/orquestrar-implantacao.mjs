// Um proprietário por destino: validar e construir antes de migrar, publicar e promover.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validarPublicacao } from "./validar-publicacao.mjs";

const filas = new Map();
export function selecionarEvento({ evento, ref }) {
  if (
    ["release", "workflow_dispatch"].includes(evento) &&
    /^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(ref)
  )
    return "tag";
  throw new Error("Evento fora do regime: a implantação exige uma tag estável vX.Y.Z.");
}

export async function orquestrar({ sha, destino, atestado, executar }) {
  if (
    !/^[0-9a-f]{40}$/.test(sha) ||
    !destino ||
    atestado?.sha !== sha ||
    atestado.destino !== destino ||
    ![
      "backupVerificado",
      "recuperacaoVerificada",
      "migracoesExpansivas",
      "autoDeployCoordenado",
    ].every((c) => atestado[c] === true)
  ) {
    throw new Error(
      "Atestado de revisão, backup, recuperação, compatibilidade e coordenação ausente.",
    );
  }
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
export function executorVercel(ambiente, { comando = execFileSync, buscar = fetch } = {}) {
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
        break;
      }
      case "build":
        vercel(["pull", "--yes", "--environment=production"]);
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
        const resposta = await buscar(new URL("/api/saude", ambiente.APP_URL), {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (!resposta.ok) throw new Error("Saúde indisponível.");
        const corpo = await resposta.json();
        if (corpo.ok !== true || corpo.commit !== sha)
          throw new Error("Saúde não corresponde à revisão promovida.");
        break;
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
  selecionarEvento({
    evento: ambiente.GITHUB_EVENT_NAME,
    ref: ambiente.GITHUB_REF,
  });
  if (evento.release?.draft || evento.release?.prerelease) throw new Error("Release não estável.");
  // O reusable recebe inputs próprios, que não precisam existir no evento do caller.
  const versao = (
    evento.release?.tag_name ??
    (ambiente.IMPLANTACAO_VERSAO || evento.inputs?.versao)
  )?.replace(/^v/, "");
  validarPublicacao({ versao, ref: ambiente.GITHUB_REF, sha: ambiente.GITHUB_SHA });
  await orquestrar({
    sha: ambiente.GITHUB_SHA,
    destino: "producao",
    atestado: JSON.parse(ambiente.IMPLANTACAO_ATESTADO ?? "null"),
    executar: executorVercel(ambiente),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  principal().catch((erro) => {
    console.error(erro.message);
    process.exitCode = 1;
  });
