// Verifica o consumidor Bash real com recursos e dados exclusivamente sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  conferirArtefatos,
  criarRecibo,
  planejarRetencao,
} from "../../scripts/servidor/recibos.mjs";
import { identidadeCompose } from "../../scripts/servidor/identidade.mjs";

const raiz = process.cwd();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gravar = (arquivo, bytes) => fs.writeFileSync(arquivo, bytes, { mode: 0o600 });
const json = (arquivo, objeto) => gravar(arquivo, JSON.stringify(objeto) + "\n");

function reciboRetencao(id, em) {
  const base = `frequenciapp-20200101T000000Z-${id}`;
  const nome = `${base}.dump.gpg`;
  return {
    versao: 1,
    base,
    em,
    criptografia: "gpg",
    destinatario: "",
    remoto: "",
    escopo: { tipo: "schema", schema: "public", alvo: "sintetico", banco: "escola" },
    etapas: { local: true, remotoVerificado: false, recuperacaoExercitada: false },
    artefatos: [nome, `${nome}.sha256`].map((n) => ({ nome: n, sha256: "0".repeat(64) })),
  };
}

const politica = {
  minimo: 1,
  dias: 1,
  agora: Date.parse("2021-01-01T00:00:00Z"),
  remoto: false,
  destino: "",
  banco: "escola",
  schema: "public",
  alvo: "sintetico",
};

test("retenção preserva instante UTC mais recente mesmo com fusos diferentes", () => {
  const anterior = reciboRetencao("00000001", "2020-01-02T00:00:00+14:00");
  const posterior = reciboRetencao("00000002", "2020-01-01T23:00:00Z");
  assert.deepEqual(
    planejarRetencao([anterior, posterior], politica).map((r) => r.base),
    [anterior.base],
  );
});

test("retenção desempata instantes iguais pela base e rejeita data inválida", () => {
  const a = reciboRetencao("00000001", "2020-01-02T00:00:00+01:00");
  const b = reciboRetencao("00000002", "2020-01-01T23:00:00Z");
  assert.deepEqual(
    planejarRetencao([a, b], politica).map((r) => r.base),
    [a.base],
  );
  assert.throws(
    () => planejarRetencao([a, { ...b, em: "data inválida" }], politica),
    /Recibo inválido/,
  );
});

// O dublê rejeita qualquer comando não previsto e não acessa o Docker real.
const dockerFalso = `#!/usr/bin/env node
import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync(process.env.FALSO_DOCKER,'utf8'));
const a=process.argv.slice(2);
if(a[0]==='info') process.stdout.write(JSON.stringify(d.daemon));
else if(a[0]==='inspect') process.stdout.write(JSON.stringify(d.containers));
else if(a[0]==='compose') {
  const c=a.indexOf('config'), x=a.indexOf('exec');
  if(c>=0) {
    if(a.includes('--services')) process.stdout.write('app\\ndb\\ncaddy\\n');
    else if(a.includes('--format')) process.stdout.write(JSON.stringify(d.config));
    else if(!a.includes('--quiet')) process.exit(91);
  } else if(a.includes('ps')) process.stdout.write('db-falso\\napp-falso\\n');
  else if(x>=0 && a[x+3]==='psql') process.stdout.write('escola\\n');
  else process.exit(91);
} else process.exit(91);
`;

test("sidecar esparso gigante é recusado antes de hash ilimitado", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-limite-sidecar-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef08";
    const nome = `${base}.dump.gpg`;
    const arquivo = path.join(tmp, nome);
    gravar(arquivo, "dump");
    gravar(`${arquivo}.sha256`, `${hash("dump")}  ${nome}\n`);
    const env = {
      PATH: process.env.PATH,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      SERVIDOR_ALVO_CHAVE: "sintetico",
      BACKUP_BANCO_VERIFICADO: "escola",
      BACKUP_CRIPTOGRAFIA: "gpg",
    };
    const executar = () =>
      spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", "criar", tmp, base], {
        cwd: raiz,
        env,
        encoding: "utf8",
        timeout: 2500,
      });
    assert.equal(executar().status, 0, "controle positivo");
    fs.truncateSync(`${arquivo}.sha256`, 8 * 1024 * 1024 * 1024);
    const resultado = executar();
    assert.equal(resultado.error, undefined, "sidecar não deve ser percorrido integralmente");
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("criação recusa FIFO e symlink sem bloqueio nem seguimento", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-tipos-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef06";
    const nome = `${base}.dump.gpg`;
    const arquivo = path.join(tmp, nome);
    const env = {
      PATH: process.env.PATH,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      SERVIDOR_ALVO_CHAVE: "sintetico",
      BACKUP_BANCO_VERIFICADO: "escola",
      BACKUP_CRIPTOGRAFIA: "gpg",
    };
    const executar = () =>
      spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", "criar", tmp, base], {
        cwd: raiz,
        env,
        encoding: "utf8",
        timeout: 2500,
      });
    gravar(`${arquivo}.sha256`, `${hash("dump")}  ${nome}\n`);
    gravar(`${arquivo}.real`, "dump");
    gravar(arquivo, "dump");
    assert.equal(executar().status, 0, "controle positivo");
    fs.unlinkSync(arquivo);
    fs.symlinkSync(`${nome}.real`, arquivo);
    const link = executar();
    assert.equal(link.error, undefined);
    assert.equal(link.signal, null);
    assert.equal(link.status, 1, "symlink deve ser rejeitado");
    fs.unlinkSync(arquivo);
    const fifo = spawnSync("mkfifo", [arquivo], { encoding: "utf8" });
    assert.equal(fifo.status, 0, fifo.stderr);
    const bloqueio = executar();
    assert.equal(bloqueio.error, undefined, "FIFO não deve bloquear até o timeout");
    assert.equal(bloqueio.signal, null);
    assert.equal(bloqueio.status, 1);
    fs.unlinkSync(arquivo);
    gravar(arquivo, "dump");
    fs.unlinkSync(`${arquivo}.sha256`);
    const fifoSidecar = path.join(tmp, "sidecar-fifo");
    assert.equal(spawnSync("mkfifo", [fifoSidecar]).status, 0);
    fs.symlinkSync("sidecar-fifo", `${arquivo}.sha256`);
    const linkFifo = executar();
    assert.equal(linkFifo.error, undefined, "symlink para FIFO não deve ser seguido");
    assert.equal(linkFifo.signal, null);
    assert.equal(linkFifo.status, 1);
    fs.unlinkSync(`${arquivo}.sha256`);
    fs.renameSync(fifoSidecar, `${arquivo}.sha256`);
    const fifoChecksum = executar();
    assert.equal(fifoChecksum.error, undefined, "sidecar FIFO não deve bloquear");
    assert.equal(fifoChecksum.signal, null);
    assert.equal(fifoChecksum.status, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("rejeita metadados gigantes mesmo quando JSON válido", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-json-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef07";
    const nome = `${base}.dump.gpg`;
    gravar(path.join(tmp, nome), "dump");
    gravar(path.join(tmp, `${nome}.sha256`), `${hash("dump")}  ${nome}\n`);
    const r = criarRecibo(tmp, {
      base,
      criptografia: "gpg",
      schema: "public",
      banco: "escola",
      alvo: "sintetico",
      remoto: "",
      verificadoRemoto: false,
      destinatario: "",
    });
    const arquivo = path.join(tmp, `${base}.confirmado.json`);
    json(arquivo, r);
    const executar = () =>
      spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", "conferir", tmp, arquivo], {
        cwd: raiz,
        encoding: "utf8",
        timeout: 5000,
      });
    assert.equal(executar().status, 0, "controle positivo");
    fs.appendFileSync(arquivo, " ".repeat(2 * 1024 * 1024));
    const grande = executar();
    assert.equal(grande.error, undefined);
    assert.equal(grande.signal, null);
    assert.equal(grande.status, 1, "limite para JSON válido");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("ponteiro e catálogo recusam JSON não regular ou acima do limite", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-metadados-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef09";
    const nome = `${base}.dump.gpg`;
    gravar(path.join(tmp, nome), "dump");
    gravar(path.join(tmp, `${nome}.sha256`), `${hash("dump")}  ${nome}\n`);
    const r = criarRecibo(tmp, {
      base,
      criptografia: "gpg",
      schema: "public",
      banco: "escola",
      alvo: "sintetico",
      remoto: "",
      verificadoRemoto: false,
      destinatario: "",
    });
    const recibo = path.join(tmp, `${base}.confirmado.json`);
    const ponteiro = path.join(tmp, "ultimo-backup.json");
    json(recibo, r);
    json(ponteiro, {
      em: r.em,
      modo: "compose",
      criptografia: r.criptografia,
      arquivo: nome,
      sha256: hash("dump"),
      schema: "public",
      ambiente: "",
      ambienteSha256: "",
      remoto: "",
      verificadoRemoto: false,
      recibo: path.basename(recibo),
    });
    const env = {
      PATH: process.env.PATH,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
      SERVIDOR_ALVO_CHAVE: "sintetico",
      BACKUP_BANCO_VERIFICADO: "escola",
      DATABASE_SCHEMA: "public",
      BACKUP_CATALOGO_PERSISTENTE: "true",
    };
    const executar = (acao, arg = ponteiro) =>
      spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", acao, tmp, arg], {
        cwd: raiz,
        env,
        encoding: "utf8",
        timeout: 2500,
      });
    const conferir = (r, status, descricao) => {
      assert.equal(r.error, undefined, descricao);
      assert.equal(r.signal, null, descricao);
      assert.equal(r.status, status, descricao);
    };
    for (const acao of ["conferir-estado", "diagnosticar-integridade", "planejar-remoto"])
      conferir(executar(acao), 0, acao);
    const original = fs.readFileSync(ponteiro);
    fs.appendFileSync(ponteiro, " ".repeat(2 * 1024 * 1024));
    conferir(executar("conferir-estado"), 1, "ponteiro grande");
    gravar(ponteiro, original);
    const conteudo = fs.readFileSync(recibo);
    fs.appendFileSync(recibo, " ".repeat(2 * 1024 * 1024));
    conferir(executar("diagnosticar-integridade"), 1, "recibo grande no ponteiro");
    conferir(executar("planejar-remoto"), 1, "recibo grande no catálogo remoto");
    gravar(recibo, conteudo);
    fs.renameSync(recibo, `${recibo}.real`);
    fs.symlinkSync(path.basename(`${recibo}.real`), recibo);
    conferir(executar("conferir-estado"), 1, "link no recibo");
    conferir(executar("planejar-remoto"), 1, "link no catálogo remoto");
    fs.unlinkSync(recibo);
    fs.renameSync(`${recibo}.real`, recibo);
    fs.unlinkSync(ponteiro);
    assert.equal(spawnSync("mkfifo", [ponteiro]).status, 0);
    conferir(executar("conferir-estado"), 1, "ponteiro FIFO");
    fs.unlinkSync(ponteiro);
    fs.symlinkSync(path.basename(recibo), ponteiro);
    conferir(executar("diagnosticar-integridade"), 1, "ponteiro symlink");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("cria e confere recibo de dump maior que a memória disponível", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-grande-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef02";
    const nome = `${base}.dump.gpg`;
    const tamanho = 384 * 1024 * 1024;
    const arquivo = path.join(tmp, nome);
    fs.closeSync(fs.openSync(arquivo, "w", 0o600));
    fs.truncateSync(arquivo, tamanho);
    const h = createHash("sha256");
    const bloco = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < tamanho / bloco.length; i++) h.update(bloco);
    const esperado = h.digest("hex");
    gravar(`${arquivo}.sha256`, `${esperado}  ${nome}\n`);
    const cli = path.join(raiz, "scripts/servidor/recibos.mjs");
    const criar = spawnSync(process.execPath, [cli, "criar", tmp, base], {
      env: {
        PATH: process.env.PATH,
        SERVIDOR_ALVO_CHAVE: "sintetico",
        BACKUP_BANCO_VERIFICADO: "escola",
        BACKUP_CRIPTOGRAFIA: "gpg",
        DATABASE_SCHEMA: "public",
      },
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(criar.error, undefined);
    assert.equal(criar.signal, null, `criação interrompida: ${criar.signal}`);
    assert.equal(criar.status, 0, criar.stderr);
    const recibo = JSON.parse(criar.stdout);
    assert.equal(recibo.artefatos.find((a) => a.nome === nome).sha256, esperado);
    const reciboArquivo = path.join(tmp, `${base}.confirmado.json`);
    json(reciboArquivo, recibo);
    const conferir = spawnSync(process.execPath, [cli, "conferir", tmp, reciboArquivo], {
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(conferir.error, undefined);
    assert.equal(conferir.signal, null);
    assert.equal(conferir.status, 0, conferir.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("hash de arquivo atravessa blocos e detecta alteração no final", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-blocos-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef05";
    const nome = `${base}.dump.age`;
    const dados = Buffer.alloc(2 * 65536 + 17);
    for (let i = 0; i < dados.length; i++) dados[i] = (i * 31) % 256;
    const arquivo = path.join(tmp, nome);
    gravar(arquivo, dados);
    gravar(`${arquivo}.sha256`, `${hash(dados)}  ${nome}\n`);
    const recibo = criarRecibo(tmp, {
      base,
      criptografia: "age",
      schema: "public",
      banco: "escola",
      alvo: "sintetico",
      remoto: "",
      verificadoRemoto: false,
      destinatario: "pin-sintetico",
    });
    assert.equal(recibo.artefatos.find((a) => a.nome === nome).sha256, hash(dados));
    assert.doesNotThrow(() => conferirArtefatos(tmp, recibo));
    dados[dados.length - 1] ^= 1;
    gravar(arquivo, dados);
    assert.throws(() => conferirArtefatos(tmp, recibo), /Artefato local ausente ou divergente/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("rejeita checksum associado gigante sem esgotar memória", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-sidecar-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef03";
    const nome = `${base}.dump.gpg`;
    gravar(path.join(tmp, nome), "dump sintético");
    const sidecar = path.join(tmp, `${nome}.sha256`);
    fs.closeSync(fs.openSync(sidecar, "w", 0o600));
    const tamanho = 384 * 1024 * 1024;
    fs.truncateSync(sidecar, tamanho);
    const h = createHash("sha256");
    const bloco = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < tamanho / bloco.length; i++) h.update(bloco);
    const recibo = {
      versao: 1,
      base,
      em: "2020-01-01T00:00:00.000Z",
      escopo: { tipo: "schema", schema: "public", alvo: "sintetico", banco: "escola" },
      criptografia: "gpg",
      destinatario: "pin-sintetico",
      remoto: "",
      etapas: { local: true, remotoVerificado: false, recuperacaoExercitada: false },
      artefatos: [
        { nome, sha256: hash("dump sintético") },
        { nome: `${nome}.sha256`, sha256: h.digest("hex") },
      ],
    };
    const arquivo = path.join(tmp, `${base}.confirmado.json`);
    json(arquivo, recibo);
    const programa = `import {readFileSync} from 'node:fs';
import {conferirArtefatos} from './scripts/servidor/recibos.mjs';
conferirArtefatos(process.argv[1], JSON.parse(readFileSync(process.argv[2], 'utf8')));`;
    const resultado = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", programa, tmp, arquivo],
      { cwd: raiz, encoding: "utf8", timeout: 60000 },
    );
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null, `conferência interrompida: ${resultado.signal}`);
    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /Checksum associado divergente/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("recusa sidecar incoerente mesmo com hash próprio válido e recusa link simbólico", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recibo-integridade-"));
  try {
    const base = "frequenciapp-20200101T000000Z-abcdef04";
    const nome = `${base}.dump.age`;
    const arquivo = path.join(tmp, nome);
    gravar(arquivo, "dump sintético");
    gravar(`${arquivo}.sha256`, `${hash("dump sintético")}  ${nome}\n`);
    const recibo = criarRecibo(tmp, {
      base,
      criptografia: "age",
      schema: "public",
      banco: "escola",
      alvo: "sintetico",
      remoto: "",
      verificadoRemoto: false,
      destinatario: "pin-sintetico",
    });
    assert.doesNotThrow(() => conferirArtefatos(tmp, recibo));
    const falso = `${"0".repeat(64)}  ${nome}\n`;
    gravar(`${arquivo}.sha256`, falso);
    const adulterado = structuredClone(recibo);
    adulterado.artefatos.find((a) => a.nome === `${nome}.sha256`).sha256 = hash(falso);
    assert.throws(() => conferirArtefatos(tmp, adulterado), /Checksum associado divergente/);
    gravar(`${arquivo}.sha256`, `${hash("dump sintético")}  ${nome}\n`);
    fs.renameSync(arquivo, `${arquivo}.real`);
    fs.symlinkSync(`${nome}.real`, arquivo);
    assert.throws(() => conferirArtefatos(tmp, recibo), /Artefato local ausente ou divergente/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("verificação Compose exige banco conferido e recusa adulteração", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verificar-backup-"));
  try {
    const local = path.join(tmp, "banco");
    const estado = path.join(tmp, "estado");
    const bin = path.join(tmp, "bin");
    for (const dir of [local, estado, bin]) fs.mkdirSync(dir, { mode: 0o700 });
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
          Labels: {
            "com.docker.compose.project": "sintetico",
            "com.docker.compose.service": "app",
          },
        },
        Mounts: [],
      },
    ];
    const identidade = identidadeCompose(config, daemon, containers, {
      projeto: "sintetico",
      app: "app",
      db: "db",
    });
    json(path.join(tmp, "identidade.json"), identidade);
    json(path.join(tmp, "docker.json"), { config, daemon, containers });
    gravar(path.join(bin, "docker"), dockerFalso);
    fs.chmodSync(path.join(bin, "docker"), 0o700);
    gravar(path.join(tmp, "app.env"), "FALSO=sem_segredo\n");
    gravar(path.join(tmp, "ops.env"), "");
    const base = "frequenciapp-20200101T000000Z-abcdef01";
    const nome = `${base}.dump.gpg`;
    const conteudo = "DUMP FALSO, não é PostgreSQL nem cifra\n";
    gravar(path.join(local, nome), conteudo);
    gravar(path.join(local, `${nome}.sha256`), `${hash(conteudo)}  ${nome}\n`);
    const nomeAmbiente = `${base}-ambiente.env.gpg`;
    const ambienteSintetico = "AMBIENTE SINTÉTICO\n";
    gravar(path.join(local, nomeAmbiente), ambienteSintetico);
    gravar(
      path.join(local, `${nomeAmbiente}.sha256`),
      `${hash(ambienteSintetico)}  ${nomeAmbiente}\n`,
    );
    const recibo = criarRecibo(local, {
      base,
      criptografia: "gpg",
      schema: "public",
      banco: "escola",
      alvo: identidade.trava,
      remoto: "",
      verificadoRemoto: false,
      destinatario: "pin-sintetico",
    });
    json(path.join(local, `${base}.confirmado.json`), recibo);
    json(path.join(estado, "ultimo-backup.json"), {
      recibo: `${base}.confirmado.json`,
      em: recibo.em,
      modo: "compose",
      criptografia: recibo.criptografia,
      schema: recibo.escopo.schema,
      remoto: recibo.remoto,
      arquivo: nome,
      sha256: hash(conteudo),
      ambiente: nomeAmbiente,
      ambienteSha256: hash(ambienteSintetico),
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
    const verificar = (extra = {}, argumentos = ["--verificar"]) =>
      spawnSync("bash", ["scripts/servidor/backup-banco.sh", ...argumentos], {
        cwd: raiz,
        env: { ...env, ...extra },
        encoding: "utf8",
        timeout: 10000,
      });
    const valido = verificar();
    assert.equal(valido.status, 0, valido.stdout + valido.stderr);
    const ponteiro = path.join(estado, "ultimo-backup.json");
    const original = JSON.parse(fs.readFileSync(ponteiro, "utf8"));
    for (const [campo, valor] of [
      ["em", "2001-01-01T00:00:00.000Z"],
      ["schema", "outro"],
      ["criptografia", "age"],
      ["remoto", "outro:destino"],
    ]) {
      json(ponteiro, { ...original, [campo]: valor });
      for (const acao of ["conferir-estado", "diagnosticar-integridade"]) {
        const resultado = spawnSync(
          process.execPath,
          ["scripts/servidor/recibos.mjs", acao, local, ponteiro],
          {
            cwd: raiz,
            env: {
              PATH: env.PATH,
              SERVIDOR_ALVO_CHAVE: identidade.trava,
              BACKUP_BANCO_VERIFICADO: "escola",
              DATABASE_SCHEMA: "public",
              BACKUP_REMOTO: "",
            },
            encoding: "utf8",
            timeout: 10000,
          },
        );
        assert.equal(resultado.error, undefined);
        assert.equal(resultado.signal, null);
        assert.equal(resultado.status, 1, `${acao} deve rejeitar ${campo} divergente`);
        assert.match(resultado.stderr, /\[recibos\] Verificação falhou/);
      }
    }
    json(ponteiro, original);
    json(ponteiro, { ...original, verificadoRemoto: "true" });
    const booleanoInvalido = verificar();
    assert.equal(booleanoInvalido.error, undefined);
    assert.equal(booleanoInvalido.signal, null);
    assert.equal(booleanoInvalido.status, 1, "recusar confirmação remota que não seja booleana");
    assert.match(booleanoInvalido.stderr, /\[recibos\] Verificação falhou/);
    json(ponteiro, original);
    json(ponteiro, { ...original, ambiente: "", ambienteSha256: "" });
    const ambienteOmitido = verificar();
    assert.equal(ambienteOmitido.error, undefined);
    assert.equal(ambienteOmitido.signal, null);
    assert.equal(ambienteOmitido.status, 1, "recusar ambiente omitido do ponteiro");
    assert.match(ambienteOmitido.stderr, /\[recibos\] Verificação falhou/);
    json(ponteiro, original);
    const legado = {
      ...recibo,
      escopo: { ...recibo.escopo, alvo: "url-conservador", banco: null },
    };
    json(path.join(local, `${base}.confirmado.json`), legado);
    const diagnostico = verificar({ BACKUP_MODO: "url" }, ["--diagnosticar-integridade"]);
    assert.equal(diagnostico.error, undefined);
    assert.equal(diagnostico.signal, null);
    assert.equal(diagnostico.status, 0, diagnostico.stderr);
    assert.match(diagnostico.stdout, /origem.*não comprovada/i);
    const legadoProtegido = verificar({ BACKUP_MODO: "url" });
    assert.equal(legadoProtegido.error, undefined);
    assert.equal(legadoProtegido.signal, null);
    assert.equal(legadoProtegido.status, 1);
    assert.match(
      legadoProtegido.stderr,
      /Origem URL legada não adotada; use diagnóstico separado\./,
    );
    gravar(path.join(local, nome), "adulterado");
    const diagnosticoAdulterado = verificar({ BACKUP_MODO: "url" }, ["--diagnosticar-integridade"]);
    assert.equal(diagnosticoAdulterado.error, undefined);
    assert.equal(diagnosticoAdulterado.signal, null);
    assert.equal(diagnosticoAdulterado.status, 1);
    assert.match(diagnosticoAdulterado.stderr, /\[recibos\] Verificação falhou/);
    gravar(path.join(local, nome), conteudo);
    const remotoDir = path.join(tmp, "remoto");
    fs.mkdirSync(remotoDir);
    const remoto = `falso:${remotoDir}`;
    const configRclone = path.join(tmp, "rclone.conf");
    gravar(configRclone, "[falso]\ntype = local\n");
    gravar(
      path.join(bin, "rclone"),
      `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst [cmd,origem,destino]=process.argv.slice(2);\nif(cmd!=='copyto'||!origem.startsWith('falso:'))process.exit(93);\ntry{fs.copyFileSync(origem.slice(6),destino);}catch{process.exit(94);}\n`,
    );
    fs.chmodSync(path.join(bin, "rclone"), 0o700);
    const reciboRemoto = {
      ...recibo,
      remoto,
      etapas: { ...recibo.etapas, remotoVerificado: true },
    };
    json(path.join(local, `${base}.confirmado.json`), reciboRemoto);
    json(ponteiro, { ...original, remoto, verificadoRemoto: true });
    for (const item of reciboRemoto.artefatos) {
      fs.copyFileSync(path.join(local, item.nome), path.join(remotoDir, item.nome));
    }
    fs.copyFileSync(
      path.join(local, `${base}.confirmado.json`),
      path.join(remotoDir, `${base}.confirmado.json`),
    );
    const envRemoto = { BACKUP_REMOTO: remoto, BACKUP_RCLONE_CONFIG: configRclone };
    const remotoValido = verificar(envRemoto);
    assert.equal(remotoValido.status, 0, remotoValido.stdout + remotoValido.stderr);
    for (const ausente of [
      nome,
      `${nome}.sha256`,
      nomeAmbiente,
      `${nomeAmbiente}.sha256`,
      `${base}.confirmado.json`,
    ]) {
      fs.renameSync(path.join(remotoDir, ausente), path.join(remotoDir, `${ausente}.guardado`));
      const itemAusente = verificar(envRemoto);
      assert.equal(itemAusente.error, undefined);
      assert.equal(itemAusente.signal, null);
      assert.equal(itemAusente.status, 1, `recusar artefato remoto ausente: ${ausente}`);
      assert.ok(itemAusente.stderr.includes(`Não foi possível baixar ${ausente}`));
      fs.renameSync(path.join(remotoDir, `${ausente}.guardado`), path.join(remotoDir, ausente));
    }
    json(ponteiro, original);
    json(path.join(local, `${base}.confirmado.json`), recibo);
    const divergente = verificar({ POSTGRES_DB: "outro" });
    assert.equal(divergente.error, undefined);
    assert.equal(divergente.signal, null);
    assert.equal(divergente.status, 1, "deve recusar banco efetivo diferente");
    assert.match(divergente.stderr, /Banco efetivo diverge/);
    gravar(path.join(local, nome), "adulterado");
    const adulterado = verificar();
    assert.equal(adulterado.error, undefined);
    assert.equal(adulterado.signal, null);
    assert.equal(adulterado.status, 1, "deve recusar arquivo adulterado");
    assert.match(adulterado.stderr, /\[recibos\] Verificação falhou/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
