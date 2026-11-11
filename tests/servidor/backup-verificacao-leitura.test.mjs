// Exercita o consumidor Compose real, com clientes falsos e dados sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { criarRecibo } from "../../scripts/servidor/recibos.mjs";
import { identidadeCompose } from "../../scripts/servidor/identidade.mjs";

const raiz = process.cwd();
const hash = (v) => createHash("sha256").update(v).digest("hex");
const gravar = (p, v) => fs.writeFileSync(p, v, { mode: 0o600 });
const json = (p, v) => gravar(p, JSON.stringify(v) + "\n");
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verificacao-leitura-"));
  const local = path.join(tmp, "banco"),
    estado = path.join(tmp, "estado"),
    bin = path.join(tmp, "bin");
  for (const p of [local, estado, bin]) fs.mkdirSync(p, { mode: 0o700 });
  const config = {
    name: "sintetico",
    services: { app: {}, db: { volumes: [{ type: "volume", source: "dados", target: "/db" }] } },
    volumes: { dados: { name: "volume-falso" } },
  };
  const daemon = { ID: "daemon-falso-sem-engine" };
  const containers = [
    {
      Id: "db-falso",
      Config: {
        Labels: { "com.docker.compose.project": "sintetico", "com.docker.compose.service": "db" },
      },
      Mounts: [{ Type: "volume", Name: "volume-falso", Source: "/FALSO", Destination: "/db" }],
    },
    {
      Id: "app-falso",
      Config: {
        Labels: { "com.docker.compose.project": "sintetico", "com.docker.compose.service": "app" },
      },
      Mounts: [],
    },
  ];
  json(
    path.join(tmp, "identidade.json"),
    identidadeCompose(config, daemon, containers, { projeto: "sintetico", app: "app", db: "db" }),
  );
  json(path.join(tmp, "docker.json"), { config, daemon, containers });
  gravar(
    path.join(bin, "docker"),
    `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst d=JSON.parse(fs.readFileSync(process.env.FALSO_DOCKER)); const a=process.argv.slice(2);\nif(a[0]==='info')process.stdout.write(JSON.stringify(d.daemon));\nelse if(a[0]==='inspect')process.stdout.write(JSON.stringify(d.containers));\nelse if(a[0]==='compose'){const c=a.indexOf('config'),x=a.indexOf('exec'); if(c>=0){if(a.includes('--services'))process.stdout.write('app\\ndb\\ncaddy\\n'); else if(a.includes('--format'))process.stdout.write(JSON.stringify(d.config)); else if(!a.includes('--quiet'))process.exit(91);} else if(a.includes('ps'))process.stdout.write('db-falso\\napp-falso\\n'); else if(x>=0&&a[x+3]==='psql')process.stdout.write('escola\\n'); else process.exit(91);}else process.exit(91);\n`,
  );
  fs.chmodSync(path.join(bin, "docker"), 0o700);
  gravar(path.join(tmp, "app.env"), "FALSO=sem_segredo\n");
  gravar(path.join(tmp, "ops.env"), "");
  const base = "frequenciapp-20200101T000000Z-abcdef01",
    nome = `${base}.dump.gpg`,
    conteudo = "dump sintetico";
  gravar(path.join(local, nome), conteudo);
  gravar(path.join(local, `${nome}.sha256`), `${hash(conteudo)}  ${nome}\n`);
  const id = identidadeCompose(config, daemon, containers, {
    projeto: "sintetico",
    app: "app",
    db: "db",
  });
  const recibo = criarRecibo(local, {
    base,
    criptografia: "gpg",
    schema: "public",
    banco: "escola",
    alvo: id.trava,
    remoto: "",
    verificadoRemoto: false,
    destinatario: "",
  });
  const reciboPath = path.join(local, `${base}.confirmado.json`),
    ponteiro = path.join(estado, "ultimo-backup.json");
  json(reciboPath, recibo);
  json(ponteiro, {
    recibo: path.basename(reciboPath),
    em: recibo.em,
    modo: "compose",
    criptografia: "gpg",
    schema: "public",
    remoto: "",
    arquivo: nome,
    sha256: hash(conteudo),
    ambiente: "",
    ambienteSha256: "",
    verificadoRemoto: false,
  });
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: tmp,
    TMPDIR: tmp,
    SERVIDOR_AMBIENTE_INJETADO: "true",
    APP_DIR: raiz,
    APP_ENV_FILE: path.join(tmp, "app.env"),
    OPS_ENV_FILE: path.join(tmp, "ops.env"),
    ESTADO_DIR: estado,
    BACKUP_DIR: tmp,
    BACKUP_BANCO_DIR: local,
    SERVIDOR_LOCK_DIR: path.join(tmp, "locks"),
    COMPOSE_PROJECT_NAME: "sintetico",
    COMPOSE_ARQUIVOS: "compose.yml",
    SERVIDOR_IDENTIDADE_ARQUIVO: path.join(tmp, "identidade.json"),
    BACKUP_PLANILHAS_HABILITADO: "false",
    FALSO_DOCKER: path.join(tmp, "docker.json"),
    POSTGRES_DB: "escola",
    BACKUP_MODO: "compose",
    BACKUP_CRIPTOGRAFIA: "gpg",
    DATABASE_SCHEMA: "public",
  };
  const executar = () =>
    spawnSync("bash", ["scripts/servidor/backup-banco.sh", "--verificar"], {
      cwd: raiz,
      env,
      encoding: "utf8",
      timeout: 10000,
    });
  return { tmp, local, estado, bin, ponteiro, reciboPath, nome, env, executar };
}
function resultado(r, status) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, status, r.stdout + r.stderr);
}

test("o consumidor não passa o ponteiro a jq antes de limitar e recusar não regulares", () => {
  const f = fixture();
  try {
    const marca = path.join(f.tmp, "jq-acessou-ponteiro");
    // Instrumenta exclusivamente leituras de jq, mantendo seu comportamento real.
    gravar(
      path.join(f.bin, "jq"),
      `#!/bin/bash\nfor a in "$@"; do if [ "$a" = "$PONTEIRO_TESTE" ]; then : >"$MARCA_TESTE"; fi; done\nexec /usr/bin/jq "$@"\n`,
    );
    fs.chmodSync(path.join(f.bin, "jq"), 0o700);
    Object.assign(f.env, { PONTEIRO_TESTE: f.ponteiro, MARCA_TESTE: marca });
    resultado(f.executar(), 0);
    fs.rmSync(marca, { force: true });
    const original = fs.readFileSync(f.ponteiro),
      real = path.join(f.estado, "original.json");
    fs.renameSync(f.ponteiro, real);
    fs.symlinkSync("original.json", f.ponteiro);
    resultado(f.executar(), 1);
    assert.equal(fs.existsSync(marca), false, "jq seguiu o ponteiro simbólico");
    fs.unlinkSync(f.ponteiro);
    assert.equal(spawnSync("mkfifo", [f.ponteiro]).status, 0);
    resultado(f.executar(), 1);
    assert.equal(fs.existsSync(marca), false, "jq acessou FIFO");
    fs.unlinkSync(f.ponteiro);
    gravar(f.ponteiro, Buffer.concat([original, Buffer.alloc(2 * 1024 * 1024, 32)]));
    resultado(f.executar(), 1);
    assert.equal(fs.existsSync(marca), false, "jq leu JSON acima do limite");
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("não reabre ponteiro ou recibo trocados após a conferência remota", () => {
  const f = fixture();
  try {
    const remotoDir = path.join(f.tmp, "remoto");
    fs.mkdirSync(remotoDir);
    const remoto = `falso:${remotoDir}`,
      config = path.join(f.tmp, "rclone.conf"),
      chamadas = path.join(f.tmp, "chamadas");
    const r = JSON.parse(fs.readFileSync(f.reciboPath));
    r.remoto = remoto;
    r.etapas.remotoVerificado = true;
    json(f.reciboPath, r);
    const estado = JSON.parse(fs.readFileSync(f.ponteiro));
    estado.remoto = remoto;
    estado.verificadoRemoto = true;
    json(f.ponteiro, estado);
    for (const nome of [...r.artefatos.map((a) => a.nome), path.basename(f.reciboPath)])
      fs.copyFileSync(path.join(f.local, nome), path.join(remotoDir, nome));
    gravar(config, "[falso]\ntype = local\n");
    gravar(
      path.join(f.bin, "rclone"),
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst [cmd,origem,destino]=process.argv.slice(2);\nif(cmd!=='copyto'||!origem.startsWith('falso:'))process.exit(93);\nfs.appendFileSync(${JSON.stringify(chamadas)},origem+'\\n');\ntry{fs.copyFileSync(origem.slice(6),destino)}catch{process.exit(94)}\n`,
    );
    fs.chmodSync(path.join(f.bin, "rclone"), 0o700);
    Object.assign(f.env, { BACKUP_REMOTO: remoto, BACKUP_RCLONE_CONFIG: config });
    resultado(f.executar(), 0);
    fs.unlinkSync(chamadas);
    // Troca ambos após o verificador real retornar sucesso.
    const nodeReal = process.execPath;
    gravar(
      path.join(f.bin, "node"),
      `#!/bin/bash\n"${nodeReal}" "$@"\ns=$?\nif [ "$s" = 0 ] && [ "${"$"}{2:-}" = conferir-estado ]; then rm -f -- "$PONTEIRO_TESTE" "$RECIBO_TESTE"; mkfifo "$PONTEIRO_TESTE" "$RECIBO_TESTE"; fi\nexit "$s"\n`,
    );
    fs.chmodSync(path.join(f.bin, "node"), 0o700);
    Object.assign(f.env, { PONTEIRO_TESTE: f.ponteiro, RECIBO_TESTE: f.reciboPath });
    gravar(path.join(f.bin, "jq"), `#!/bin/bash\nexec timeout 2 /usr/bin/jq "$@"\n`);
    fs.chmodSync(path.join(f.bin, "jq"), 0o700);
    const verificado = f.executar();
    resultado(verificado, 0);
    assert.match(verificado.stdout, /Todos os artefatos e o recibo remoto conferem/);
    assert.deepEqual(
      fs.readFileSync(chamadas, "utf8").trim().split("\n").sort(),
      [
        ...r.artefatos.map((a) => `${remoto}/${a.nome}`),
        `${remoto}/${path.basename(f.reciboPath)}`,
      ].sort(),
    );
    assert.ok(
      fs.statSync(f.ponteiro).isFIFO() && fs.statSync(f.reciboPath).isFIFO(),
      "trocas injetadas depois da conferência",
    );
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
