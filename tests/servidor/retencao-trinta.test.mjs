// Executar isolado, com rede desabilitada e somente dados e clientes sintéticos.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { criarRecibo } from "../../scripts/servidor/recibos.mjs";
import { createHash } from "node:crypto";

const raiz = process.cwd();
const hash = (s) => createHash("sha256").update(s).digest("hex");

function verificarBackup(minimo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-padrao-"));
  try {
    const bin = path.join(tmp, "bin");
    const estado = path.join(tmp, "estado");
    fs.mkdirSync(bin);
    fs.mkdirSync(estado);
    fs.writeFileSync(path.join(estado, "ultimo-backup.json"), "{}\n");
    fs.writeFileSync(
      path.join(bin, "node"),
      '#!/bin/sh\nprintf "%s" "$BACKUP_RETER_MINIMO" > "$CAPTURA"\n',
      { mode: 0o700 },
    );
    const captura = path.join(tmp, "captura");
    const env = {
      PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
      HOME: tmp,
      TMPDIR: tmp,
      APP_DIR: raiz,
      SERVIDOR_AMBIENTE_INJETADO: "true",
      BACKUP_MODO: "url",
      BACKUP_BANCO_DIR: path.join(tmp, "banco"),
      ESTADO_DIR: estado,
      SERVIDOR_LOCK_DIR: path.join(tmp, "locks"),
      CAPTURA: captura,
      ...(minimo === undefined ? {} : { BACKUP_RETER_MINIMO: minimo }),
    };
    const r = spawnSync(
      "bash",
      ["scripts/servidor/backup-banco.sh", "--diagnosticar-integridade"],
      { cwd: raiz, env, encoding: "utf8", timeout: 10000 },
    );
    assert.ifError(r.error);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(captura), "o consumidor sintético deve ter recebido o ambiente");
    return fs.readFileSync(captura, "utf8");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("shell exporta trinta por padrão e preserva valores explícitos", () => {
  assert.equal(verificarBackup(undefined), "30");
  assert.equal(verificarBackup("5"), "5");
  assert.equal(verificarBackup("0"), "0");
});

test("exemplo e chart declaram trinta como padrão", () => {
  const env = fs.readFileSync("infra/servidor/servidor.env.example", "utf8");
  const values = fs.readFileSync("infra/kubernetes/frequenciapp/values.yaml", "utf8");
  assert.match(env, /^BACKUP_RETER_MINIMO=30$/m);
  assert.match(values, /^  retentionMinimum: 30$/m);
});

function conjunto(dir, n) {
  const base = `frequenciapp-20200101T000000Z-${n.toString(16).padStart(8, "0")}`;
  const nome = `${base}.dump.gpg`;
  const bytes = `cópia sintética ${n}`;
  fs.writeFileSync(path.join(dir, nome), bytes);
  fs.writeFileSync(path.join(dir, `${nome}.sha256`), `${hash(bytes)}  ${nome}\n`);
  const r = criarRecibo(dir, {
    base,
    criptografia: "gpg",
    schema: "public",
    banco: "sintetico",
    alvo: "sintetico",
    remoto: "falso:copias",
    verificadoRemoto: true,
    destinatario: "sintetico",
    em: `2020-01-01T00:00:${String(n).padStart(2, "0")}Z`,
  });
  fs.writeFileSync(path.join(dir, `${base}.confirmado.json`), JSON.stringify(r));
  return base;
}

for (const acao of ["planejar-local", "planejar-remoto"]) {
  for (const minimo of [undefined, "5", "0"]) {
    test(`CLI ${acao} usa mínimo ${minimo ?? "padrão de trinta"}`, () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-cli-"));
      try {
        const bases = Array.from({ length: 32 }, (_, i) => conjunto(tmp, i));
        const env = {
          PATH: process.env.PATH,
          HOME: tmp,
          BACKUP_CATALOGO_PERSISTENTE: "true",
          BACKUP_RETER_DIAS: "1",
          BACKUP_BANCO_VERIFICADO: "sintetico",
          SERVIDOR_ALVO_CHAVE: "sintetico",
          DATABASE_SCHEMA: "public",
          BACKUP_REMOTO: "falso:copias",
          ...(minimo === undefined ? {} : { BACKUP_RETER_MINIMO: minimo }),
        };
        const r = spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", acao, tmp], {
          cwd: raiz,
          env,
          encoding: "utf8",
          timeout: 10000,
        });
        assert.ifError(r.error);
        assert.equal(r.signal, null);
        assert.equal(r.status, 0, r.stderr);
        const planejadas = [
          ...new Set(
            r.stdout
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((linha) => linha.split("\t")[0]),
          ),
        ].sort();
        assert.deepEqual(planejadas, bases.slice(0, 32 - Number(minimo ?? 30)).sort());
        assert.equal(fs.readdirSync(tmp).length, 32 * 3, "planejamento não exclui arquivos");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
}
