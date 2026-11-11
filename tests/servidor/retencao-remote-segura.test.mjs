// Exercita somente o consumidor remoto e transporte falso com dados sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { conferirRemoto, ler } from "../../scripts/servidor/backup-recibos.mjs";
import * as backup from "../../scripts/servidor/backup-recibos.mjs";
import { planejarRetencao } from "../../scripts/servidor/recibos.mjs";

const scriptBackup = fileURLToPath(
  new URL("../../scripts/servidor/backup-recibos.mjs", import.meta.url),
);
const scriptRecibos = fileURLToPath(new URL("../../scripts/servidor/recibos.mjs", import.meta.url));

test("importação oferece verificação de artefato sem executar a CLI", () => {
  const resultado = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const modulo = await import(${JSON.stringify(pathToFileURL(scriptBackup).href)});
    if (typeof modulo.conferirRemoto !== 'function') throw new Error('verificador ausente');
  `,
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.equal(resultado.stderr, "");
});

const hash = (dados) => createHash("sha256").update(dados).digest("hex");
const base = "frequenciapp-20200101T000000Z-abcdef01";
const dump = `${base}.dump.gpg`;
const reciboNome = `${base}.confirmado.json`;
const falso = `#!/usr/bin/env node
const fs = require('node:fs'); const path = require('node:path');
const cfg = JSON.parse(fs.readFileSync(process.env.RCLONE_CONFIG));
const args = process.argv.slice(2); const remoto = cfg.remoto;
fs.appendFileSync(path.join(path.dirname(remoto), 'eventos'), args[0] + '\\n');
if (args[0] === 'lsjson' && args[1] === 'falso:copias') {
  process.stdout.write(JSON.stringify(fs.readdirSync(remoto).map(n=>({Path:n,IsDir:false}))));
} else if (args[0] === 'copy' && args[1] === 'falso:copias' && args[3] === '--files-from-raw') {
  const log = path.join(path.dirname(remoto), 'eventos');
  const anteriores = fs.readFileSync(log,'utf8').split('\\n').filter(x=>x==='copy').length;
  for (const n of fs.readFileSync(args[4], 'utf8').trim().split('\\n')) {
    if (n.includes('/') || !n) process.exit(90);
    const origem=path.join(remoto,n), destino=path.join(args[2],n);
    const size=fs.statSync(origem).size;
    if (cfg.link === n) fs.symlinkSync(origem,destino);
    else if (size > 200 * 1024 * 1024) { fs.closeSync(fs.openSync(destino,'w')); fs.truncateSync(destino,size); }
    else fs.copyFileSync(origem,destino);
  }
  if (cfg.adulterar && anteriores === 1) fs.writeFileSync(path.join(remoto,cfg.adulterar), 'alterado');
} else if (args[0] === 'deletefile' && args[1].startsWith('falso:copias/')) {
  const n=args[1].slice('falso:copias/'.length); if(n.includes('/')) process.exit(90);
  fs.unlinkSync(path.join(remoto,n));
} else process.exit(91);
`;
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-remota-"));
  const dir = (n) => {
    const d = path.join(tmp, n);
    fs.mkdirSync(d, { mode: 0o700 });
    return d;
  };
  const catalogo = dir("catalogo"),
    remoto = dir("remoto"),
    bin = dir("bin"),
    estado = dir("estado");
  const diarios = path.join(estado, "diarios"),
    lock = path.join(tmp, "lock");
  fs.writeFileSync(lock, "", { mode: 0o600 });
  fs.writeFileSync(path.join(bin, "rclone"), falso, { mode: 0o700 });
  const config = path.join(tmp, "rclone.json");
  fs.writeFileSync(config, JSON.stringify({ remoto }), { mode: 0o600 });
  const conteudo = Buffer.from("dump sintético");
  const sidecar = `${hash(conteudo)}  ${dump}\n`;
  const r = {
    versao: 1,
    base,
    em: "2020-01-01T00:00:00.000Z",
    criptografia: "gpg",
    destinatario: "sintético",
    remoto: "falso:copias",
    escopo: { tipo: "schema", schema: "public", alvo: "sintetico", banco: "escola" },
    etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
    artefatos: [
      { nome: dump, sha256: hash(conteudo) },
      { nome: `${dump}.sha256`, sha256: hash(sidecar) },
    ],
  };
  fs.writeFileSync(path.join(remoto, dump), conteudo, { mode: 0o600 });
  fs.writeFileSync(path.join(remoto, `${dump}.sha256`), sidecar, { mode: 0o600 });
  const recibo = JSON.stringify(r) + "\n";
  for (const d of [catalogo, remoto])
    fs.writeFileSync(path.join(d, reciboNome), recibo, { mode: 0o600 });
  const executar = (minimo = "1", dias = "1", script = scriptBackup, nodeArgs = []) => {
    const fd = fs.openSync(lock, "r");
    try {
      return spawnSync(
        process.execPath,
        [...nodeArgs, script, "expurgar-remoto", catalogo, diarios],
        {
          env: {
            PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
            HOME: tmp,
            TMPDIR: tmp,
            BACKUP_MODO: "compose",
            BACKUP_CATALOGO_PERSISTENTE: "true",
            SERVIDOR_ALVO_CHAVE: "sintetico",
            BACKUP_BANCO_VERIFICADO: "escola",
            DATABASE_SCHEMA: "public",
            BACKUP_REMOTO: "falso:copias",
            BACKUP_RETER_MINIMO: minimo,
            BACKUP_RETER_DIAS: dias,
            RCLONE_CONFIG: config,
            SERVIDOR_LOCK_HERDADO: lock,
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
  return { tmp, catalogo, remoto, diarios, config, r, executar };
}
function conferir(resultado, status) {
  assert.equal(resultado.error, undefined, "processo deve terminar sem timeout ou erro de spawn");
  assert.equal(resultado.signal, null, "processo não deve terminar por sinal");
  assert.equal(resultado.status, status, resultado.stderr);
}

for (const retomada of [false, true]) {
  test(`expurgo remoto sem contrato é bloqueado antes do transporte (${retomada ? "retomada" : "novo"})`, () => {
    const f = fixture();
    try {
      if (retomada) {
        fs.mkdirSync(f.diarios, { mode: 0o700 });
        const bytes = fs.readFileSync(path.join(f.catalogo, reciboNome));
        fs.writeFileSync(
          path.join(f.diarios, `${base}.json`),
          JSON.stringify({
            versao: 1,
            recibo: f.r,
            reciboSha256: hash(bytes),
            removidos: [],
            pendente: null,
            concluido: false,
          }),
          { mode: 0o600 },
        );
      }
      const nomes = fs.readdirSync(f.remoto).sort();
      const antes = nomes.map((nome) => fs.readFileSync(path.join(f.remoto, nome)));
      const catalogoAntes = fs.readFileSync(path.join(f.catalogo, reciboNome));
      const diarioAntes = retomada ? fs.readFileSync(path.join(f.diarios, `${base}.json`)) : null;
      const resultado = f.executar("0");
      const eventos = fs.existsSync(path.join(f.tmp, "eventos"))
        ? fs.readFileSync(path.join(f.tmp, "eventos"), "utf8").trim().split("\n")
        : [];
      assert.deepEqual(eventos, [], `operações proibidas: ${eventos}`);
      conferir(resultado, 1);
      assert.match(
        resultado.stderr,
        /Expurgo remoto suspenso.*transporte limitado.*exclusão condicional ou exclusividade/i,
      );
      assert.deepEqual(fs.readdirSync(f.remoto).sort(), nomes);
      assert.deepEqual(
        nomes.map((nome) => fs.readFileSync(path.join(f.remoto, nome))),
        antes,
      );
      assert.deepEqual(fs.readFileSync(path.join(f.catalogo, reciboNome)), catalogoAntes);
      if (retomada)
        assert.deepEqual(fs.readFileSync(path.join(f.diarios, `${base}.json`)), diarioAntes);
      else assert.ok(!fs.existsSync(path.join(f.diarios, `${base}.json`)));
    } finally {
      fs.rmSync(f.tmp, { recursive: true, force: true });
    }
  });
}

test("CLI chamada por symlink também bloqueia expurgo", () => {
  const f = fixture();
  try {
    const link = path.join(f.tmp, "cli.mjs");
    fs.symlinkSync(scriptBackup, link);
    fs.symlinkSync(scriptRecibos, path.join(f.tmp, "recibos.mjs"));
    for (const nome of ["dropbox-retencao.mjs", "dropbox-api.mjs", "dropbox-estado.mjs"]) {
      fs.symlinkSync(
        fileURLToPath(new URL(`../../scripts/servidor/${nome}`, import.meta.url)),
        path.join(f.tmp, nome),
      );
    }
    for (const nodeArgs of [[], ["--preserve-symlinks-main"]]) {
      const resultado = f.executar("0", "1", link, nodeArgs);
      conferir(resultado, 1);
      assert.match(resultado.stderr, /Expurgo remoto suspenso/);
    }
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("falha de resolução da entrada CLI não termina silenciosamente com sucesso", () => {
  const f = fixture();
  try {
    const preload = path.join(f.tmp, "falha-realpath.cjs");
    fs.writeFileSync(
      preload,
      `const fs = require('node:fs');
const original = fs.realpathSync;
fs.realpathSync = function (p, ...args) {
  if (p === process.argv[1] && new Error().stack.includes('ehEntradaPrincipal')) {
    process.stderr.write('FALHA_REALPATH_INJETADA\\n');
    throw Object.assign(new Error('falha injetada'), { code: 'EACCES' });
  }
  return original.call(this, p, ...args);
};\n`,
      { mode: 0o600 },
    );
    const positivo = f.executar("0");
    conferir(positivo, 1);
    assert.match(positivo.stderr, /Expurgo remoto suspenso/);
    const resultado = f.executar("0", "1", scriptBackup, ["--require", preload]);
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    assert.match(resultado.stderr, /FALHA_REALPATH_INJETADA/);
    assert.equal(resultado.status, 1, resultado.stderr);
    assert.match(resultado.stderr, /não foi possível identificar a entrada/i);
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("expurgo desativado e planejamento diagnóstico permanecem disponíveis", () => {
  const f = fixture();
  try {
    conferir(f.executar("0", "0"), 0);
    assert.ok(!fs.existsSync(path.join(f.tmp, "eventos")));
    const plano = spawnSync(process.execPath, [scriptRecibos, "planejar-remoto", f.catalogo], {
      env: {
        BACKUP_CATALOGO_PERSISTENTE: "true",
        SERVIDOR_ALVO_CHAVE: "sintetico",
        BACKUP_BANCO_VERIFICADO: "escola",
        DATABASE_SCHEMA: "public",
        BACKUP_REMOTO: "falso:copias",
        BACKUP_RETER_MINIMO: "0",
        BACKUP_RETER_DIAS: "1",
      },
      encoding: "utf8",
      timeout: 30000,
    });
    conferir(plano, 0);
    assert.match(plano.stdout, new RegExp(base));
    assert.ok(!fs.existsSync(path.join(f.tmp, "eventos")));
    assert.deepEqual(fs.readdirSync(f.remoto).sort(), [dump, `${dump}.sha256`, reciboNome].sort());
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

// Estes casos verificam somente leituras locais e planejamento. Não executam expurgo.
test("validação pura de diário aceita retomada e rejeita progresso incoerente", () => {
  const f = fixture();
  try {
    assert.equal(typeof backup.validarDiario, "function");
    const bytes = fs.readFileSync(path.join(f.catalogo, reciboNome));
    const registro = { r: f.r, bytes };
    const diario = {
      versao: 1,
      recibo: f.r,
      reciboSha256: hash(bytes),
      removidos: [dump],
      pendente: `${dump}.sha256`,
      concluido: false,
    };
    backup.validarDiario(diario, f.r, registro);
    for (const invalido of [
      { ...diario, reciboSha256: "0".repeat(64) },
      { ...diario, removidos: [`${dump}.sha256`] },
      { ...diario, pendente: reciboNome },
      { ...diario, concluido: true },
      { ...diario, versao: 2 },
    ])
      assert.throws(() => backup.validarDiario(invalido, f.r, registro));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

function verificar(f, nome) {
  const artefato = f.r.artefatos.find((a) => a.nome === nome);
  assert.ok(artefato);
  return conferirRemoto(path.join(f.remoto, nome), artefato, f.r);
}
function intacto(f, nomes = [dump, `${dump}.sha256`, reciboNome]) {
  assert.deepEqual(fs.readdirSync(f.remoto).sort(), nomes.sort());
  assert.ok(!fs.existsSync(path.join(f.tmp, "eventos")));
}

test("verificador lê dump esparso incrementalmente e rejeita hash divergente", () => {
  const f = fixture();
  try {
    const arquivo = path.join(f.remoto, dump);
    fs.truncateSync(arquivo, 384 * 1024 * 1024);
    fs.writeFileSync(arquivo, "");
    fs.truncateSync(arquivo, 384 * 1024 * 1024);
    const h = createHash("sha256"),
      bloco = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < 384; i++) h.update(bloco);
    f.r.artefatos[0].sha256 = h.digest("hex");
    verificar(f, dump);
    f.r.artefatos[0].sha256 = "0".repeat(64);
    assert.throws(() => verificar(f, dump));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("leitura de catálogo aceita recibo íntegro e recusa JSON acima do limite", () => {
  const f = fixture();
  try {
    const arquivo = path.join(f.catalogo, reciboNome);
    assert.deepEqual(JSON.parse(ler(arquivo)), f.r);
    fs.appendFileSync(arquivo, " ".repeat(2 * 1024 * 1024));
    assert.throws(() => ler(arquivo));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("verificador recusa sidecar incoerente mesmo com hash próprio válido", () => {
  const f = fixture();
  try {
    verificar(f, `${dump}.sha256`);
    const invalido = `${"0".repeat(64)}  ${dump}\n`;
    fs.writeFileSync(path.join(f.remoto, `${dump}.sha256`), invalido);
    f.r.artefatos[1].sha256 = hash(invalido);
    assert.throws(() => verificar(f, `${dump}.sha256`));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("duas verificações independentes detectam alteração posterior do sidecar", () => {
  const f = fixture();
  try {
    verificar(f, `${dump}.sha256`);
    fs.writeFileSync(path.join(f.remoto, `${dump}.sha256`), "alterado");
    assert.throws(() => verificar(f, `${dump}.sha256`));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("verificador rejeita symlink de artefato", () => {
  const f = fixture();
  try {
    verificar(f, dump);
    const link = path.join(f.tmp, "link");
    fs.symlinkSync(path.join(f.remoto, dump), link);
    assert.throws(() => conferirRemoto(link, f.r.artefatos[0], f.r));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("verificador recusa sidecar esparso gigante", () => {
  const f = fixture();
  try {
    verificar(f, `${dump}.sha256`);
    fs.truncateSync(path.join(f.remoto, `${dump}.sha256`), 8 * 1024 * 1024 * 1024);
    assert.throws(() => verificar(f, `${dump}.sha256`));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("verificador recusa sidecar incoerente mesmo sem o dump local", () => {
  const f = fixture();
  try {
    verificar(f, `${dump}.sha256`);
    const invalido = `${"0".repeat(64)}  ${dump}\n`;
    fs.writeFileSync(path.join(f.remoto, `${dump}.sha256`), invalido);
    f.r.artefatos[1].sha256 = hash(invalido);
    fs.unlinkSync(path.join(f.remoto, dump));
    assert.throws(() => verificar(f, `${dump}.sha256`));
    intacto(f, [`${dump}.sha256`, reciboNome]);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("leitura de diário recusa tamanho acima de 2 MiB e symlink", () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.diarios, { mode: 0o700 });
    const arquivo = path.join(f.diarios, `${base}.json`);
    fs.writeFileSync(arquivo, JSON.stringify({ recibo: f.r }), { mode: 0o600 });
    assert.deepEqual(JSON.parse(ler(arquivo, 2 * 1024 * 1024)).recibo, f.r);
    fs.appendFileSync(arquivo, " ".repeat(2 * 1024 * 1024));
    assert.throws(() => ler(arquivo, 2 * 1024 * 1024));
    fs.unlinkSync(arquivo);
    fs.symlinkSync(path.join(f.catalogo, reciboNome), arquivo);
    assert.throws(() => ler(arquivo, 2 * 1024 * 1024));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("leitura aceita diário acima de 1 MiB com recibo próximo do limite", () => {
  const f = fixture();
  try {
    const limite = 1024 * 1024;
    const inicial = Buffer.byteLength(JSON.stringify(f.r) + "\n");
    f.r.destinatario += "x".repeat(limite - 40 - inicial);
    const bytes = JSON.stringify(f.r) + "\n";
    assert.ok(Buffer.byteLength(bytes) <= limite);
    const diario = JSON.stringify({
      versao: 1,
      recibo: f.r,
      reciboSha256: hash(bytes),
      removidos: [],
      pendente: null,
      concluido: false,
    });
    assert.ok(Buffer.byteLength(diario) > limite);
    fs.mkdirSync(f.diarios, { mode: 0o700 });
    const arquivo = path.join(f.diarios, `${base}.json`);
    fs.writeFileSync(arquivo, diario, { mode: 0o600 });
    assert.throws(() => ler(arquivo));
    assert.deepEqual(JSON.parse(ler(arquivo, 2 * limite)).recibo, f.r);
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("planejamento distingue mínimo zero e um sem autorizar expurgo CLI", () => {
  const f = fixture();
  try {
    const opcoes = {
      alvo: "sintetico",
      banco: "escola",
      schema: "public",
      destino: "falso:copias",
      dias: 1,
      agora: Date.now(),
      remoto: true,
    };
    assert.deepEqual(planejarRetencao([f.r], { ...opcoes, minimo: 1 }), []);
    const plano = planejarRetencao([f.r], { ...opcoes, minimo: 0 });
    assert.equal(plano.length, 1);
    assert.equal(plano[0].base, base);
    assert.deepEqual(plano[0].artefatos, [dump, `${dump}.sha256`, reciboNome]);
    const resultado = f.executar("0");
    conferir(resultado, 1);
    assert.match(resultado.stderr, /Expurgo remoto suspenso/);
    assert.ok(fs.existsSync(path.join(f.catalogo, reciboNome)));
    intacto(f);
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
