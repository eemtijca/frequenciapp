// Garante que a retenção rclone existente continua sendo o caminho padrão sem Dropbox.
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
const [comando, ...args] = process.argv.slice(2);
fs.appendFileSync(config.log, comando + '\\n');
const remoto = config.remoto;
if (comando === 'lsjson' && args[0] === 'falso:copias') {
  process.stdout.write(JSON.stringify(fs.readdirSync(remoto).map((nome) => ({ Path: nome, IsDir: false }))));
} else if (comando === 'copy' && args[0] === 'falso:copias' && args[2] === '--files-from-raw') {
  for (const nome of fs.readFileSync(args[3], 'utf8').trim().split('\\n')) {
    if (!nome || nome.includes('/') || nome.includes('\\\\')) process.exit(90);
    if (config.falhar === nome) process.exit(93);
    fs.copyFileSync(path.join(remoto, nome), path.join(args[1], nome));
  }
} else if (comando === 'deletefile' && args[0].startsWith('falso:copias/')) {
  const nome = args[0].slice('falso:copias/'.length);
  if (!nome || nome.includes('/') || nome.includes('\\\\')) process.exit(91);
  fs.unlinkSync(path.join(remoto, nome));
} else {
  process.exit(92);
}
`;

function fixture(quantidade = 2) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-rclone-"));
  const dir = (nome) => {
    const d = path.join(tmp, nome);
    fs.mkdirSync(d, { mode: 0o700 });
    return d;
  };
  const catalogo = dir("catalogo"),
    remoto = dir("remoto"),
    bin = dir("bin"),
    diarios = dir("expurgos"),
    lock = path.join(tmp, "alvo.lock");
  fs.writeFileSync(lock, "", { mode: 0o600 });
  fs.writeFileSync(path.join(bin, "rclone"), falso, { mode: 0o700 });
  const config = path.join(tmp, "rclone.json"),
    log = path.join(tmp, "eventos");
  fs.writeFileSync(config, JSON.stringify({ remoto, log }), { mode: 0o600 });
  const receipts = [];
  for (let i = 0; i < quantidade; i++) {
    const base = `frequenciapp-20200101T000000Z-${i.toString(16).padStart(8, "0")}`;
    const dump = `${base}.dump.gpg`,
      bytes = Buffer.from(`dump-${i}`),
      side = `${hash(bytes)}  ${dump}\n`;
    const r = {
      versao: 1,
      base,
      em: new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString(),
      criptografia: "gpg",
      destinatario: "sintetico",
      remoto: "falso:copias",
      escopo: { tipo: "schema", schema: "public", alvo: "sintetico", banco: "escola" },
      etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
      artefatos: [
        { nome: dump, sha256: hash(bytes) },
        { nome: `${dump}.sha256`, sha256: hash(Buffer.from(side)) },
      ],
    };
    const recibo = JSON.stringify(r) + "\n";
    fs.writeFileSync(path.join(catalogo, `${base}.confirmado.json`), recibo, { mode: 0o600 });
    for (const [nome, conteudo] of [
      [dump, bytes],
      [`${dump}.sha256`, side],
      [`${base}.confirmado.json`, recibo],
    ])
      fs.writeFileSync(path.join(remoto, nome), conteudo, { mode: 0o600 });
    receipts.push(r);
  }
  const executar = (extra = {}) => {
    const fd = fs.openSync(lock, "r");
    try {
      return spawnSync(
        process.execPath,
        [
          path.join(RAIZ, "scripts/servidor/backup-recibos.mjs"),
          "expurgar-remoto",
          catalogo,
          diarios,
        ],
        {
          env: {
            PATH: `${bin}:${process.env.PATH}`,
            HOME: tmp,
            TMPDIR: tmp,
            BACKUP_MODO: "compose",
            BACKUP_CATALOGO_PERSISTENTE: "true",
            SERVIDOR_ALVO_CHAVE: "sintetico",
            BACKUP_BANCO_VERIFICADO: "escola",
            DATABASE_SCHEMA: "public",
            BACKUP_REMOTO: "falso:copias",
            BACKUP_RETER_DIAS: "1",
            RCLONE_CONFIG: config,
            SERVIDOR_LOCK_HERDADO: lock,
            ...extra,
          },
          stdio: [
            "ignore",
            "pipe",
            "pipe",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            fd,
          ],
          encoding: "utf8",
          timeout: 30000,
        },
      );
    } finally {
      fs.closeSync(fd);
    }
  };
  return { tmp, catalogo, remoto, diarios, config, log, receipts, executar };
}

const conferir = (resultado, status) => {
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, status, resultado.stderr);
};

test("sem BACKUP_DROPBOX_CONFIG a retenção rclone existente expurga o conjunto antigo", () => {
  const f = fixture();
  try {
    conferir(f.executar({ BACKUP_RETER_MINIMO: "1" }), 0);
    assert.ok(!fs.existsSync(path.join(f.remoto, f.receipts[0].artefatos[0].nome)));
    assert.ok(fs.existsSync(path.join(f.remoto, f.receipts[1].artefatos[0].nome)));
    const eventos = fs.readFileSync(f.log, "utf8").trim().split("\n");
    assert.ok(eventos.includes("lsjson"));
    assert.ok(eventos.includes("copy"));
    assert.equal(eventos.filter((e) => e === "deletefile").length, 3);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("BACKUP_DROPBOX_CONFIG vazio também mantém o caminho rclone", () => {
  const f = fixture();
  try {
    conferir(f.executar({ BACKUP_RETER_MINIMO: "1", BACKUP_DROPBOX_CONFIG: "" }), 0);
    assert.equal(fs.readdirSync(f.remoto).length, 3);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("o padrão de BACKUP_RETER_MINIMO continua cinco", () => {
  const f = fixture(6);
  try {
    conferir(f.executar(), 0);
    assert.ok(!fs.existsSync(path.join(f.remoto, f.receipts[0].artefatos[0].nome)));
    for (const r of f.receipts.slice(1))
      assert.ok(fs.existsSync(path.join(f.remoto, r.artefatos[0].nome)));
    assert.equal(fs.readdirSync(f.remoto).length, 15);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("retenção desativada por zero dias não executa transporte", () => {
  const f = fixture();
  try {
    conferir(f.executar({ BACKUP_RETER_MINIMO: "0", BACKUP_RETER_DIAS: "0" }), 0);
    assert.ok(!fs.existsSync(f.log));
    assert.equal(fs.readdirSync(f.remoto).length, 6);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("falha do rclone interrompe o expurgo e preserva o conjunto", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.remoto, "arquivo-alheio.txt"), "x", { mode: 0o600 });
    fs.writeFileSync(
      f.config,
      JSON.stringify({ remoto: f.remoto, log: f.log, falhar: f.receipts[0].artefatos[0].nome }),
      { mode: 0o600 },
    );
    const resultado = f.executar({ BACKUP_RETER_MINIMO: "1" });
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 1);
    assert.ok(fs.existsSync(path.join(f.remoto, f.receipts[0].artefatos[0].nome)));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
