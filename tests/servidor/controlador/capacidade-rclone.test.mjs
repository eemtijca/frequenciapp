// Confere a capacidade do transporte selecionado com binários rclone reais e I/O remoto sintético.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { primeiroBackup } from "./primeiro-backup.fixture.mjs";

test("F: binário incompatível é recusado antes de novo dump, marcador ou upload", (t) => {
  const f = primeiroBackup(t);
  f.ok(f.backup());
  f.ok(f.adocao());
  const antes = fs.readdirSync(f.remoto).sort();
  const ponteiro = fs.readFileSync(`${f.estado}/ultimo-backup.json`);
  f.gravar(
    `${f.bin}/rclone`,
    fs
      .readFileSync(`${f.bin}/rclone`, "utf8")
      .replace("/usr/local/bin/rclone", "/opt/frequenciapp-test-tools/rclone-legado"),
    0o700,
  );
  const versao = f
    .ok(f.executar("/opt/frequenciapp-test-tools/rclone-legado", ["--version"]))
    .stdout.split("\n")[0];
  assert.match(versao, /1\.60\.1-DEV/);
  const r = f.executar(`${f.prefixo}/executar`, ["backup-banco"]);
  assert.notEqual(
    r.status,
    0,
    "O rclone selecionado não implementa root_namespace e não pode enviar.",
  );
  assert.match(r.stderr, /rclone.*root_namespace/i);
  assert.deepEqual(fs.readdirSync(f.remoto).sort(), antes);
  assert.deepEqual(fs.readFileSync(`${f.estado}/ultimo-backup.json`), ponteiro);
  assert.equal(fs.readFileSync(`${f.raiz}/dumps`, "utf8"), "dump\n");
  assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
  f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  f.ok(f.executar(`${f.prefixo}/executar`, ["atualizar", "--ajuda"]));
  t.diagnostic(JSON.stringify({ rclone: versao, mutacaoTransporte: false }));
});

test("F: ajuda do backup adotado dispensa transporte, dump e intenção", (t) => {
  const f = primeiroBackup(t);
  f.ok(f.adocao());
  const ops = fs.readFileSync(`${f.config}/ops.env`);
  const remoto = fs.readdirSync(f.remoto).sort();
  for (const transporte of ["legado", "indisponivel"]) {
    f.gravar(
      `${f.bin}/rclone`,
      `#!/bin/sh\nprintf 'consulta\\n' >>${f.raiz}/capacidade-ajuda\nexec ${transporte === "legado" ? "/opt/frequenciapp-test-tools/rclone-legado" : "/nao-existe-rclone"} "$@"\n`,
      0o700,
    );
    for (const args of [
      ["--ajuda"],
      ["-h"],
      ["--verificar", "--ajuda"],
      ["--ajuda", "argumento-invalido"],
    ]) {
      const r = f.ok(f.executar(`${f.prefixo}/executar`, ["backup-banco", ...args]));
      assert.match(r.stdout, /Uso: backup-banco.sh/);
      assert.equal(fs.existsSync(`${f.raiz}/capacidade-ajuda`), false);
      assert.equal(fs.existsSync(`${f.raiz}/dumps`), false);
      assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
      assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
      assert.deepEqual(fs.readdirSync(f.remoto).sort(), remoto);
      assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), ops);
    }
    for (const args of [[], ["--verificar"], ["--invalido", "--ajuda"], ["--ajuda=sim"]]) {
      const r = f.executar(`${f.prefixo}/executar`, ["backup-banco", ...args]);
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(r.status, 78);
      assert.match(r.stderr, /rclone.*root_namespace/i);
      assert.equal(fs.existsSync(`${f.raiz}/capacidade-ajuda`), true);
      fs.unlinkSync(`${f.raiz}/capacidade-ajuda`);
      assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
      assert.equal(fs.existsSync(`${f.raiz}/dumps`), false);
    }
  }
  fs.appendFileSync(`${f.config}/ops.env`, "# Alteração não adotada.\n");
  const recusado = f.executar(`${f.prefixo}/executar`, ["backup-banco", "--ajuda"]);
  assert.equal(recusado.error, undefined);
  assert.equal(recusado.signal, null);
  assert.equal(recusado.status, 78);
  assert.match(recusado.stderr, /Configuração mudou/);
  assert.equal(fs.existsSync(`${f.raiz}/capacidade-ajuda`), false);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
});

test("F: transporte compatível selecionado permite publicação protegida sem reduzir o perfil", (t) => {
  const f = primeiroBackup(t);
  const versao = f.ok(f.executar("/usr/local/bin/rclone", ["--version"])).stdout.split("\n")[0];
  assert.match(versao, /1\.67\.0/);
  f.ok(f.backup());
  f.ok(f.adocao());
  f.ok(f.executar(`${f.prefixo}/executar`, ["backup-banco"]));
  assert.equal(fs.readdirSync(`${f.estado}/recibos`).length, 2);
  assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
  assert.equal(fs.statSync(f.targetLock).ino, fs.statSync(f.configDropbox.targetLock).ino);
  t.diagnostic(JSON.stringify({ rclone: versao, publicacao: true, ioDropbox: "sintetico" }));
});
