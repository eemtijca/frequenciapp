// Executa somente a prova CLI em contêiner criado, inspecionado e sem rede/portas/mounts do host.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { prepararImagemOrigem, ambienteMapa } from "../servidor/imagens-ensaio.mjs";
const raiz = path.resolve(import.meta.dirname, "../..");
const rodada = randomUUID();
function docker(args, esperado = 0, timeout = 180000) {
  const r = spawnSync("docker", args, { encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, esperado, r.stdout + r.stderr);
  return r.stdout;
}
assert.deepEqual(
  process.argv.slice(2),
  ["--executar"],
  "uso: origem-backup-isolado.mjs --executar",
);
assert.ok(
  !process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT && !process.env.ORIGEM_PRODUTOR,
  "exige daemon local e produtor atual, sem override legado",
);
let info = prepararImagemOrigem(process.env.ORIGEM_BACKUP_TEST_IMAGE);
const defaults = ambienteMapa(info.Config.Env);
const imagem = info.Id;
assert.equal(info.Config.Labels?.["frequenciapp.ensaio"], "origem-backup-sintetico");
const fontes = [
  "scripts/servidor/backup-banco.sh",
  "scripts/servidor/origem-backup.mjs",
  "scripts/servidor/comum.sh",
  "scripts/servidor/recibos.mjs",
  "scripts/servidor/validar-banco.mjs",
  "src/infra/schema-postgres.mjs",
  "infra/kubernetes/frequenciapp/files/verificar-backup.sh",
  "tests/servidor/origem-backup-cli.e2e.mjs",
];
const hashes = Object.fromEntries(
  fontes.map((p) => [
    p,
    createHash("sha256")
      .update(fs.readFileSync(path.join(raiz, p)))
      .digest("hex"),
  ]),
);
// Captura mínima vira camada de imagem: rootfs permanece somente leitura na execução.
const captura = fs.mkdtempSync(
  path.join(os.tmpdir(), "origem-captura-"),
);
try {
  fs.chmodSync(captura, 0o755);
  for (const p of fontes) {
    const alvo = path.join(captura, p);
    fs.mkdirSync(path.dirname(alvo), { recursive: true, mode: 0o755 });
    // A umask não deve impedir o UID final de ler somente as fontes públicas projetadas.
    for (
      let diretorio = path.dirname(alvo);
      diretorio !== captura;
      diretorio = path.dirname(diretorio)
    )
      fs.chmodSync(diretorio, 0o755);
    fs.copyFileSync(path.join(raiz, p), alvo);
    fs.chmodSync(alvo, fs.statSync(path.join(raiz, p)).mode & 0o111 ? 0o555 : 0o444);
  }
  fs.writeFileSync(
    path.join(captura, "Dockerfile"),
    "ARG BASE\nFROM ${BASE}\nCOPY . /app\nUSER 999:999\n",
  );
  fs.chmodSync(path.join(captura, "Dockerfile"), 0o444);
  const tag = `frequenciapp-origem-captura:${rodada}`;
  const baseCaptura = `frequenciapp-origem-base:${rodada}`;
  docker(["image", "tag", imagem, baseCaptura]);
  assert.equal(JSON.parse(docker(["image", "inspect", baseCaptura]))[0].Id, imagem);
  docker([
    "build",
    "--network",
    "none",
    "--build-arg",
    `BASE=${baseCaptura}`,
    "--tag",
    tag,
    captura,
  ]);
  assert.equal(JSON.parse(docker(["image", "inspect", baseCaptura]))[0].Id, imagem);
  info = JSON.parse(docker(["image", "inspect", tag]))[0];
} finally {
  fs.rmSync(captura, { recursive: true, force: true });
}
const comandos = [
  "create",
  "--network",
  "none",
  "--read-only",
  "--cap-drop",
  "ALL",
  "--security-opt",
  "no-new-privileges:true",
  "--user",
  "999:999",
  "--label",
  `frequenciapp.ensaio.rodada=${rodada}`,
  "--label",
  "frequenciapp.ensaio=origem-backup-sintetico",
  "--memory",
  "768m",
  "--pids-limit",
  "128",
  "--tmpfs",
  "/ensaio:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=512m",
  "--tmpfs",
  "/var/lib/postgresql/data:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=16m",
  "--env",
  "ORIGEM_BACKUP_ENSAIO=/ensaio",
  "--workdir",
  "/app",
];
const id = docker([...comandos, info.Id]).trim();
function inspecionar() {
  const c = JSON.parse(docker(["inspect", id]))[0];
  assert.equal(c.Id, id);
  assert.equal(c.Image, info.Id);
  assert.equal(c.Config.Labels["frequenciapp.ensaio.rodada"], rodada);
  assert.equal(c.HostConfig.NetworkMode, "none");
  assert.deepEqual(c.HostConfig.PortBindings, {});
  assert.equal(c.HostConfig.ReadonlyRootfs, true);
  assert.equal(c.HostConfig.Privileged, false);
  assert.ok((c.Mounts || []).every((m) => m.Type === "tmpfs"));
  assert.equal((c.HostConfig.Binds || []).length, 0);
  assert.deepEqual(Object.keys(c.HostConfig.Tmpfs).sort(), ["/ensaio", "/var/lib/postgresql/data"]);
  assert.equal(c.Config.User, "999:999");
  assert.deepEqual(ambienteMapa(c.Config.Env), { ...defaults, ORIGEM_BACKUP_ENSAIO: "/ensaio" });
  assert.deepEqual(c.Config.Entrypoint ?? [], []);
  assert.deepEqual(c.Config.Cmd, ["node", "--test", "tests/servidor/origem-backup-cli.e2e.mjs"]);
  assert.deepEqual(c.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(c.HostConfig.CapAdd ?? [], []);
  assert.deepEqual(c.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  return c;
}
let estado;
try {
  estado = inspecionar();
  assert.equal(estado.State.Running, false);
  inspecionar();
  const r = spawnSync("docker", ["start", "-a", id], {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const espera = docker(["wait", id]).trim();
  assert.match(espera, /^(0|[1-9]\d{0,2})$/);
  estado = inspecionar();
  assert.equal(estado.State.Status, "exited");
  assert.equal(estado.State.ExitCode, Number(espera));
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(estado.State.Running, false);
  assert.equal(
    r.status,
    estado.State.ExitCode,
    "cliente e contêiner precisam concordar no término",
  );
  for (const p of fontes)
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(path.join(raiz, p)))
        .digest("hex"),
      hashes[p],
      `Fonte mudou durante a prova: ${p}`,
    );
  process.stdout.write(
    JSON.stringify({
      imagem: info.Id,
      rede: "none",
      mountsHost: 0,
      portas: 0,
      terminado: true,
      exitCode: estado.State.ExitCode,
      fontes: hashes,
    }) + "\n",
  );
  process.exitCode = estado.State.ExitCode;
} finally {
  const c = inspecionar();
  // Preservar qualquer execução incerta; não matar/remover por conveniência.
  if (c.State.Running === false) docker(["rm", id]);
  else process.stderr.write(`Contêiner próprio preservado por execução incerta: ${id}\n`);
}
