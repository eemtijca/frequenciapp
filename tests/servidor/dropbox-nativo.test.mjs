// Exercita o cliente Dropbox nativo contra um servidor TLS local com token falso.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const RAIZ = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

async function fixture(quantidade = 6) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dropbox-tls-"));
  const dir = (nome) => {
    const d = path.join(tmp, nome);
    fs.mkdirSync(d, { mode: 0o700 });
    return d;
  };
  const catalogo = dir("catalogo"),
    diarios = dir("diarios"),
    remoto = dir("remoto");
  const gravar = (arquivo, bytes) => fs.writeFileSync(arquivo, bytes, { mode: 0o600 });
  const configFile = path.join(tmp, "adocao.json"),
    tokenFile = path.join(tmp, "oauth.json"),
    authorityLock = path.join(tmp, "autoridade.lock"),
    lock = path.join(tmp, "alvo.lock"),
    rclone = path.join(tmp, "rclone.conf"),
    certPath = path.join(tmp, "cert.pem");
  gravar(authorityLock, "");
  gravar(lock, "");
  const keyPath = path.join(tmp, "key.pem");
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
      keyPath,
      "-out",
      certPath,
      "-subj",
      "/CN=api.dropbox.com",
      "-addext",
      "subjectAltName=DNS:api.dropbox.com,DNS:api.dropboxapi.com,DNS:content.dropboxapi.com",
    ],
    { stdio: "ignore" },
  );
  fs.chmodSync(keyPath, 0o600);
  fs.chmodSync(certPath, 0o600);
  gravar(
    tokenFile,
    JSON.stringify({
      clientId: "app-sintetico",
      clientSecret: "segredo-sintetico",
      refreshToken: "refresh-sintetico",
    }),
  );
  gravar(
    rclone,
    '[falso]\ntype = dropbox\nroot_namespace = 42\ntoken = {"access_token":"sintetico"}\n',
  );
  const config = {
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
    targetLock: lock,
    limiteBytes: 1024 * 1024,
    timeoutMs: 5000,
  };
  gravar(configFile, JSON.stringify(config));

  const objects = new Map(),
    receipts = [],
    events = [];
  let revision = 100000000;
  const meta = (nome) => {
    const o = objects.get(nome);
    return {
      ".tag": "file",
      name: nome,
      id: o.id,
      rev: o.rev,
      path_lower: `/copias/${nome.toLowerCase()}`,
      size: fs.statSync(path.join(remoto, nome)).size,
    };
  };
  function adicionar(numero, extra = {}) {
    const base = `frequenciapp-20200101T000000Z-${numero.toString(16).padStart(8, "0")}`;
    const nome = `${base}.dump.gpg`,
      bytes = Buffer.from(`FALSO-${numero}`),
      side = Buffer.from(`${sha(bytes)}  ${nome}\n`);
    const r = {
      versao: 1,
      base,
      em: new Date(Date.UTC(2020, 0, 1) + numero * 86400000).toISOString(),
      criptografia: "gpg",
      destinatario: "sintetico",
      remoto: config.destino,
      escopo: { tipo: "schema", alvo: "sintetico", banco: "escola", schema: "public" },
      etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
      artefatos: [
        { nome, sha256: sha(bytes) },
        { nome: `${nome}.sha256`, sha256: sha(side) },
      ],
      ...extra,
    };
    const recibo = Buffer.from(JSON.stringify(r) + "\n");
    receipts.push({ r, bytes: recibo });
    gravar(path.join(catalogo, `${base}.confirmado.json`), recibo);
    for (const [n, b] of [
      [nome, bytes],
      [`${nome}.sha256`, side],
      [`${base}.confirmado.json`, recibo],
    ]) {
      gravar(path.join(remoto, n), b);
      objects.set(n, { id: `id:${randomUUID()}`, rev: (++revision).toString(16).padStart(9, "0") });
    }
    return r;
  }
  for (let i = 0; i < quantidade; i++) adicionar(i);

  const state = { tokenError: false, hook: null };
  const server = https.createServer(
    { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
    async (req, res) => {
      let body = "";
      for await (const c of req) {
        body += c;
        assert.ok(body.length < 2 * 1024 * 1024);
      }
      const arg = req.headers["dropbox-api-arg"]
        ? JSON.parse(req.headers["dropbox-api-arg"])
        : body && body[0] === "{"
          ? JSON.parse(body)
          : null;
      events.push({ route: req.url, arg });
      const json = (dados, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(dados));
      };
      if (req.url === "/oauth2/token") {
        assert.equal(new URLSearchParams(body).get("refresh_token"), "refresh-sintetico");
        return json(
          state.tokenError
            ? { error: "invalid_grant" }
            : { access_token: "access-sintetico", token_type: "bearer", expires_in: 3600 },
          state.tokenError ? 400 : 200,
        );
      }
      assert.equal(req.headers.authorization, "Bearer access-sintetico");
      if (state.hook && (await state.hook({ req, res, arg, json, meta }))) return;
      if (req.url === "/2/users/get_current_account")
        return json({
          account_id: config.accountId,
          root_info: { root_namespace_id: "42", home_namespace_id: "42" },
        });
      assert.deepEqual(JSON.parse(req.headers["dropbox-api-path-root"]), {
        ".tag": "namespace_id",
        namespace_id: "42",
      });
      if (req.url === "/2/files/get_metadata")
        return json({
          ".tag": "folder",
          id: config.folderId,
          name: "copias",
          path_lower: config.folderPath,
        });
      if (req.url === "/2/files/list_folder") {
        assert.equal(arg.path, config.folderId);
        return json({
          entries: [...objects.keys()].map(meta),
          cursor: "complete",
          has_more: false,
        });
      }
      if (req.url === "/2/files/download") {
        const n = [...objects.keys()].find(
          (nome) => objects.get(nome).id === arg.path && objects.get(nome).rev === arg.rev,
        );
        if (!n) return json({ error: "not_found" }, 409);
        res.writeHead(200, { "Dropbox-API-Result": JSON.stringify(meta(n)) });
        return fs.createReadStream(path.join(remoto, n)).pipe(res);
      }
      if (req.url === "/2/files/delete_v2") {
        const n = [...objects.keys()].find((nome) => objects.get(nome).id === arg.path);
        if (!n || objects.get(n).rev !== arg.parent_rev) return json({ error: "conflict" }, 409);
        const metadata = meta(n);
        fs.unlinkSync(path.join(remoto, n));
        objects.delete(n);
        return json({ metadata });
      }
      json({ error: "unknown_route" }, 400);
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const preload = path.join(tmp, "transporte-teste.mjs");
  gravar(
    preload,
    `import https from 'node:https'; import fs from 'node:fs'; import assert from 'node:assert/strict';
const original = https.request;
https.request = function(options, callback) {
  assert.ok(['api.dropboxapi.com','content.dropboxapi.com','api.dropbox.com'].includes(options.hostname));
  assert.equal(options.protocol, 'https:');
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.minVersion, 'TLSv1.2');
  assert.equal(options.port, 443);
  return original.call(this, {...options, hostname:'127.0.0.1', port:${server.address().port}, servername:options.hostname, ca:fs.readFileSync(${JSON.stringify(certPath)})}, callback);
};
`,
  );

  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    TMPDIR: tmp,
    BACKUP_MODO: "compose",
    BACKUP_CATALOGO_PERSISTENTE: "true",
    SERVIDOR_ALVO_CHAVE: "sintetico",
    BACKUP_BANCO_VERIFICADO: "escola",
    DATABASE_SCHEMA: "public",
    BACKUP_REMOTO: config.destino,
    BACKUP_DROPBOX_CONFIG: configFile,
    BACKUP_RETER_MINIMO: "5",
    BACKUP_RETER_DIAS: "1",
    RCLONE_CONFIG: rclone,
    SERVIDOR_LOCK_HERDADO: lock,
    NODE_OPTIONS: `--import=${preload}`,
  };
  assert.ok(!Object.keys(env).some((chave) => chave.startsWith("DROPBOX_")));

  async function executar(extra = {}) {
    const fd = fs.openSync(extra.SERVIDOR_LOCK_HERDADO || lock, "r");
    const p = spawn(
      process.execPath,
      [
        path.join(RAIZ, "scripts/servidor/backup-recibos.mjs"),
        "expurgar-remoto",
        catalogo,
        diarios,
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
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (c) => (stdout += c));
    p.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => p.kill("SIGKILL"), 30000);
    return new Promise((resolve, reject) => {
      p.on("error", reject);
      p.on("close", (status, signal) => {
        clearTimeout(timer);
        resolve({ status, signal, stdout, stderr });
      });
    });
  }
  return {
    tmp,
    catalogo,
    diarios,
    remoto,
    lock,
    rclone,
    configFile,
    config,
    state,
    objects,
    receipts,
    events,
    preload,
    env,
    adicionar,
    meta,
    gravar,
    executar,
    async fechar() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

const deletes = (f) => f.events.filter((e) => e.route === "/2/files/delete_v2");
const alterarConfig = (f, dados) => {
  Object.assign(f.config, dados);
  f.gravar(f.configFile, JSON.stringify(f.config));
};

test("a CLI adotada expurga o conjunto mais antigo por TLS local com token falso", async () => {
  const f = await fixture();
  try {
    const antes = new Map(
      [...f.objects.keys()].map((n) => [n, sha(fs.readFileSync(path.join(f.remoto, n)))]),
    );
    const r = await f.executar();
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.objects.size, 15);
    assert.ok(!f.objects.has(f.receipts[0].r.artefatos[0].nome));
    for (const [n, digest] of antes)
      if (f.objects.has(n)) assert.equal(sha(fs.readFileSync(path.join(f.remoto, n))), digest);
    assert.equal(deletes(f).length, 3);
    assert.ok(
      deletes(f).every(
        (e) => e.arg.path.startsWith("id:") && /^[a-f0-9]{9,}$/.test(e.arg.parent_rev),
      ),
    );
    const jornais = fs.readdirSync(path.join(f.diarios, "dropbox"));
    assert.equal(jornais.length, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.diarios, "dropbox", jornais[0]))).valor.removidos,
      3,
    );
    assert.equal(fs.readdirSync(f.catalogo).length, 6);
  } finally {
    await f.fechar();
  }
});

test("token recusado não autoriza listagem, download nem exclusão", async () => {
  const f = await fixture();
  try {
    f.state.tokenError = true;
    const r = await f.executar();
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.equal(deletes(f).length, 0);
    assert.equal(f.events.filter((e) => e.route !== "/oauth2/token").length, 0);
  } finally {
    await f.fechar();
  }
});

test("limite de recepção aborta o download antes de qualquer exclusão", async () => {
  const f = await fixture();
  try {
    alterarConfig(f, { limiteBytes: 5 });
    const r = await f.executar();
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.equal(deletes(f).length, 0);
    assert.equal(f.objects.size, 18);
  } finally {
    await f.fechar();
  }
});

test("timeout absoluto encerra resposta JSON pendente sem apagar", async () => {
  const f = await fixture();
  try {
    alterarConfig(f, { timeoutMs: 1000 });
    let fechou = false;
    f.state.hook = ({ req, res }) => {
      if (req.url !== "/2/users/get_current_account") return false;
      res.on("close", () => {
        fechou = true;
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
      return true;
    };
    const inicio = Date.now();
    const r = await f.executar();
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.ok(fechou);
    assert.ok(Date.now() - inicio < 15000);
    assert.equal(deletes(f).length, 0);
  } finally {
    await f.fechar();
  }
});

test("delete_v2 recusa troca de revisão e a retomada não insiste", async () => {
  const f = await fixture();
  try {
    const nome = f.receipts[0].r.artefatos[0].nome;
    f.state.hook = ({ req }) => {
      if (req.url !== "/2/files/delete_v2") return false;
      f.objects.get(nome).rev = "fffffffff";
      return false;
    };
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
    assert.ok(f.objects.has(nome));
    assert.equal(f.objects.size, 18);
    f.state.hook = null;
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
  } finally {
    await f.fechar();
  }
});

test("resposta de exclusão perdida mantém a intenção e bloqueia a retomada", async () => {
  const f = await fixture();
  try {
    f.state.hook = ({ req, res, arg }) => {
      if (req.url !== "/2/files/delete_v2") return false;
      const nome = [...f.objects.keys()].find((n) => f.objects.get(n).id === arg.path);
      fs.unlinkSync(path.join(f.remoto, nome));
      f.objects.delete(nome);
      res.destroy();
      return true;
    };
    assert.equal((await f.executar()).status, 1);
    assert.equal(f.objects.size, 17);
    const jornais = fs.readdirSync(path.join(f.diarios, "dropbox"));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.diarios, "dropbox", jornais[0]))).valor.pendente,
      0,
    );
    f.state.hook = null;
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
  } finally {
    await f.fechar();
  }
});

test("paginação preserva objeto sem recibo e verifica o conjunto inteiro", async () => {
  const f = await fixture();
  try {
    const extra = "arquivo-alheio.txt";
    f.gravar(path.join(f.remoto, extra), "preservar");
    f.objects.set(extra, { id: "id:alheio", rev: "abcdef123" });
    f.state.hook = ({ req, arg, json, meta }) => {
      if (req.url === "/2/files/list_folder") {
        const entries = [...f.objects.keys()].map(meta);
        json({ entries: entries.slice(0, 10), has_more: true, cursor: "pagina2" });
        return true;
      }
      if (req.url === "/2/files/list_folder/continue") {
        assert.equal(arg.cursor, "pagina2");
        json({
          entries: [...f.objects.keys()].map(meta).slice(10),
          has_more: false,
          cursor: "final",
        });
        return true;
      }
      return false;
    };
    assert.equal((await f.executar()).status, 0);
    assert.ok(f.objects.has(extra));
    assert.equal(deletes(f).length, 3);
    assert.ok(f.events.some((e) => e.route.endsWith("/continue")));
  } finally {
    await f.fechar();
  }
});

test("destino ou pasta divergente bloqueia antes de qualquer pedido de rede", async () => {
  for (const alteracao of [{ destino: "falso:vizinho" }, { folderPath: "/outra" }]) {
    const f = await fixture();
    try {
      alterarConfig(f, alteracao);
      const r = await f.executar();
      assert.equal(r.status, 1);
      assert.equal(r.signal, null);
      assert.equal(f.events.length, 0);
    } finally {
      await f.fechar();
    }
  }
});

test("upload anterior pendente bloqueia a retenção antes da rede", async () => {
  const f = await fixture();
  try {
    f.gravar(
      `${f.config.authorityLock}.upload.json`,
      JSON.stringify({ versao: 1, sessao: "sintetica", configHash: "0".repeat(64) }),
    );
    const r = await f.executar();
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.equal(f.events.length, 0);
  } finally {
    await f.fechar();
  }
});

test("config, token ou mapeamento rclone inseguros bloqueiam antes da rede", async () => {
  const f = await fixture();
  try {
    const original = JSON.stringify(f.config),
      mapping = fs.readFileSync(f.rclone);
    for (const caso of ["config", "token", "mapping", "sha"]) {
      f.gravar(f.configFile, original);
      f.gravar(f.rclone, mapping);
      fs.chmodSync(f.configFile, 0o600);
      fs.chmodSync(f.config.tokenFile, 0o600);
      if (caso === "config") fs.chmodSync(f.configFile, 0o644);
      if (caso === "token") fs.chmodSync(f.config.tokenFile, 0o644);
      if (caso === "mapping") f.gravar(f.rclone, "[falso]\ntype = crypt\nremote = outro:\n");
      if (caso === "sha") alterarConfig(f, { rcloneConfigSha256: "0".repeat(64) });
      f.config = JSON.parse(original);
      const r = await f.executar();
      assert.equal(r.status, 1, caso);
      assert.equal(r.signal, null, caso);
      assert.equal(f.events.length, 0, caso);
    }
    assert.equal(f.objects.size, 18);
  } finally {
    await f.fechar();
  }
});
