// Exercita instalação e retomada Dropbox pela CLI, com rclone legado real no PATH efetivo.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { primeiroBackup } from "../../servidor/controlador/primeiro-backup.fixture.mjs";
import { estadoInicial } from "../../../scripts/instalador/estado.mjs";
import { ordemEtapasPara } from "../../../scripts/instalador/executor.mjs";

function preparar(t, etapa = "dropbox") {
  const f = primeiroBackup(t, { instalador: true });
  fs.cpSync(path.resolve(import.meta.dirname, "../fixtures/aplicar/repo"), f.app, {
    recursive: true,
  });
  for (const args of [
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "test: registra fonte sintética",
    ],
  ])
    f.ok(f.executar("git", ["-C", f.app, ...args]));
  const commit = f.ok(f.executar("git", ["-C", f.app, "rev-parse", "HEAD"])).stdout.trim();
  const estado = estadoInicial({ configuracao: { perfil: "completo", canal: "main" } });
  estado.commit = commit;
  estado.etapas = ordemEtapasPara("completo")
    .slice(0, ordemEtapasPara("completo").indexOf(etapa))
    .map((id) => ({
      id,
      estado: "concluida",
      inicio: null,
      fim: null,
      codigo: null,
      acoes: [],
      avisos: [],
      detalhes: {},
    }));
  f.gravar(`${f.estado}/instalacao.json`, JSON.stringify(estado));
  f.gravar(`${f.raiz}/etc/os-release`, 'ID=ubuntu\nVERSION_ID="26.04"\nID_LIKE=debian\n');
  // O runtime real ao lado do transporte faz o PATH criado pela CLI selecionar esse binário.
  const node = `${f.bin}/node-cli`;
  fs.copyFileSync(process.execPath, node);
  fs.chmodSync(node, 0o700);
  const fingerprint = fs
    .readFileSync(`${f.config}/ops.env`, "utf8")
    .match(/^BACKUP_GPG_FINGERPRINT=(.*)$/m)[1];
  const args = [
    path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
    "aplicar",
    "--perfil",
    "completo",
    "--operador-controlador",
    "nobody",
    "--sim",
    "--json",
    "--nao-interativo",
    "--pular-contas",
    "--canal",
    "main",
    "--permitir-instavel",
    "--dominio",
    "frequencia.teste",
    "--email-acme",
    "tls@example.invalid",
    "--destinatario-gpg",
    fingerprint,
    "--config-dropbox",
    f.adocaoDropbox,
    "--arquivo-token-dropbox",
    f.configDropbox.tokenFile,
    "--config-rclone",
    f.configDropbox.rcloneConfig,
    "--destino",
    "falso:copias",
  ];
  const aplicar = (extras) =>
    f.executar(node, [...args, ...extras], {
      env: {
        PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
        HOME: f.raiz,
        TMPDIR: f.raiz,
        INSTALADOR_RAIZ: f.raiz,
        INSTALADOR_LOCK_DIR: `${f.raiz}/locks`,
        COMPOSE_PROJECT_NAME: "sintetico",
        BACKUP_GPG_CHAVE_PUBLICA: `${f.config}/publica.gpg`,
      },
    });
  f.ok(aplicar(["--desde-etapa", "ambiente", "--nao-iniciar"]));
  // Só os pré-requisitos anteriores ao recorte são sintéticos; os envs foram escritos pela CLI.
  f.gravar(`${f.estado}/instalacao.json`, JSON.stringify(estado));
  const legado = () =>
    f.gravar(
      `${f.bin}/rclone`,
      fs
        .readFileSync(`${f.bin}/rclone`, "utf8")
        .replace("/usr/local/bin/rclone", "/opt/frequenciapp-test-tools/rclone-legado"),
      0o700,
    );
  return { ...f, aplicar, legado };
}

for (const retomar of [false, true])
  test(`F: CLI recusa transporte incompatível ${retomar ? "na retomada" : "na instalação"} antes de ativar Dropbox`, (t) => {
    const f = preparar(t);
    f.legado();
    const antes = fs.readFileSync(`${f.config}/ops.env`);
    const r = f.aplicar(retomar ? ["--retomar"] : ["--desde-etapa", "dropbox"]);
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.codigo, "E_DROPBOX", r.stdout + "\n" + r.stderr);
    assert.match(doc.erros[0].mensagem, /rclone.*root_namespace/i);
    assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), antes);
    assert.equal(fs.existsSync(`${f.raiz}/dumps`), false);
    assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
    assert.equal(fs.existsSync(f.prefixo), false);
  });

// Retomada posterior à etapa Dropbox: a capacidade precisa ser reavaliada antes de conferir o backup.
test("F: retomada após Dropbox não aceita binário que perdeu root_namespace", (t) => {
  const f = preparar(t, "backup-inicial");
  f.ok(f.backup());
  const estado = f.ler(`${f.estado}/instalacao.json`);
  estado.backup = {
    ultimoRecibo: f.ler(`${f.estado}/ultimo-backup.json`).recibo,
    verificadoEm: new Date().toISOString(),
  };
  f.gravar(`${f.estado}/instalacao.json`, JSON.stringify(estado));
  f.legado();
  const antes = fs.readFileSync(`${f.estado}/ultimo-backup.json`);
  const r = f.aplicar(["--retomar"]),
    doc = JSON.parse(r.stdout);
  assert.equal(doc.codigo, "E_DROPBOX", r.stdout + "\n" + r.stderr);
  assert.match(doc.erros[0].mensagem, /rclone.*root_namespace/i);
  assert.deepEqual(fs.readFileSync(`${f.estado}/ultimo-backup.json`), antes);
  assert.equal(fs.readFileSync(`${f.raiz}/dumps`, "utf8"), "dump\n");
});
