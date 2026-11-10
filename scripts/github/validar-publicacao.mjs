// Confere versão estável, referência completa e conteúdo do commit antes de publicar.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validarPublicacao({
  repositorio = process.cwd(),
  versao,
  ref,
  sha,
  releases = null,
}) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versao ?? "")) {
    throw new Error("A publicação exige uma versão SemVer estável sem prefixo.");
  }
  const tag = `v${versao}`;
  if (ref !== `refs/tags/${tag}`)
    throw new Error("A referência precisa ser a tag completa da versão.");
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("SHA de commit inválido.");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repositorio,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = git("rev-parse", "--verify", `${ref}^{commit}`);
  if (commit !== sha || git("rev-parse", "HEAD") !== commit)
    throw new Error("O checkout e a tag não correspondem ao SHA esperado.");
  const main = ["refs/remotes/origin/main", "refs/heads/main"].find((candidato) => {
    try {
      git("rev-parse", "--verify", `${candidato}^{commit}`);
      return true;
    } catch {
      return false;
    }
  });
  if (!main) throw new Error("A referência main não está disponível para conferir a tag.");
  try {
    git("merge-base", "--is-ancestor", commit, main);
  } catch {
    throw new Error("A tag precisa apontar para um commit ancestral da main.");
  }
  const pacote = JSON.parse(git("show", `${commit}:package.json`));
  if (pacote.version !== versao)
    throw new Error("O package.json do commit diverge da versão solicitada.");
  git("diff", "--exit-code", "HEAD", "--");
  return { versao, tag, sha: commit, latest: calcularLatest({ versao, releases }) };
}

function compararSemver(a, b) {
  const [ma, mi, pa] = a.split(".").map(Number);
  const [mb, mi2, pb] = b.split(".").map(Number);
  return ma - mb || mi - mi2 || pa - pb;
}

// `latest` só avança: uma publicação antiga continua versionada, mas não
// reposiciona o canal estável para trás.
export function calcularLatest({ versao, releases = null }) {
  if (releases == null) return true;
  if (!Array.isArray(releases)) throw new Error("O inventário de releases precisa ser uma lista.");
  const estaveis = releases
    .filter((r) => r && !r.draft && !r.prerelease && typeof r.tag_name === "string")
    .map((r) => r.tag_name.replace(/^v/, ""))
    .filter((v) => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) && v !== versao);
  return estaveis.every((v) => compararSemver(versao, v) >= 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evento = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const release = evento.release;
    if (release && (release.prerelease || release.draft)) throw new Error("Release não estável.");
    const versao = release ? release.tag_name?.replace(/^v/, "") : evento.inputs?.versao;
    const releases = JSON.parse(readFileSync(process.env.PUBLICACAO_RELEASES, "utf8"));
    if (!Array.isArray(releases) || !releases.every(Array.isArray))
      throw new Error("Inventário de releases incompleto.");
    const resultado = validarPublicacao({
      versao,
      ref: process.env.GITHUB_REF,
      sha: process.env.GITHUB_SHA,
      releases: releases.flat(),
    });
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(resultado)
          .map(([chave, valor]) => `${chave}=${valor}\n`)
          .join(""),
      );
    console.log(JSON.stringify(resultado));
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
