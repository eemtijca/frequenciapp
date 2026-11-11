// Prepara contextos públicos mínimos e valida defaults das imagens dos ensaios.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const postgresReferencia =
  "postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994";
export const helmReferencia =
  "alpine/helm:latest@sha256:e3f8d5c462d75470fbb1fce79ad5c20063657096d1f98c0fcea869e2600e2e5e";
export const pathFerramentas = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const raiz = path.resolve(import.meta.dirname, "../..");
export function ambienteMapa(lista) {
  assert.ok(Array.isArray(lista));
  const mapa = {};
  for (const par of lista) {
    assert.equal(typeof par, "string");
    const i = par.indexOf("=");
    assert.ok(i > 0);
    const nome = par.slice(0, i);
    assert.ok(!Object.hasOwn(mapa, nome), "Default duplicado na imagem");
    mapa[nome] = par.slice(i + 1);
  }
  return mapa;
}
export function validarImagem(info, perfil) {
  assert.match(info.Id, /^sha256:[a-f0-9]{64}$/);
  assert.ok(["ferramentas", "origem", "postgres"].includes(perfil));
  const c = info.Config;
  const env = ambienteMapa(c.Env);
  const pg = perfil !== "ferramentas";
  const esperado = pg
    ? {
        PATH: `${pathFerramentas}:/usr/lib/postgresql/17/bin`,
        GOSU_VERSION: "1.19",
        LANG: "en_US.utf8",
        PG_MAJOR: "17",
        PG_VERSION: "17.11-1.pgdg12+2",
        PGDATA: "/var/lib/postgresql/data",
      }
    : {
        PATH: pathFerramentas,
        NODE_VERSION: "24.22.2",
        YARN_VERSION: "1.22.22",
        HOME: "/tmp",
        TMPDIR: "/tmp",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ALLOW_PROTOCOL: "file",
        HELM_BIN: "/usr/local/bin/helm",
      };
  if (perfil === "origem")
    Object.assign(esperado, { NODE_VERSION: "24.22.2", HOME: "/tmp", TMPDIR: "/tmp" });
  assert.deepEqual(env, esperado, "Defaults fora do contrato; não herdar segredos ou endpoints");
  assert.deepEqual(c.Volumes ?? {}, pg ? { "/var/lib/postgresql/data": {} } : {});
  assert.deepEqual(c.ExposedPorts ?? {}, pg ? { "5432/tcp": {} } : {});
  assert.ok(!c.Healthcheck, "Imagem não deve injetar healthcheck");
  if (perfil !== "postgres")
    assert.equal(
      c.Labels?.["frequenciapp.ensaio.toolchain"],
      perfil === "origem" ? "origem-v2" : "sinteticos-v2",
    );
  return env;
}
export function contextoFerramentas(fonte = raiz) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-tools-"));
  try {
    for (const nome of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tests/servidor/Dockerfile.sinteticos",
    ]) {
      assert.ok(fs.lstatSync(path.join(fonte, nome)).isFile());
      fs.copyFileSync(path.join(fonte, nome), path.join(pasta, path.basename(nome)));
    }
    return pasta;
  } catch (erro) {
    fs.rmSync(pasta, { recursive: true, force: true });
    throw erro;
  }
}
const docker = (args) => {
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 8 * 1048576,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
export function inspecionarImagem(referencia, perfil) {
  assert.ok(typeof referencia === "string" && referencia.length > 0 && !referencia.startsWith("-"));
  const imagens = JSON.parse(docker(["image", "inspect", referencia]));
  assert.equal(imagens.length, 1);
  validarImagem(imagens[0], perfil);
  return imagens[0];
}
export function prepararImagemOrigem(referencia) {
  if (referencia) return inspecionarImagem(referencia, "origem");
  const contexto = contextoFerramentas();
  try {
    const tag =
      "frequenciapp-tools:" +
      createHash("sha256")
        .update(fs.readFileSync(path.join(contexto, "Dockerfile.sinteticos")))
        .update(fs.readFileSync(path.join(contexto, "pnpm-lock.yaml")))
        .digest("hex")
        .slice(0, 20);
    docker([
      "build",
      "--file",
      path.join(contexto, "Dockerfile.sinteticos"),
      "--tag",
      tag,
      contexto,
    ]);
    const tools = inspecionarImagem(tag, "ferramentas");
    const receita = fs.readFileSync(path.join(raiz, "tests/kubernetes/origem-backup.Dockerfile"));
    fs.writeFileSync(path.join(contexto, "Dockerfile"), receita);
    const origem =
      "frequenciapp-origem:" +
      createHash("sha256").update(receita).update(tools.Id).digest("hex").slice(0, 20);
    docker(["build", "--build-arg", `FERRAMENTAS=${tag}`, "--tag", origem, contexto]);
    return inspecionarImagem(origem, "origem");
  } finally {
    fs.rmSync(contexto, { recursive: true, force: true });
  }
}
