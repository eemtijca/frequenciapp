// Exercita o download remoto por rclone com checksum e o encaminhamento à restauração.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const falso = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync(process.env.RCLONE_CONFIG, 'utf8'));
const [comando, origem, destino] = process.argv.slice(2);
fs.appendFileSync(config.log, comando + ' ' + origem + '\\n');
if (comando !== 'copyto' || !origem.startsWith('falso:copias/')) process.exit(90);
const nome = origem.slice('falso:copias/'.length);
if (!nome || nome.includes('/') || nome.includes('\\\\')) process.exit(91);
fs.copyFileSync(path.join(config.remoto, nome), destino);
`;

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baixar-backup-"));
  const dir = (nome) => {
    const d = path.join(tmp, nome);
    fs.mkdirSync(d, { mode: 0o700 });
    return d;
  };
  const estado = dir("estado"),
    local = dir("banco"),
    remoto = dir("remoto"),
    bin = dir("bin"),
    destino = path.join(tmp, "destino");
  fs.writeFileSync(path.join(bin, "rclone"), falso, { mode: 0o700 });
  const config = path.join(tmp, "rclone.json"),
    log = path.join(tmp, "eventos");
  fs.writeFileSync(config, JSON.stringify({ remoto, log }), { mode: 0o600 });
  const base = "frequenciapp-20200101T000000Z-abcdef01",
    dump = `${base}.dump.gpg`,
    ambiente = `${base}-ambiente.env.gpg`,
    bytes = Buffer.from("dump sintetico"),
    ambienteBytes = Buffer.from("AMBIENTE=sintetico\n"),
    side = `${hash(bytes)}  ${dump}\n`,
    ambienteSide = `${hash(ambienteBytes)}  ${ambiente}\n`;
  const r = {
    versao: 1,
    base,
    em: "2020-01-01T00:00:00.000Z",
    criptografia: "gpg",
    destinatario: "sintetico",
    remoto: "falso:copias",
    escopo: { tipo: "schema", schema: "public", alvo: "sintetico", banco: "escola" },
    etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
    artefatos: [
      { nome: dump, sha256: hash(bytes) },
      { nome: `${dump}.sha256`, sha256: hash(Buffer.from(side)) },
      { nome: ambiente, sha256: hash(ambienteBytes) },
      { nome: `${ambiente}.sha256`, sha256: hash(Buffer.from(ambienteSide)) },
    ],
  };
  const recibo = `${base}.confirmado.json`;
  for (const [nome, conteudo] of [
    [dump, bytes],
    [`${dump}.sha256`, side],
    [ambiente, ambienteBytes],
    [`${ambiente}.sha256`, ambienteSide],
    [recibo, JSON.stringify(r) + "\n"],
  ]) {
    fs.writeFileSync(path.join(remoto, nome), conteudo, { mode: 0o600 });
    fs.writeFileSync(path.join(local, nome), conteudo, { mode: 0o600 });
  }
  fs.writeFileSync(
    path.join(estado, "ultimo-backup.json"),
    JSON.stringify({
      recibo,
      em: r.em,
      modo: "compose",
      criptografia: "gpg",
      schema: "public",
      remoto: "falso:copias",
      arquivo: dump,
      sha256: hash(bytes),
      ambiente,
      ambienteSha256: hash(ambienteBytes),
      verificadoRemoto: true,
    }) + "\n",
    { mode: 0o600 },
  );
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: tmp,
    TMPDIR: tmp,
    SERVIDOR_AMBIENTE_INJETADO: "true",
    APP_DIR: RAIZ,
    ESTADO_DIR: estado,
    BACKUP_DIR: tmp,
    BACKUP_BANCO_DIR: local,
    BACKUP_REMOTO: "falso:copias",
    BACKUP_RCLONE_CONFIG: config,
    BACKUP_MODO: "compose",
    SERVIDOR_ALVO_CHAVE: "sintetico",
    BACKUP_BANCO_VERIFICADO: "escola",
    DATABASE_SCHEMA: "public",
  };
  const executar = (args = [], extra = {}) =>
    spawnSync("bash", [path.join(RAIZ, "scripts/servidor/baixar-backup.sh"), ...args], {
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 30000,
    });
  return {
    tmp,
    estado,
    local,
    remoto,
    config,
    log,
    destino,
    recibo,
    dump,
    ambiente,
    bytes,
    r,
    env,
    executar,
  };
}

test("baixa recibo, dump e ambiente, confere o checksum e imprime o caminho", () => {
  const f = fixture();
  try {
    const resultado = f.executar(["--destino", f.destino]);
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(resultado.stdout.trim().split("\n").at(-1), path.join(f.destino, f.dump));
    for (const nome of [f.dump, `${f.dump}.sha256`, f.ambiente, `${f.ambiente}.sha256`, f.recibo])
      assert.ok(fs.existsSync(path.join(f.destino, nome)), nome);
    assert.ok(fs.readFileSync(path.join(f.destino, f.dump)).equals(f.bytes));
    assert.ok(fs.readFileSync(f.log, "utf8").includes("copyto falso:copias/"));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("checksum remoto divergente interrompe sem devolver caminho confiável", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.remoto, f.dump), "adulterado", { mode: 0o600 });
    const resultado = f.executar(["--destino", f.destino]);
    assert.equal(resultado.status, 1);
    assert.equal(resultado.signal, null);
    assert.ok(!resultado.stdout.includes(path.join(f.destino, f.dump)));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("recibo remoto com destino divergente interrompe antes dos artefatos", () => {
  const f = fixture();
  try {
    const r = JSON.parse(fs.readFileSync(path.join(f.remoto, f.recibo), "utf8"));
    r.remoto = "falso:outro";
    fs.writeFileSync(path.join(f.remoto, f.recibo), JSON.stringify(r) + "\n", { mode: 0o600 });
    const resultado = f.executar(["--destino", f.destino]);
    assert.equal(resultado.status, 1);
    assert.equal(resultado.signal, null);
    assert.ok(!resultado.stdout.includes(path.join(f.destino, f.dump)));
    assert.ok(!fs.existsSync(path.join(f.destino, f.dump)));
    assert.ok(!fs.existsSync(path.join(f.destino, `${f.dump}.sha256`)));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("destino remoto ausente ou divergente do estado bloqueia antes do download", () => {
  for (const caso of ["ausente", "divergente"]) {
    const f = fixture();
    try {
      const extra = caso === "ausente" ? { BACKUP_REMOTO: "" } : { BACKUP_REMOTO: "falso:outro" };
      const resultado = f.executar(["--destino", f.destino], extra);
      assert.equal(resultado.status, 1, caso);
      assert.ok(!fs.existsSync(f.log), caso);
      assert.ok(!fs.existsSync(f.destino), caso);
    } finally {
      fs.rmSync(f.tmp, { recursive: true, force: true });
    }
  }
});

test("encaminha o arquivo conferido para restaurar.sh com checksum e opções", () => {
  const f = fixture();
  try {
    const registro = path.join(f.tmp, "restaurador.log");
    const restaurador = path.join(f.tmp, "restaurador.sh");
    fs.writeFileSync(
      restaurador,
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >${JSON.stringify(registro)}\n`,
      { mode: 0o700 },
    );
    const resultado = f.executar(["--destino", f.destino, "--restaurar", "--sem-copia"], {
      RESTAURAR_SCRIPT: restaurador,
    });
    assert.equal(resultado.status, 0, resultado.stderr);
    const args = fs.readFileSync(registro, "utf8").trim().split("\n");
    assert.ok(args.includes("--arquivo"));
    assert.ok(args.includes(path.join(f.destino, f.dump)));
    assert.ok(args.includes("--checksum"));
    assert.ok(args.includes(hash(f.bytes)));
    assert.ok(args.includes("--confirmar"));
    assert.ok(args.includes("--sem-copia"));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
