// Exercita o ciclo de autoridade Dropbox, upload rclone falso e publicação durável do recibo.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const RAIZ = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const RCLONE_FALSO = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync(process.env.FALSO_RCLONE_CONFIG, 'utf8'));
const [comando, origem, destino] = process.argv.slice(2);
fs.appendFileSync(config.log, comando + ' ' + origem + ' ' + destino + '\\n');
if (comando !== 'copyto') process.exit(90);
const prefixo = 'falso:copias/';
if (!destino.startsWith(prefixo)) process.exit(91);
const nome = destino.slice(prefixo.length);
if (!nome || nome.includes('/') || nome.includes('\\\\')) process.exit(92);
fs.copyFileSync(origem, path.join(config.remoto, nome));
`;

const BACKUP_FALSO = `// Executa um backup sintético e publica o recibo pelo handoff de autoridade.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const e = process.env;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const catalogo = path.join(e.ESTADO_DIR, "recibos");
const local = e.BACKUP_BANCO_DIR;
const remoto = e.FALSO_REMOTO_DIR;
const cenario = e.FALSO_CENARIO ?? "ok";
const traco = (linha) => fs.appendFileSync(e.FALSO_TRACO, linha + "\\n");
const mapFds = ["inherit", "inherit", "inherit", "ignore", "ignore", "ignore", 6, 7, "ignore", 9];
function handoff(acao, nome) {
  return spawnSync(
    process.execPath,
    [path.join(DIR, "dropbox-autoridade.mjs"), acao, ...(nome ? [nome] : [])],
    { env: e, stdio: mapFds },
  );
}
const conferido = handoff("conferir");
if (conferido.status !== 0) {
  traco("conferir-falhou");
  process.exit(20);
}
traco("conferir-ok");
if (e.FALSO_ESPERA_ARQUIVO) {
  traco("aguardando-liberacao");
  const limite = Date.now() + 15000;
  while (!fs.existsSync(e.FALSO_ESPERA_ARQUIVO) && Date.now() < limite)
    await new Promise((resolve) => setTimeout(resolve, 25));
  if (!fs.existsSync(e.FALSO_ESPERA_ARQUIVO)) process.exit(21);
  traco("liberado");
} else if (Number(e.FALSO_ATRASO_MS ?? 0) > 0) {
  await new Promise((resolve) => setTimeout(resolve, Number(e.FALSO_ATRASO_MS)));
}

fs.mkdirSync(catalogo, { recursive: true, mode: 0o700 });
const agora = new Date();
const carimbo = agora.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
const base = "frequenciapp-" + carimbo + "-" + randomBytes(4).toString("hex");
const dump = base + ".dump.gpg";
const dumpBytes = Buffer.from("dump sintetico " + base + "\\n");
const side = Buffer.from(sha(dumpBytes) + "  " + dump + "\\n");
const recibo = base + ".confirmado.json";
const r = {
  versao: 1,
  base,
  em: agora.toISOString(),
  criptografia: "gpg",
  destinatario: "sintetico",
  remoto: e.BACKUP_REMOTO,
  escopo: {
    tipo: "schema",
    alvo: e.SERVIDOR_ALVO_CHAVE,
    banco: e.BACKUP_BANCO_VERIFICADO,
    schema: e.DATABASE_SCHEMA ?? "public",
  },
  etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
  artefatos: [
    { nome: dump, sha256: sha(dumpBytes) },
    { nome: dump + ".sha256", sha256: sha(side) },
  ],
};
if (cenario === "recibo-remoto") r.remoto = "falso:outro";
if (cenario === "recibo-alvo") r.escopo.alvo = "outro";
const bytesRecibo = Buffer.from(JSON.stringify(r) + "\\n");
const gravar = (arquivo, bytes) => fs.writeFileSync(arquivo, bytes, { mode: 0o600 });
gravar(path.join(local, dump), dumpBytes);
gravar(path.join(local, dump + ".sha256"), side);
gravar(path.join(local, recibo), bytesRecibo);
gravar(path.join(catalogo, recibo), bytesRecibo);
gravar(
  path.join(e.ESTADO_DIR, "ultimo-backup.json"),
  JSON.stringify({
    em: r.em,
    modo: "compose",
    criptografia: r.criptografia,
    arquivo: dump,
    sha256: sha(dumpBytes),
    schema: r.escopo.schema,
    ambiente: "",
    ambienteSha256: "",
    remoto: r.remoto,
    verificadoRemoto: true,
    recibo,
  }) + "\\n",
);
for (const [nome, bytes] of [
  [dump, dumpBytes],
  [dump + ".sha256", side],
  [recibo, bytesRecibo],
])
  execFileSync("rclone", ["copyto", path.join(local, nome), e.BACKUP_REMOTO + "/" + nome], {
    env: e,
    stdio: "ignore",
  });
traco("upload-ok");
const resultado = { base, recibo, dump, cenarios: cenario };
gravar(e.FALSO_RESULTADO, JSON.stringify(resultado) + "\\n");

if (cenario === "crash-apos-upload") {
  traco("falha-antes-da-publicacao");
  process.exit(3);
}
if (cenario === "sem-marcador") fs.unlinkSync(e.FALSO_MARCADOR);
if (cenario === "sessao-do-marcador") {
  const marcador = JSON.parse(fs.readFileSync(e.FALSO_MARCADOR, "utf8"));
  marcador.sessao = "0".repeat(64);
  gravar(e.FALSO_MARCADOR, JSON.stringify(marcador));
}
if (cenario === "sessao-do-handoff") e.BACKUP_DROPBOX_SESSAO = "1".repeat(64);
if (cenario === "local-divergente") fs.appendFileSync(path.join(local, recibo), " ");
if (cenario === "estado-divergente") {
  const estado = JSON.parse(fs.readFileSync(path.join(e.ESTADO_DIR, "ultimo-backup.json"), "utf8"));
  estado.recibo = "frequenciapp-20000101T000000Z-00000000.confirmado.json";
  gravar(path.join(e.ESTADO_DIR, "ultimo-backup.json"), JSON.stringify(estado) + "\\n");
}
if (cenario !== "sem-marcador") {
  if (!fs.existsSync(e.FALSO_MARCADOR)) {
    traco("marcador-ausente-antes");
    process.exit(13);
  }
  traco("marcador-presente");
}
const publicado = handoff("publicar", recibo);
traco(publicado.status === 0 ? "publicar-ok" : "publicar-falhou");
if (publicado.status === 0 && fs.existsSync(e.FALSO_MARCADOR)) {
  traco("marcador-remanescente");
  process.exit(12);
}
process.exit(publicado.status ?? 1);
`;

const BACKUP_SHELL = `#!/usr/bin/env bash
set -Eeuo pipefail
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/backup-falso.mjs"
`;

const AJUDANTE_AUTORIDADE = `// Mantém a autoridade e entrega os descritores do contrato a um filho.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const [configFile, authorityLock, targetLock, modo] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const prova = process.env.PROVA;
const provaFd = fs.openSync(prova, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
const lockFd = fs.openSync(authorityLock, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
const alvoFd = fs.openSync(targetLock, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
execFileSync("flock", ["-n", "3"], {
  stdio: ["ignore", "ignore", "ignore", lockFd],
  env: { PATH: "/usr/bin:/bin" },
});
fs.writeFileSync(
  provaFd,
  JSON.stringify({
    pid: process.pid,
    sessao: process.env.SESSAO,
    configHash: hash(JSON.stringify(config)),
    proofFd: provaFd,
    lockFd,
  }),
);
if (modo !== "nlink") fs.unlinkSync(prova);
if (modo === "troca-inode") {
  const novo = authorityLock + ".novo";
  fs.writeFileSync(novo, "", { mode: 0o600 });
  fs.renameSync(novo, authorityLock);
}
if (modo === "troca-alvo") {
  const novo = targetLock + ".novo";
  fs.writeFileSync(novo, "", { mode: 0o600 });
  fs.renameSync(novo, targetLock);
}
const fd7 = modo === "fd7-alvo" ? alvoFd : modo === "fd7-ignore" ? "ignore" : lockFd;
const filho = spawnSync(process.execPath, [process.env.CLI, "conferir"], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe", "ignore", "ignore", "ignore", provaFd, fd7, "ignore", alvoFd],
});
process.stdout.write(filho.stdout ?? "");
process.stderr.write(filho.stderr ?? "");
process.exit(filho.status ?? 1);
`;

function certificadoTls(tmp) {
  const key = path.join(tmp, "chave.pem"),
    cert = path.join(tmp, "certificado.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-keyout",
      key,
      "-out",
      cert,
      "-subj",
      "/CN=api.dropbox.com",
      "-addext",
      "subjectAltName=DNS:api.dropbox.com,DNS:api.dropboxapi.com,DNS:content.dropboxapi.com",
    ],
    { stdio: "ignore" },
  );
  fs.chmodSync(key, 0o600);
  fs.chmodSync(cert, 0o600);
  return { key, cert };
}

async function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dropbox-autoridade-"));
  const dir = (nome) => {
    const caminho = path.join(tmp, nome);
    fs.mkdirSync(caminho, { mode: 0o700 });
    return caminho;
  };
  const estado = dir("estado"),
    catalogo = dir("estado/recibos"),
    local = dir("banco"),
    remoto = dir("remoto"),
    bin = dir("bin"),
    scripts = dir("scripts");
  const authorityLock = path.join(tmp, "autoridade.lock"),
    targetLock = path.join(tmp, "alvo.lock");
  const gravar = (arquivo, bytes, modo = 0o600) => fs.writeFileSync(arquivo, bytes, { mode: modo });
  gravar(authorityLock, "");
  gravar(targetLock, "");

  const { key, cert } = certificadoTls(tmp);
  const rclone = path.join(tmp, "rclone.conf"),
    configFile = path.join(tmp, "adocao.json"),
    tokenFile = path.join(tmp, "oauth.json"),
    eventos = path.join(tmp, "eventos"),
    eventosTls = path.join(tmp, "eventos-tls"),
    traco = path.join(tmp, "traco"),
    resultado = path.join(tmp, "resultado.json"),
    marcador = `${authorityLock}.upload.json`;
  gravar(rclone, "[falso]\ntype = dropbox\nroot_namespace = 42\ntoken = sintetico\n");
  gravar(
    tokenFile,
    JSON.stringify({
      clientId: "cliente-sintetico",
      clientSecret: "segredo-sintetico",
      refreshToken: "refresh-sintetico",
    }),
  );
  gravar(
    configFile,
    JSON.stringify({
      versao: 1,
      adocao: "pasta-exclusiva-frequenciapp-v1",
      accountId: "dbid:synthetic",
      namespaceId: "42",
      folderId: "id:folder_synthetic",
      folderPath: "/copias",
      destino: "falso:copias",
      alvo: "sintetico",
      banco: "escola",
      schema: "public",
      tokenFile,
      rcloneConfig: rclone,
      rcloneConfigSha256: sha(fs.readFileSync(rclone)),
      authorityLock,
      targetLock,
      limiteBytes: 1024 * 1024,
      timeoutMs: 50,
    }),
  );
  const configLongo = path.join(tmp, "adocao-longa.json");
  gravar(
    configLongo,
    JSON.stringify({
      ...JSON.parse(fs.readFileSync(configFile, "utf8")),
      timeoutMs: 5000,
    }),
  );

  // O manipulador procura backup-banco.sh ao lado do próprio módulo. A cópia
  // isolada permite trocar o produtor sem alterar o script real.
  for (const arquivo of ["dropbox-autoridade.mjs", "dropbox-estado.mjs", "recibos.mjs"])
    fs.copyFileSync(path.join(RAIZ, "scripts/servidor", arquivo), path.join(scripts, arquivo));
  gravar(path.join(scripts, "backup-banco.sh"), BACKUP_SHELL, 0o700);
  gravar(path.join(scripts, "backup-falso.mjs"), BACKUP_FALSO, 0o600);
  gravar(path.join(scripts, "ajudante-autoridade.mjs"), AJUDANTE_AUTORIDADE, 0o600);
  gravar(path.join(bin, "rclone"), RCLONE_FALSO, 0o700);
  gravar(path.join(tmp, "rclone.json"), JSON.stringify({ remoto, log: eventos }));

  const objetos = new Map(),
    requisicoes = [];
  let revisao = 100000000;
  const meta = (nome) => {
    const o = objetos.get(nome);
    return {
      ".tag": "file",
      name: nome,
      id: o.id,
      rev: o.rev,
      path_lower: `/copias/${nome.toLowerCase()}`,
      size: fs.statSync(path.join(remoto, nome)).size,
    };
  };
  const adicionarObjeto = (nome, bytes) => {
    gravar(path.join(remoto, nome), bytes);
    objetos.set(nome, {
      id: `id:${randomUUID()}`,
      rev: (++revisao).toString(16).padStart(9, "0"),
    });
  };
  const sincronizarObjetos = () => {
    for (const nome of fs.readdirSync(remoto))
      if (!objetos.has(nome)) adicionarObjeto(nome, fs.readFileSync(path.join(remoto, nome)));
  };
  const servidor = https.createServer(
    { key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
    async (req, res) => {
      let corpo = "";
      for await (const parte of req) corpo += parte;
      const arg = req.headers["dropbox-api-arg"]
        ? JSON.parse(req.headers["dropbox-api-arg"])
        : corpo && corpo[0] === "{"
          ? JSON.parse(corpo)
          : null;
      requisicoes.push({ rota: req.url, arg });
      const json = (dados, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(dados));
      };
      if (req.url === "/oauth2/token") {
        assert.equal(new URLSearchParams(corpo).get("refresh_token"), "refresh-sintetico");
        return json({ access_token: "access-sintetico", token_type: "bearer", expires_in: 3600 });
      }
      assert.equal(req.headers.authorization, "Bearer access-sintetico");
      sincronizarObjetos();
      if (req.url === "/2/users/get_current_account")
        return json({
          account_id: "dbid:synthetic",
          root_info: { root_namespace_id: "42", home_namespace_id: "42" },
        });
      assert.deepEqual(JSON.parse(req.headers["dropbox-api-path-root"]), {
        ".tag": "namespace_id",
        namespace_id: "42",
      });
      if (req.url === "/2/files/get_metadata")
        return json({
          ".tag": "folder",
          id: "id:folder_synthetic",
          name: "copias",
          path_lower: "/copias",
        });
      if (req.url === "/2/files/list_folder")
        return json({
          entries: [...objetos.keys()].map(meta),
          cursor: "completo",
          has_more: false,
        });
      if (req.url === "/2/files/download") {
        const nome = [...objetos.keys()].find(
          (n) => objetos.get(n).id === arg.path && objetos.get(n).rev === arg.rev,
        );
        if (!nome) return json({ error: "not_found" }, 409);
        res.writeHead(200, { "Dropbox-API-Result": JSON.stringify(meta(nome)) });
        return fs.createReadStream(path.join(remoto, nome)).pipe(res);
      }
      if (req.url === "/2/files/delete_v2") {
        const nome = [...objetos.keys()].find((n) => objetos.get(n).id === arg.path);
        if (!nome || objetos.get(nome).rev !== arg.parent_rev)
          return json({ error: "conflict" }, 409);
        const metadata = meta(nome);
        fs.unlinkSync(path.join(remoto, nome));
        objetos.delete(nome);
        return json({ metadata });
      }
      return json({ error: "rota_nao_simulada" }, 400);
    },
  );
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const preload = path.join(tmp, "transporte-teste.mjs");
  gravar(
    preload,
    `import https from 'node:https';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const original = https.request;
https.request = function(options, callback) {
  assert.ok(['api.dropbox.com','api.dropboxapi.com','content.dropboxapi.com'].includes(options.hostname));
  assert.equal(options.protocol, 'https:');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.minVersion, 'TLSv1.2');
  assert.equal(options.port, 443);
  assert.ok(!String(options.path).startsWith('/2/files/upload'));
  fs.appendFileSync(${JSON.stringify(eventosTls)}, JSON.stringify({hostname: options.hostname, path: options.path}) + '\\n');
  return original.call(this, {...options, hostname:'127.0.0.1', port:${servidor.address().port}, servername:options.hostname, ca:fs.readFileSync(${JSON.stringify(cert)})}, callback);
};
`,
  );

  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: tmp,
    TMPDIR: tmp,
    BACKUP_MODO: "compose",
    BACKUP_CATALOGO_PERSISTENTE: "true",
    SERVIDOR_ALVO_CHAVE: "sintetico",
    BACKUP_BANCO_VERIFICADO: "escola",
    DATABASE_SCHEMA: "public",
    BACKUP_REMOTO: "falso:copias",
    BACKUP_DROPBOX_CONFIG: configFile,
    BACKUP_RETER_MINIMO: "5",
    BACKUP_RETER_DIAS: "1",
    RCLONE_CONFIG: rclone,
    FALSO_RCLONE_CONFIG: path.join(tmp, "rclone.json"),
    SERVIDOR_LOCK_HERDADO: targetLock,
    ESTADO_DIR: estado,
    BACKUP_BANCO_DIR: local,
    NODE_OPTIONS: `--import=${preload}`,
    FALSO_REMOTO_DIR: remoto,
    FALSO_TRACO: traco,
    FALSO_RESULTADO: resultado,
    FALSO_MARCADOR: marcador,
  };

  function abrirAlvo() {
    return fs.openSync(targetLock, "r");
  }
  function executar(extra = {}) {
    const fd = abrirAlvo();
    const processo = spawn(
      process.execPath,
      [path.join(scripts, "dropbox-autoridade.mjs"), "executar"],
      {
        env: { ...env, ...extra },
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
      },
    );
    fs.closeSync(fd);
    return capturar(processo, 30000);
  }
  function retention(extra = {}) {
    const fd = abrirAlvo();
    const processo = spawn(
      process.execPath,
      [
        path.join(RAIZ, "scripts/servidor/backup-recibos.mjs"),
        "expurgar-remoto",
        catalogo,
        path.join(estado, "expurgos"),
      ],
      {
        env: { ...env, ...extra },
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
      },
    );
    fs.closeSync(fd);
    return capturar(processo, 30000);
  }
  function conferir(extra = {}, fds = {}) {
    const fdAlvo = abrirAlvo();
    const processo = spawn(
      process.execPath,
      [path.join(scripts, "dropbox-autoridade.mjs"), "conferir"],
      {
        env: { ...env, ...extra },
        stdio: [
          "ignore",
          "pipe",
          "pipe",
          "ignore",
          "ignore",
          "ignore",
          fds.prova ?? "ignore",
          fds.trava ?? "ignore",
          "ignore",
          fdAlvo,
        ],
      },
    );
    fs.closeSync(fdAlvo);
    return capturar(processo, 30000);
  }
  function ajudante(modo, extra = {}) {
    const prova = path.join(tmp, `prova-${randomUUID()}`);
    const processo = spawn(
      process.execPath,
      [path.join(scripts, "ajudante-autoridade.mjs"), configFile, authorityLock, targetLock, modo],
      {
        env: {
          ...env,
          ...extra,
          PROVA: prova,
          SESSAO: extra.BACKUP_DROPBOX_SESSAO ?? "a".repeat(64),
          CLI: path.join(scripts, "dropbox-autoridade.mjs"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return capturar(processo, 30000);
  }
  function semearAntigo(numero) {
    const base = `frequenciapp-2020010${numero}T000000Z-${numero.toString(16).padStart(8, "0")}`;
    const dump = `${base}.dump.gpg`;
    const dumpBytes = Buffer.from(`dump antigo ${numero}\n`);
    const side = Buffer.from(`${sha(dumpBytes)}  ${dump}\n`);
    const r = {
      versao: 1,
      base,
      em: new Date(Date.UTC(2020, 0, numero + 1)).toISOString(),
      criptografia: "gpg",
      destinatario: "sintetico",
      remoto: "falso:copias",
      escopo: { tipo: "schema", alvo: "sintetico", banco: "escola", schema: "public" },
      etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
      artefatos: [
        { nome: dump, sha256: sha(dumpBytes) },
        { nome: `${dump}.sha256`, sha256: sha(side) },
      ],
    };
    const bytes = Buffer.from(JSON.stringify(r) + "\n");
    gravar(path.join(catalogo, `${base}.confirmado.json`), bytes);
    adicionarObjeto(dump, dumpBytes);
    adicionarObjeto(`${dump}.sha256`, side);
    adicionarObjeto(`${base}.confirmado.json`, bytes);
  }
  return {
    tmp,
    estado,
    catalogo,
    local,
    remoto,
    authorityLock,
    targetLock,
    configFile,
    configLongo,
    eventos,
    eventosTls,
    traco,
    resultado,
    marcador,
    requisicoes,
    executar,
    retention,
    conferir,
    ajudante,
    semearAntigo,
    adicionarObjeto,
    async fechar() {
      servidor.closeAllConnections();
      await new Promise((fechar) => servidor.close(fechar));
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

function capturar(processo, limite) {
  let stdout = "",
    stderr = "";
  processo.stdout.on("data", (parte) => (stdout += parte));
  processo.stderr.on("data", (parte) => (stderr += parte));
  const prazo = setTimeout(() => processo.kill("SIGKILL"), limite);
  return new Promise((resolve, reject) => {
    processo.once("error", reject);
    processo.once("close", (status, signal) => {
      clearTimeout(prazo);
      resolve({ status, signal, stdout, stderr });
    });
  });
}
const linhas = (arquivo) =>
  fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8").trim().split("\n").filter(Boolean) : [];

test("o ciclo publica o recibo, remove o marcador e a retenção usa o token e o TLS locais", async () => {
  const f = await fixture();
  try {
    f.adicionarObjeto("arquivo-alheio.txt", Buffer.from("preservar\n"));
    for (let i = 0; i < 5; i++) f.semearAntigo(i);
    const r = await f.executar();
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(linhas(f.traco).includes("conferir-ok"));
    assert.ok(linhas(f.traco).includes("upload-ok"));
    assert.ok(linhas(f.traco).includes("marcador-presente"));
    assert.ok(linhas(f.traco).includes("publicar-ok"));
    assert.equal(linhas(f.eventos).filter((linha) => linha.startsWith("copyto ")).length, 3);
    assert.ok(!fs.existsSync(f.marcador));
    const publicado = JSON.parse(fs.readFileSync(f.resultado, "utf8"));
    const reciboCatalogo = fs.readFileSync(path.join(f.catalogo, publicado.recibo));
    const reciboLocal = fs.readFileSync(path.join(f.local, publicado.recibo));
    assert.ok(reciboCatalogo.equals(reciboLocal));
    assert.ok(fs.readFileSync(path.join(f.remoto, publicado.recibo)).equals(reciboCatalogo));
    assert.ok(
      fs
        .readFileSync(path.join(f.remoto, publicado.dump))
        .equals(fs.readFileSync(path.join(f.local, publicado.dump))),
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.estado, "ultimo-backup.json"), "utf8")).recibo,
      publicado.recibo,
    );
    assert.equal(fs.statSync(path.join(f.local, publicado.dump)).mode & 0o077, 0);
    assert.equal(fs.statSync(path.join(f.catalogo, publicado.recibo)).mode & 0o077, 0);
    assert.equal(fs.statSync(path.join(f.estado, "ultimo-backup.json")).mode & 0o077, 0);

    const retencao = await f.retention();
    assert.equal(retencao.signal, null);
    assert.equal(retencao.status, 0, retencao.stderr);
    assert.equal(fs.existsSync(path.join(f.remoto, "arquivo-alheio.txt")), true);
    const primeiro = fs
      .readdirSync(f.catalogo)
      .filter((nome) => nome.endsWith(".confirmado.json"))
      .map((nome) => JSON.parse(fs.readFileSync(path.join(f.catalogo, nome), "utf8")))
      .sort((a, b) => Date.parse(a.em) - Date.parse(b.em))[0];
    for (const artefato of primeiro.artefatos)
      assert.equal(fs.existsSync(path.join(f.remoto, artefato.nome)), false);
    assert.equal(fs.existsSync(path.join(f.remoto, `${primeiro.base}.confirmado.json`)), false);
    const diarios = fs.readdirSync(path.join(f.estado, "expurgos", "dropbox"));
    assert.equal(diarios.length, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.estado, "expurgos", "dropbox", diarios[0]), "utf8"))
        .valor.removidos,
      3,
    );
    const eventos = linhas(f.eventosTls).map((linha) => JSON.parse(linha));
    assert.ok(eventos.length > 0);
    assert.ok(eventos.every((evento) => !evento.path.includes("/2/files/upload")));
    assert.ok(
      eventos.every((evento) =>
        ["api.dropbox.com", "api.dropboxapi.com", "content.dropboxapi.com"].includes(
          evento.hostname,
        ),
      ),
    );
    assert.equal(
      f.requisicoes.filter((requisicao) => requisicao.rota === "/2/files/delete_v2").length,
      3,
    );
    assert.ok(!f.requisicoes.some((requisicao) => requisicao.rota.includes("upload")));
  } finally {
    await f.fechar();
  }
});

test("marcador ausente, sessão divergente, recibo divergente e cópia local divergente recusam a publicação", async () => {
  const casos = [
    "sem-marcador",
    "sessao-do-marcador",
    "sessao-do-handoff",
    "recibo-remoto",
    "recibo-alvo",
    "local-divergente",
    "estado-divergente",
  ];
  for (const cenario of casos) {
    const f = await fixture();
    try {
      const r = await f.executar({ FALSO_CENARIO: cenario });
      assert.equal(r.signal, null, cenario);
      assert.equal(r.status, 1, `${cenario}: ${r.stderr}`);
      assert.ok(linhas(f.traco).includes("publicar-falhou"), cenario);
      assert.ok(!linhas(f.traco).includes("publicar-ok"), cenario);
      if (cenario === "sem-marcador") assert.ok(!fs.existsSync(f.marcador), cenario);
      else assert.ok(fs.existsSync(f.marcador), cenario);
    } finally {
      await f.fechar();
    }
  }
});

test("falha depois do upload mantém o marcador, bloqueia a retenção e a próxima execução", async () => {
  const f = await fixture();
  try {
    const primeira = await f.executar({ FALSO_CENARIO: "crash-apos-upload" });
    assert.equal(primeira.signal, null);
    assert.equal(primeira.status, 3, primeira.stderr);
    assert.ok(fs.existsSync(f.marcador));
    const tracoAntes = linhas(f.traco).length;
    const arquivosAntes = fs.readdirSync(f.remoto).sort();
    const retencao = await f.retention();
    assert.equal(retencao.status, 1);
    assert.equal(retencao.signal, null);
    assert.ok(!fs.existsSync(f.eventosTls));
    assert.deepEqual(fs.readdirSync(f.remoto).sort(), arquivosAntes);
    const segunda = await f.executar();
    assert.equal(segunda.status, 1);
    assert.equal(segunda.signal, null);
    assert.ok(fs.existsSync(f.marcador));
    assert.equal(linhas(f.traco).length, tracoAntes);
  } finally {
    await f.fechar();
  }
});

test("a segunda execução recusa a autoridade ocupada e a configuração com espera aguarda a primeira", async () => {
  const curta = await fixture();
  try {
    const liberar = path.join(curta.tmp, "liberar-curta");
    const primeira = curta.executar({ FALSO_ESPERA_ARQUIVO: liberar });
    await esperarTraco(curta.traco, "aguardando-liberacao");
    const segunda = await curta.executar();
    assert.equal(segunda.status, 1);
    assert.equal(segunda.signal, null);
    fs.writeFileSync(liberar, "");
    assert.equal((await primeira).status, 0);
    assert.equal(linhas(curta.traco).filter((linha) => linha === "publicar-ok").length, 1);
  } finally {
    await curta.fechar();
  }

  const longa = await fixture();
  try {
    const liberar = path.join(longa.tmp, "liberar-longa");
    const primeira = longa.executar({ FALSO_ESPERA_ARQUIVO: liberar });
    await esperarTraco(longa.traco, "aguardando-liberacao");
    const segundaPromessa = longa.executar({
      BACKUP_DROPBOX_CONFIG: longa.configLongo,
    });
    const antes = await Promise.race([
      segundaPromessa.then((resultado) => ({ tipo: "fim", resultado })),
      new Promise((resolve) => setTimeout(() => resolve({ tipo: "espera" }), 300)),
    ]);
    assert.equal(antes.tipo, "espera");
    fs.writeFileSync(liberar, "");
    const segunda = await segundaPromessa;
    assert.equal(segunda.status, 0, segunda.stderr);
    assert.equal(segunda.signal, null);
    assert.equal((await primeira).status, 0);
    assert.equal(linhas(longa.traco).filter((linha) => linha === "publicar-ok").length, 2);
  } finally {
    await longa.fechar();
  }
});

test("o handoff recusa descritores ausentes, prova vinculada, autoridade trocada e pai não ancestral", async () => {
  const f = await fixture();
  try {
    const sessao = "b".repeat(64);
    const semProva = await f.conferir({ BACKUP_DROPBOX_SESSAO: sessao });
    assert.equal(semProva.status, 1);
    const semTrava = await f.ajudante("fd7-ignore", {
      BACKUP_DROPBOX_SESSAO: "c".repeat(64),
    });
    assert.equal(semTrava.status, 1);
    const travaTrocada = await f.ajudante("fd7-alvo", {
      BACKUP_DROPBOX_SESSAO: "c".repeat(64),
    });
    assert.equal(travaTrocada.status, 1);
    const nlink = await f.ajudante("nlink", { BACKUP_DROPBOX_SESSAO: "c".repeat(64) });
    assert.equal(nlink.status, 1);

    const troca = await f.ajudante("troca-inode", { BACKUP_DROPBOX_SESSAO: "d".repeat(64) });
    assert.equal(troca.status, 1);
    const alvoTrocado = await f.ajudante("troca-alvo", {
      BACKUP_DROPBOX_SESSAO: "e".repeat(64),
    });
    assert.equal(alvoTrocado.status, 1);

    const sleeper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    try {
      await new Promise((resolve) => sleeper.once("spawn", resolve));
      const provaOrfa = path.join(f.tmp, "prova-orfa");
      const provaOrfaFd = fs.openSync(
        provaOrfa,
        fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL,
        0o600,
      );
      const travaOrfaFd = fs.openSync(
        f.authorityLock,
        fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
      );
      execFileSync("flock", ["-n", "3"], {
        stdio: ["ignore", "ignore", "ignore", travaOrfaFd],
        env: { PATH: "/usr/bin:/bin" },
      });
      const config = JSON.parse(fs.readFileSync(f.configFile, "utf8"));
      fs.writeFileSync(
        provaOrfaFd,
        JSON.stringify({
          pid: sleeper.pid,
          sessao,
          configHash: sha(JSON.stringify(config)),
          proofFd: provaOrfaFd,
          lockFd: travaOrfaFd,
        }),
      );
      fs.unlinkSync(provaOrfa);
      const orfa = await f.conferir(
        { BACKUP_DROPBOX_SESSAO: sessao },
        { prova: provaOrfaFd, trava: travaOrfaFd },
      );
      assert.equal(orfa.status, 1);
      fs.closeSync(provaOrfaFd);
      fs.closeSync(travaOrfaFd);
    } finally {
      sleeper.kill("SIGKILL");
    }
  } finally {
    await f.fechar();
  }
});

test("o cliente nativo não expõe rota de upload e usa hosts fixos", () => {
  const fonte = fs.readFileSync(path.join(RAIZ, "scripts/servidor/dropbox-api.mjs"), "utf8");
  assert.ok(!fonte.includes("/2/files/upload"));
  assert.ok(!fonte.includes("content.dropboxapi.com/2/files/upload"));
  assert.ok(!/["']upload["']/.test(fonte));
  const rotas = [...fonte.matchAll(/\["(\/[^"]+)", "([^"]+)"\]/g)].map((achado) => [
    achado[1],
    achado[2],
  ]);
  assert.deepEqual(rotas, [
    ["/oauth2/token", "api.dropbox.com"],
    ["/2/users/get_current_account", "api.dropboxapi.com"],
    ["/2/files/get_metadata", "api.dropboxapi.com"],
    ["/2/files/list_folder", "api.dropboxapi.com"],
    ["/2/files/list_folder/continue", "api.dropboxapi.com"],
    ["/2/files/download", "content.dropboxapi.com"],
    ["/2/files/delete_v2", "api.dropboxapi.com"],
  ]);
  assert.ok(fonte.includes("hostname: rotas.get(rota)"));
  assert.ok(!fonte.includes("hostname: config"));
  assert.ok(fonte.includes("rejectUnauthorized: true"));
  assert.ok(fonte.includes('minVersion: "TLSv1.2"'));
});

async function esperarTraco(arquivo, linha) {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    if (linhas(arquivo).includes(linha)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Traço ${linha} não apareceu.`);
}
