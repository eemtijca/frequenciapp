// Servidor HTTPS Dropbox sintético, permitido apenas em rede isolada de loopback.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

export const sha = (b) => createHash("sha256").update(b).digest("hex");
export async function fixtureDropbox(quantidade = 32, alvo = "sintetico") {
  assert.ok(
    Object.values(os.networkInterfaces())
      .flat()
      .every((i) => i.internal),
    "O servidor falso exige --network none",
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dropbox-sintetico-"));
  const dir = (n) => {
    const d = path.join(tmp, n);
    fs.mkdirSync(d, { mode: 0o700 });
    return d;
  };
  const catalogo = dir("catalogo"),
    diarios = dir("diarios"),
    remoto = dir("remoto");
  const gravar = (p, b) => fs.writeFileSync(p, b, { mode: 0o600 });
  const configFile = path.join(tmp, "adocao.json"),
    tokenFile = path.join(tmp, "oauth.json"),
    lock = path.join(tmp, "alvo.lock");
  gravar(lock, "");
  gravar(path.join(tmp, "autoridade.lock"), "");
  gravar(
    tokenFile,
    JSON.stringify({
      clientId: "app-sintetico",
      clientSecret: "segredo-sintetico",
      refreshToken: "refresh-sintetico",
    }),
  );
  const rclone = path.join(tmp, "rclone.conf");
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
    alvo,
    banco: "escola",
    schema: "public",
    tokenFile,
    rcloneConfig: rclone,
    rcloneConfigSha256: sha(fs.readFileSync(rclone)),
    authorityLock: path.join(tmp, "autoridade.lock"),
    targetLock: lock,
    limiteBytes: 1024 * 1024,
    timeoutMs: 5000,
  };
  gravar(configFile, JSON.stringify(config));
  const objects = new Map(),
    receipts = [],
    events = [];
  let revision = 100000000;
  const meta = (name) => {
    const o = objects.get(name);
    return {
      ".tag": "file",
      name,
      id: o.id,
      rev: o.rev,
      path_lower: `/copias/${name.toLowerCase()}`,
      size: fs.statSync(path.join(remoto, name)).size,
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
      escopo: { tipo: "schema", alvo, banco: "escola", schema: "public" },
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
      path.join(tmp, "key.pem"),
      "-out",
      path.join(tmp, "cert.pem"),
      "-subj",
      "/CN=api.dropboxapi.com",
      "-addext",
      "subjectAltName=DNS:api.dropboxapi.com,DNS:content.dropboxapi.com,DNS:api.dropbox.com",
    ],
    { stdio: "ignore" },
  );
  const state = { tokenError: false, mode: null, hook: null };
  const server = https.createServer(
    {
      key: fs.readFileSync(path.join(tmp, "key.pem")),
      cert: fs.readFileSync(path.join(tmp, "cert.pem")),
    },
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
      const json = (data, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(data));
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
          (n) => objects.get(n).id === arg.path && objects.get(n).rev === arg.rev,
        );
        if (!n) return json({ error: "not_found" }, 409);
        res.writeHead(200, { "Dropbox-API-Result": JSON.stringify(meta(n)) });
        return fs.createReadStream(path.join(remoto, n)).pipe(res);
      }
      if (req.url === "/2/files/delete_v2") {
        const n = [...objects.keys()].find((n) => objects.get(n).id === arg.path);
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
    `// Redireciona exclusivamente o transporte deste processo de teste para TLS local.\nimport https from 'node:https'; import fs from 'node:fs'; import assert from 'node:assert/strict';\nconst original = https.request;\nhttps.request = function(options, callback) {\n assert.ok(['api.dropboxapi.com','content.dropboxapi.com','api.dropbox.com'].includes(options.hostname));\n assert.equal(options.protocol, 'https:'); assert.equal(options.rejectUnauthorized, true); assert.equal(options.minVersion, 'TLSv1.2'); assert.equal(options.port, 443);\n return original.call(this, {...options, hostname:'127.0.0.1', port:${server.address().port}, servername:options.hostname, ca:fs.readFileSync(${JSON.stringify(path.join(tmp, "cert.pem"))})}, callback);\n};\n`,
  );
  const env = {
    PATH: process.env.PATH,
    HOME: tmp,
    TMPDIR: tmp,
    BACKUP_MODO: "compose",
    BACKUP_CATALOGO_PERSISTENTE: "true",
    SERVIDOR_ALVO_CHAVE: alvo,
    BACKUP_BANCO_VERIFICADO: "escola",
    DATABASE_SCHEMA: "public",
    BACKUP_REMOTO: config.destino,
    BACKUP_DROPBOX_CONFIG: configFile,
    BACKUP_RETER_MINIMO: "30",
    BACKUP_RETER_DIAS: "1",
    RCLONE_CONFIG: rclone,
    SERVIDOR_LOCK_HERDADO: lock,
  };
  async function executar(
    extra = {},
    script = "scripts/servidor/backup-recibos.mjs",
    args = [],
    opcoes = {},
  ) {
    const fd = fs.openSync(extra.SERVIDOR_LOCK_HERDADO || lock, "a+");
    const p = spawn(
      process.execPath,
      [
        "--import",
        preload,
        ...args,
        script,
        "expurgar-remoto",
        opcoes.catalogo ?? catalogo,
        opcoes.diarios ?? diarios,
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
      await new Promise((r) => server.close(r));
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}
