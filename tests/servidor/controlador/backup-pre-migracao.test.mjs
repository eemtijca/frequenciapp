// Exercita o produtor de backup pré-migração com clientes locais sintéticos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";

const origem = {
  container: "a".repeat(64),
  cluster: "7654321098765432100",
  banco: "escola",
  bancoOid: "16384",
  schema: "public",
  schemaOid: "2200",
};
const operacao = "10000000-0000-4000-8000-000000000001";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

function executar(t, desvio) {
  assert.equal(process.getuid(), 0, "Executar com root interno de ambiente isolado.");
  assert.equal(fs.existsSync("/run/docker.sock"), false);
  const raiz = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/backup-pre-migracao-`);
  t.after(() => fs.rmSync(raiz, { recursive: true }));
  const bin = `${raiz}/bin`;
  fs.mkdirSync(bin);
  const gravar = (nome, bytes, mode = 0o600) =>
    fs.writeFileSync(`${raiz}/${nome}`, bytes, { mode });
  for (const nome of ["backup-banco.sh", "recibos.mjs"]) {
    fs.copyFileSync(
      new URL(`../../../scripts/servidor/${nome}`, import.meta.url),
      `${raiz}/${nome}`,
    );
  }
  // A autorização e os pins reais são exercitados pelo teste de recuperação.
  gravar(
    "comum.sh",
    `
carregar_ambiente() { :; }
verificar_instalacao() { COMPOSE=(docker compose); SERVIDOR_ALVO_CHAVE=alvo-sintetico; }
travar() { :; }
conferir_banco_compose() { export BACKUP_BANCO_VERIFICADO="$POSTGRES_DB"; }
erro() { printf '%s\\n' "$*" >&2; exit 1; }
espaco_livre_mb() { printf '1024\\n'; }
limpar_home_gpg() { :; }
log() { :; }
notificar() { :; }
`,
  );
  fs.symlinkSync(process.execPath, `${bin}/node`);
  gravar("bin/age", '#!/bin/bash\nprintf "cifra sintética:" >"$4"\ncat >>"$4"\n', 0o700);
  gravar(
    "bin/docker",
    `#!${process.execPath}
const fs = require('node:fs');
const assert = require('node:assert/strict');
const [acao, ...args] = process.argv.slice(2);
const {container, ...banco} = ${JSON.stringify(origem)};
const desvio = ${JSON.stringify(desvio)};
const marco = ${JSON.stringify(`${raiz}/dump-executado`)};
const depois = fs.existsSync(marco);
const conexao = ['-h', '/var/run/postgresql', '-p', '5432', '-U', 'frequencia', '-d', 'escola'];
if (acao === 'compose' && args[0] === 'ps') {
  assert.deepEqual(args, ['ps', '-q', '--no-trunc', 'db']);
  console.log(depois && desvio === 'container-depois' ? 'b'.repeat(64) : container);
} else if (acao === 'inspect') {
  assert.deepEqual(args, [container]);
  console.log(JSON.stringify([{Id:container, State:{Running:true,StartedAt:'sintético'}, Config:{Labels:{'com.docker.compose.project':'teste','com.docker.compose.service':'db'}}}]));
} else if (acao === 'exec') {
  assert.deepEqual(args.slice(0, 5), ['-i', container, '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin']);
  if (args[5] === 'psql') {
    assert.deepEqual(args.slice(7, 15), conexao);
    const sql = fs.readFileSync(0, 'utf8');
    assert.match(sql, /pg_control_system/);
    assert.match(sql, /inet_server_addr\\(\\) IS NULL/);
    if (desvio === 'cluster-antes' || depois && desvio === 'cluster-depois') banco.cluster = '9654321098765432100';
    console.log(JSON.stringify({...banco, primario:true, inicio:depois && desvio === 'reinicio' ? 'dois' : 'um'}));
  } else if (args[5] === 'pg_dump') {
    assert.equal(args[6], '-w');
    assert.deepEqual(args.slice(7, 15), conexao);
    assert.ok(args.includes('--schema=public'));
    fs.writeFileSync(marco, '');
    process.stdout.write('dump de escola');
  } else {
    assert.deepEqual(args.slice(5), ['pg_restore', '-l']);
    assert.equal(fs.readFileSync(0, 'utf8'), 'dump de escola');
  }
} else {
  // Controle da versão anterior, que usava a seleção Compose para o dump.
  assert.equal(acao, 'compose');
  if (args[3] === 'pg_restore') fs.readFileSync(0);
  else if (args[3] === 'pg_dump') {
    fs.writeFileSync(marco, '');
    process.stdout.write('dump de escola');
  } else throw new Error('Comando Compose inesperado.');
}
`,
    0o700,
  );
  const chave = "# Chave sintética sem material criptográfico.\n";
  gravar("chave.age", chave);
  const resultado = spawnSync("/bin/bash", [`${raiz}/backup-banco.sh`], {
    env: {
      PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
      HOME: raiz,
      APP_DIR: raiz,
      APP_ENV_FILE: `${raiz}/app.env`,
      COMPOSE_PROJECT_NAME: "teste",
      SERVIDOR_SERVICO_DB: "db",
      POSTGRES_DB: "escola",
      SERVIDOR_CONTROLADOR_PERFIL: `${raiz}/perfil`,
      SERVIDOR_CONTROLADOR_ACAO: "atualizar",
      SERVIDOR_CONTROLADOR_OPERACAO: operacao,
      ESTADO_DIR: `${raiz}/estado`,
      BACKUP_DIR: `${raiz}/backup`,
      BACKUP_INCLUIR_AMBIENTE: "false",
      BACKUP_RETER_DIAS: "0",
      BACKUP_CRIPTOGRAFIA: "age",
      BACKUP_AGE_DESTINATARIOS: `${raiz}/chave.age`,
      BACKUP_AGE_DESTINATARIOS_SHA256: sha(chave),
      BACKUP_MIGRACOES_AUTO_ESPERADO: JSON.stringify(origem),
    },
    encoding: "utf8",
    timeout: 8000,
  });
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  return { raiz, resultado };
}

test("produtor registra a origem observada junto ao SHA-256 dos bytes cifrados", (t) => {
  const { raiz, resultado } = executar(t, "");
  assert.equal(resultado.status, 0, resultado.stderr);
  const estado = JSON.parse(fs.readFileSync(`${raiz}/estado/ultimo-backup.json`, "utf8"));
  const recibo = JSON.parse(fs.readFileSync(`${raiz}/backup/banco/${estado.recibo}`, "utf8"));
  assert.deepEqual(recibo.origem, { ...origem, operacao });
  assert.equal(estado.sha256, sha("cifra sintética:dump de escola"));
  assert.equal(recibo.artefatos.find((a) => a.nome === estado.arquivo).sha256, estado.sha256);
});

for (const desvio of ["cluster-antes", "cluster-depois", "container-depois", "reinicio"]) {
  test(`produtor não publica backup com ${desvio}`, (t) => {
    const { raiz, resultado } = executar(t, desvio);
    assert.equal(resultado.status, 1, resultado.stderr);
    assert.match(resultado.stderr, /Origem pré-migração/);
    assert.equal(fs.existsSync(`${raiz}/dump-executado`), desvio !== "cluster-antes");
    assert.equal(fs.existsSync(`${raiz}/estado/ultimo-backup.json`), false);
    assert.deepEqual(fs.readdirSync(`${raiz}/backup/banco`), []);
  });
}
