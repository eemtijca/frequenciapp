// Confere o primeiro conjunto real e sua disponibilidade pela entrada pública adotada.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { primeiroBackup } from "./primeiro-backup.fixture.mjs";

test("D: conjunto produzido e conferido continua disponível depois da adoção", (t) => {
  const f = primeiroBackup(t);
  f.ok(f.backup());
  f.ok(f.backup(["--verificar"]));
  const ponteiro = `${f.estado}/ultimo-backup.json`,
    p = f.ler(ponteiro);
  const r = f.ler(`${f.backups}/banco/${p.recibo}`);
  assert.equal(r.artefatos.length, 4);
  assert.equal(r.etapas.recuperacaoExercitada, false);
  // Decifra os bytes sintéticos, sem alegar dump ou recuperação PostgreSQL reais.
  const plaintext = f.ok(
    f.executar("gpg", [
      "--homedir",
      f.gpgHome,
      "--batch",
      "--decrypt",
      `${f.backups}/banco/${p.arquivo}`,
    ]),
  ).stdout;
  assert.equal(plaintext, "DUMP SINTETICO, SEM POSTGRESQL\n");
  const membros = [
    ponteiro,
    `${f.estado}/recibos/${p.recibo}`,
    `${f.backups}/banco/${p.recibo}`,
    ...r.artefatos.map((a) => `${f.backups}/banco/${a.nome}`),
  ];
  const antes = membros.map((n) => fs.readFileSync(n));
  f.ok(f.adocao());
  const perfil = f.ler(f.perfil);
  // A primeira ausência deve ser observável antes de uma nova mutação/journal.
  assert.ok(
    fs.existsSync(`${perfil.estado}/ultimo-backup.json`),
    "O ponteiro do primeiro conjunto desapareceu do armazenamento ativo.",
  );
  assert.deepEqual(fs.readFileSync(`${perfil.estado}/ultimo-backup.json`), antes[0]);
  assert.deepEqual(fs.readFileSync(`${perfil.estado}/recibos/${p.recibo}`), antes[1]);
  assert.deepEqual(fs.readFileSync(`${perfil.backups}/banco/${p.recibo}`), antes[2]);
  r.artefatos.forEach((a, i) =>
    assert.deepEqual(fs.readFileSync(`${perfil.backups}/banco/${a.nome}`), antes[i + 3]),
  );
  f.ok(f.executar(`${f.prefixo}/executar`, ["backup-banco", "--verificar"]));
  assert.equal(fs.readFileSync(`${f.raiz}/dumps`, "utf8"), "dump\n");
  membros.forEach((n, i) => assert.deepEqual(fs.readFileSync(n), antes[i]));
  assert.equal(
    fs.statSync(f.targetLock).ino,
    fs.statSync(`${perfil.locks}/operacoes-${perfil.alvo}.lock`).ino,
  );
  assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
  t.diagnostic(
    JSON.stringify({
      gpg: f.ok(f.executar("gpg", ["--version"])).stdout.split("\n")[0],
      jq: f.ok(f.executar("jq", ["--version"])).stdout.trim(),
      artefatos: r.artefatos.length,
      dumps: 1,
      recuperacaoPostgresql: false,
    }),
  );
});

test("C/D: execução adotada publica no mesmo armazenamento e usa a autoridade nativa", (t) => {
  const f = primeiroBackup(t);
  f.ok(f.backup());
  const locks = [f.targetLock, f.authorityLock].map((n) => fs.statSync(n));
  const p = f.ler(`${f.estado}/ultimo-backup.json`);
  const antes = fs.readFileSync(`${f.estado}/recibos/${p.recibo}`);
  f.ok(f.adocao());
  f.ok(f.executar(`${f.prefixo}/executar`, ["backup-banco"]));
  const perfil = f.ler(f.perfil);
  assert.equal(perfil.estado, f.estado);
  assert.equal(perfil.backups, f.backups);
  assert.equal(perfil.locks, `${f.raiz}/locks`);
  assert.deepEqual(fs.readdirSync(`${perfil.dados}/backups`), []);
  assert.deepEqual(fs.readdirSync(`${perfil.dados}/locks`), []);
  [f.targetLock, f.authorityLock].forEach((n, i) => {
    assert.equal(fs.statSync(n).ino, locks[i].ino);
    assert.equal(fs.statSync(n).dev, locks[i].dev);
  });
  assert.deepEqual(fs.readFileSync(`${f.estado}/recibos/${p.recibo}`), antes);
  assert.equal(fs.readdirSync(`${f.estado}/recibos`).length, 2);
  assert.ok(
    fs.existsSync(`${f.estado}/expurgos/dropbox`),
    "O consumidor nativo mantém seu journal próprio.",
  );
  assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
});

for (const caso of ["caminho", "inode", "pasta"]) {
  test(`C: consumidor nativo recusa ${caso} divergente depois da adoção`, (t) => {
    const f = primeiroBackup(t);
    f.ok(f.backup());
    if (caso === "pasta") {
      f.gravar(
        `${f.config}/ops.env`,
        fs
          .readFileSync(`${f.config}/ops.env`, "utf8")
          .replace("BACKUP_RETER_MINIMO=5", "BACKUP_RETER_MINIMO=1"),
      );
      f.gravar(f.adocaoDropbox, JSON.stringify({ ...f.configDropbox, minimoAutorizado: 1 }));
    }
    f.ok(f.adocao());
    const antes = fs.readdirSync(f.remoto).sort();
    if (caso === "caminho") {
      // Mesmo inode, nome diferente: a igualdade literal do caminho continua exigida.
      fs.linkSync(f.targetLock, `${f.raiz}/locks/outro.lock`);
      f.gravar(
        f.adocaoDropbox,
        JSON.stringify({ ...f.configDropbox, targetLock: `${f.raiz}/locks/outro.lock` }),
      );
    } else if (caso === "inode") {
      // Troca depois de travar, durante a consulta sintética do banco e antes do consumidor nativo.
      const docker = fs
        .readFileSync(`${f.bin}/docker`, "utf8")
        .replace(
          "then printf 'frequencia",
          `then if [ -e ${f.raiz}/trocar-inode ]; then : >${f.targetLock}.novo; chmod 600 ${f.targetLock}.novo; mv ${f.targetLock}.novo ${f.targetLock}; fi; printf 'frequencia`,
        );
      f.gravar(`${f.bin}/docker`, docker, 0o700);
      f.gravar(`${f.raiz}/trocar-inode`, "");
    } else {
      f.gravar(`${f.raiz}/pasta-divergente`, "");
      f.gravar(`${f.raiz}/relogio-futuro`, "");
    }
    const resultado = f.executar(`${f.prefixo}/executar`, ["backup-banco"]);
    assert.notEqual(resultado.status, 0);
    assert.match(resultado.stderr, /Autoridade ou publicação|Expurgo remoto|estado incerto/);
    for (const n of antes) assert.ok(fs.existsSync(`${f.remoto}/${n}`), n);
    assert.equal(
      fs.existsSync(`${f.raiz}/dumps`) &&
        fs.readFileSync(`${f.raiz}/dumps`, "utf8").split("\n").filter(Boolean).length,
      caso === "pasta" ? 2 : 1,
    );
    if (caso !== "pasta") assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
    const requests = fs.existsSync(`${f.raiz}/https.jsonl`)
      ? fs.readFileSync(`${f.raiz}/https.jsonl`, "utf8").trim().split("\n").map(JSON.parse)
      : [];
    assert.equal(
      requests.some((r) => r.rota.includes("delete")),
      false,
    );
    if (caso === "pasta") assert.ok(requests.some((r) => r.rota === "/2/files/get_metadata"));
  });
}

test("C: autoridade Dropbox ocupada continua excluindo nova escrita pela entrada adotada", async (t) => {
  const f = primeiroBackup(t);
  f.ok(f.backup());
  f.ok(f.adocao());
  const antes = fs.readdirSync(f.remoto).sort();
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const fs=require('node:fs'),cp=require('node:child_process');const fd=fs.openSync(process.argv[1],'r+');if(cp.spawnSync('flock',['-n','3'],{stdio:['ignore','ignore','inherit',fd]}).status)process.exit(90);process.stdout.write('pronto');process.stdin.resume();`,
      f.authorityLock,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const fim = once(holder, "close");
  try {
    await once(holder.stdout, "data");
    const r = f.executar(`${f.prefixo}/executar`, ["backup-banco"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Autoridade ou publicação/);
    assert.deepEqual(fs.readdirSync(f.remoto).sort(), antes);
    assert.equal(fs.readFileSync(`${f.raiz}/dumps`, "utf8"), "dump\n");
    assert.equal(fs.existsSync(`${f.authorityLock}.upload.json`), false);
  } finally {
    holder.stdin.destroy();
    holder.kill("SIGTERM");
    await fim;
  }
});
