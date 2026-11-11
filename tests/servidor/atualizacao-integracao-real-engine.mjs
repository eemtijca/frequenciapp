// Cliente Docker operacional finito: Unix local, IDs duráveis e fluxos supervisionados.
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { escrever, limitado } from "./atualizacao-integracao-adaptador.mjs";
import { gravar, AMBIENTE, conferirContexto } from "./atualizacao-integracao-real-fontes.mjs";
import {
  VERSAO_API,
  MAX,
  exigir,
  falha,
  hash,
  iguais,
  idDocker,
  imageId,
  conferirContainer,
  conferirImagem,
  receitaContainer,
  mesclarEnv,
  ambienteExato,
  volumeNome,
  volumeMount,
  labels,
  raizRoot,
} from "./atualizacao-integracao-real-contrato.mjs";
const fimStream = (s) =>
  new Promise((resolve, reject) => {
    s.once("end", resolve);
    s.once("error", reject);
  });
const FERRAMENTAS_EXIGIDAS = ["age", "age-keygen", "jq", "git", "curl"];
export const SONDA_FERRAMENTAS =
  "command -v age; command -v age-keygen; command -v jq; command -v git; command -v curl";
export function lerFerramentas(texto) {
  const nomes = new Map();
  for (const s of String(texto)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (!s.startsWith("/") || s.includes("\0") || s.split("/").includes("..")) throw falha("FERRAMENTAS");
    nomes.set(s.split("/").pop(), s);
  }
  if (!FERRAMENTAS_EXIGIDAS.every((b) => nomes.has(b))) throw falha("FERRAMENTAS");
  return FERRAMENTAS_EXIGIDAS.map((b) => nomes.get(b));
}
export async function desmultiplexar(stream, stdout, stderr) {
  let resto = Buffer.alloc(0),
    total = 0;
  for await (const parte of stream) {
    total += parte.length;
    exigir(total <= MAX, "STREAM_LIMITE");
    resto = Buffer.concat([resto, parte]);
    while (resto.length >= 8) {
      exigir(
        [1, 2].includes(resto[0]) && resto.subarray(1, 4).equals(Buffer.alloc(3)),
        "DOCKER_FRAME",
      );
      const n = resto.readUInt32BE(4);
      exigir(n <= 1024 * 1024, "STREAM_LIMITE");
      if (resto.length < 8 + n) break;
      if (n) await escrever(resto[0] === 1 ? stdout : stderr, resto.subarray(8, 8 + n));
      resto = resto.subarray(8 + n);
    }
  }
  exigir(resto.length === 0, "DOCKER_EOF");
  stdout.end();
  stderr.end();
}
export function processoFechado(
  bin,
  args,
  { env = AMBIENTE, cwd, spawnImpl = spawn, signal } = {},
) {
  exigir(!signal?.aborted, "CANCELADO");
  const p = spawnImpl(bin, args, { env, cwd, stdio: ["pipe", "pipe", "pipe"] }),
    out = [],
    err = [];
  let error = null,
    total = 0,
    excedido = false;
  const colher = (a) => (b) => {
    total += b.length;
    if (total > MAX) {
      excedido = true;
      p.kill("SIGTERM");
    } else a.push(Buffer.from(b));
  };
  p.stdout.on("data", colher(out));
  p.stderr.on("data", colher(err));
  p.on("error", (e) => {
    error = e.code ?? "SPAWN";
  });
  p.stdin.on("error", () => {});
  p.stdin.end();
  const abort = () => p.kill("SIGTERM");
  signal?.addEventListener("abort", abort, { once: true });
  const resultado = new Promise((resolve, reject) =>
    p.once("close", (codigo, sinal) => {
      signal?.removeEventListener("abort", abort);
      const r = {
        codigo,
        sinal,
        spawnError: error,
        close: true,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err),
      };
      if (signal?.aborted) return reject(falha("CANCELADO"));
      if (excedido) return reject(falha("STREAM_LIMITE"));
      resolve(r);
    }),
  );
  resultado.catch(() => {});
  return { filho: p, resultado };
}
export class LedgerReal {
  constructor(diretorio) {
    this.raiz = `${diretorio}/ledger`;
    fs.mkdirSync(this.raiz, { mode: 0o700 });
    this.seq = 0;
    this.registros = [];
  }
  async registrar(tipo, dados) {
    const r = { versao: 1, seq: ++this.seq, tipo, ...dados };
    gravar(`${this.raiz}/${String(this.seq).padStart(6, "0")}.json`, JSON.stringify(r) + "\n");
    this.registros.push(r);
    return r;
  }
  async raw(tipo, bytes) {
    exigir(Buffer.isBuffer(bytes) && bytes.length <= MAX, "RAW_LIMITE");
    const id = randomUUID();
    gravar(`${this.raiz}/raw-${id}`, bytes);
    await this.registrar("raw", {
      tipo,
      arquivo: `raw-${id}`,
      sha256: hash(bytes),
      bytes: bytes.length,
    });
  }
}
export class EngineDockerReal {
  #request;
  #spawn;
  #fechado = false;
  #owned = new Map();
  #images = new Map();
  #volumes = new Set();
  constructor(runtime, ledger, { request = http.request, spawnImpl = spawn } = {}) {
    this.runtime = runtime;
    this.m = runtime.manifesto;
    this.produto = runtime.produto;
    this.ledger = ledger;
    this.#request = request;
    this.#spawn = spawnImpl;
    this.ids = {};
    this.atual = "A";
    this.handles = new Set();
  }
  autorizar(signal) {
    exigir(!this.#fechado, "REVOGADO");
    exigir(!signal?.aborted, "CANCELADO");
  }
  revogar() {
    this.#fechado = true;
  }
  async #resposta(method, rota, body = null, { hijack = false, aceitos = [200] } = {}) {
    // Método/rota nunca são argumentos de pedidos: só os chamadores finitos abaixo.
    const bytes = body === null ? null : Buffer.from(JSON.stringify(body));
    const r = await limitado(
      new Promise((resolve, reject) => {
        const req = this.#request(
          {
            socketPath: "/var/run/docker.sock",
            path: `/${VERSAO_API}${rota}`,
            method,
            headers: {
              ...(bytes
                ? { "Content-Type": "application/json", "Content-Length": String(bytes.length) }
                : {}),
              ...(hijack ? { Connection: "Upgrade", Upgrade: "tcp" } : {}),
            },
          },
          (res) => {
            if (hijack && res.statusCode === 200)
              return resolve({ status: res.statusCode, headers: res.headers, stream: res });
            const a = [];
            let size = 0;
            res.on("data", (b) => {
              size += b.length;
              if (size > MAX) {
                res.destroy(falha("HTTP_LIMITE"));
              } else a.push(Buffer.from(b));
            });
            res.once("error", reject);
            res.once("end", () =>
              resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(a) }),
            );
          },
        );
        req.once("upgrade", (res, socket, head) => {
          if (head.length) socket.unshift(head);
          resolve({ status: res.statusCode, headers: res.headers, stream: socket });
        });
        req.once("error", reject);
        req.setTimeout?.(15000, () => req.destroy(falha("HTTP_PRAZO")));
        req.end(bytes);
      }),
    );
    // O middleware anuncia a versão máxima; não confundir com a versão da rota.
    await this.ledger.registrar("http", {
      method,
      rota,
      status: r.status,
      anunciada: r.headers?.["api-version"] ?? null,
    });
    if (r.bytes) await this.ledger.raw(rota, r.bytes);
    exigir((hijack ? [101, 200] : aceitos).includes(r.status), "HTTP_STATUS");
    return r;
  }
  async #json(method, rota, body = null, aceitos = [200]) {
    const r = await this.#resposta(method, rota, body, { aceitos });
    return r.bytes.length ? JSON.parse(r.bytes) : null;
  }
  async daemon() {
    const r = await this.#json("GET", "/info");
    exigir(typeof r.ID === "string" && r.ID.length > 0, "DAEMON");
    if (this.daemonId) exigir(r.ID === this.daemonId, "DAEMON");
    else {
      this.daemonId = r.ID;
      await this.ledger.registrar("daemon", { id: r.ID });
    }
    return r;
  }
  async imagemBase(papel) {
    exigir(["tools", "postgres"].includes(papel), "RECEITA");
    const pin = this.m.imagens[papel],
      r = await this.#json("GET", `/images/${pin.id}/json`);
    conferirImagem(r, pin, papel === "postgres");
    this.#images.set(pin.id, r);
    return r;
  }
  async imagem(rev) {
    exigir(["A", "B"].includes(rev), "FASE");
    const id = this.ids[`imagem${rev}`],
      esperado = this.#images.get(id);
    exigir(esperado, "OCI");
    const raw = await this.#json("GET", `/images/${id}/json`);
    exigir(
      raw.Id === id &&
        iguais(raw.Config, esperado.Config) &&
        raw.Config.Labels["org.opencontainers.image.revision"] ===
          this.produto.revisoes[rev].commit,
      "OCI",
    );
    return raw;
  }
  async #tag(id, tag) {
    this.autorizar();
    exigir(this.#images.has(id) && /^ensaio\/real-[a-f0-9]{32}:[a-z0-9-]+$/.test(tag), "OCI");
    const [repo, t] = tag.split(":");
    await this.#json(
      "POST",
      `/images/${id}/tag?repo=${encodeURIComponent(repo)}&tag=${encodeURIComponent(t)}`,
      null,
      [201],
    );
    const r = await this.#json("GET", `/images/${encodeURIComponent(tag)}/json`);
    exigir(r.Id === id, "OCI");
  }
  async build(rev, signal) {
    this.autorizar(signal);
    exigir(["A", "B"].includes(rev), "FASE");
    const root = `${this.m.diretorio}/contextos/${rev}`,
      r = this.produto.revisoes[rev];
    conferirContexto(root, this.produto.vertical.inventarios[rev], 1000);
    const base = `ensaio/real-${this.m.rodada}:base`;
    await this.#tag(this.m.imagens.tools.id, base);
    this.autorizar(signal);
    await this.ledger.registrar("build-intent", {
      rev,
      commit: r.commit,
      contextoSha256: r.contextoSha256,
    });
    this.autorizar(signal);
    const p = processoFechado(
      "/usr/bin/docker",
      [
        "build",
        "--network=none",
        "--pull=false",
        "--build-arg",
        `BASE=${base}`,
        "--build-arg",
        `COMMIT_SHA=${r.commit}`,
        "--tag",
        r.imagem,
        ".",
      ],
      { cwd: root, env: this.#cliEnv(), spawnImpl: this.#spawn, signal },
    );
    this.handles.add(p);
    let result;
    try {
      result = await limitado(p.resultado, 15000);
    } finally {
      this.handles.delete(p);
    }
    await this.ledger.raw("build-stdout", result.stdout);
    await this.ledger.raw("build-stderr", result.stderr);
    exigir(
      result.close && result.codigo === 0 && result.sinal === null && result.spawnError === null,
      "BUILD",
    );
    this.autorizar(signal);
    conferirContexto(root, this.produto.vertical.inventarios[rev], 1000);
    const im = await this.#json("GET", `/images/${encodeURIComponent(r.imagem)}/json`);
    exigir(
      imageId(im.Id) &&
        im.Config.Labels?.["org.opencontainers.image.revision"] === r.commit &&
        im.Config.User === "1000:1000" &&
        !Object.keys(im.Config.Volumes ?? {}).length &&
        !im.Config.OnBuild?.length,
      "OCI",
    );
    const tools = this.#images.get(this.m.imagens.tools.id);
    exigir(
      iguais(im.Config.Labels, {
        ...(tools.Config.Labels ?? {}),
        "org.opencontainers.image.revision": r.commit,
      }),
      "OCI",
    );
    exigir(
      iguais(im.Config.Entrypoint, ["/usr/local/bin/node"]) &&
        iguais(im.Config.Cmd, ["/app/tests/servidor/atualizacao-integracao-real-app.mjs"]) &&
        im.Config.WorkingDir === "/app",
      "OCI",
    );
    ambienteExato(im.Config.Env, tools.Config.Env);
    this.#images.set(im.Id, im);
    this.ids[`imagem${rev}`] = im.Id;
    await this.ledger.registrar("image-id", { rev, id: im.Id, commit: r.commit });
    if (rev === "A") await this.#tag(im.Id, `ensaio/real-${this.m.rodada}:proxy`);
    return im;
  }
  #cliEnv() {
    return {
      PATH: "/usr/bin:/bin",
      HOME: "/nonexistent",
      DOCKER_HOST: "unix:///var/run/docker.sock",
      DOCKER_CONFIG: `${this.m.diretorio}/docker-vazio`,
    };
  }
  async config(rev, quiet = false, servicos = false) {
    this.autorizar();
    const r = this.produto.revisoes[rev];
    exigir(r, "FASE");
    const args = [
      "compose",
      "--project-name",
      this.produto.projeto,
      "--project-directory",
      `${this.m.diretorio}/contextos/${rev}`,
      "-f",
      `${this.m.diretorio}/operacional/compose.yml`,
      "config",
      ...(quiet ? ["--quiet"] : servicos ? ["--services"] : ["--format", "json"]),
    ];
    const p = processoFechado("/usr/bin/docker", args, {
      env: { ...this.#cliEnv(), APP_IMAGEM: r.imagem },
      spawnImpl: this.#spawn,
    });
    this.handles.add(p);
    let x;
    try {
      x = await limitado(p.resultado);
    } finally {
      this.handles.delete(p);
    }
    await this.ledger.raw("compose-stdout", x.stdout);
    await this.ledger.raw("compose-stderr", x.stderr);
    exigir(x.codigo === 0 && x.sinal === null && x.spawnError === null && x.close, "COMPOSE");
    return x.stdout;
  }
  async criarVolumes() {
    for (const papel of ["dados", "socket", "http", "admin"]) {
      this.autorizar();
      const nome = volumeNome(this.m, papel),
        ls = { ...labels(this.m, "volume"), "frequenciapp.real.volume": papel };
      await this.ledger.registrar("volume-intent", { nome, papel });
      this.autorizar();
      const ausente = await this.#resposta("GET", `/volumes/${nome}`, null, { aceitos: [404] });
      exigir(
        /^no such volume:/i.test(JSON.parse(ausente.bytes).message ?? ""),
        "VOLUME_PREEXISTENTE",
      );
      this.autorizar();
      const r = await this.#json(
        "POST",
        "/volumes/create",
        { Name: nome, Driver: "local", DriverOpts: {}, Labels: ls },
        [201],
      );
      exigir(
        r.Name === nome &&
          r.Driver === "local" &&
          iguais(r.Labels, ls) &&
          !Object.keys(r.Options ?? {}).length,
        "VOLUME",
      );
      this.#volumes.add(nome);
      await this.ledger.registrar("volume-id", { nome, papel });
      const raw = await this.#json("GET", `/volumes/${nome}`);
      exigir(
        raw.Name === nome &&
          raw.Driver === "local" &&
          iguais(raw.Labels, ls) &&
          !Object.keys(raw.Options ?? {}).length,
        "VOLUME",
      );
    }
  }
  especificacao(papel, rev = "A", modo = "atualizar") {
    const m = this.m,
      p = this.produto,
      root = raizRoot(m),
      node = "/usr/local/bin/node",
      mounts = [],
      options = {};
    let image =
      papel === "db"
        ? m.imagens.postgres.id
        : ["root", "inicializador"].includes(papel)
          ? m.imagens.tools.id
          : this.ids[`imagem${rev}`];
    exigir(this.#images.has(image), "OCI");
    if (papel === "db") {
      mounts.push(
        volumeMount(m, "dados", "/var/lib/postgresql/data"),
        volumeMount(m, "socket", "/pgsocket"),
      );
      Object.assign(options, {
        entrypoint: ["docker-entrypoint.sh"],
        cmd: ["postgres", "-c", "listen_addresses=", "-c", "unix_socket_directories=/pgsocket"],
        cwd: "/",
        env: {
          POSTGRES_USER: p.usuario,
          POSTGRES_DB: p.banco,
          POSTGRES_HOST_AUTH_METHOD: "trust",
          PGDATA: "/var/lib/postgresql/data/pgdata",
          PGHOST: "/pgsocket",
        },
      });
    }
    if (papel === "app") {
      mounts.push(volumeMount(m, "socket", "/pgsocket", true), volumeMount(m, "http", "/http"));
      options.cmd = ["/app/tests/servidor/atualizacao-integracao-real-app.mjs"];
      options.env = {
        DATABASE_URL: "postgresql://frequencia@localhost/frequencia?host=/pgsocket",
        DATABASE_SCHEMA: "public",
      };
    }
    if (papel === "caddy") {
      image = this.ids.imagemA;
      mounts.push(volumeMount(m, "http", "/http"));
      options.cmd = ["/app/tests/servidor/atualizacao-integracao-real-proxy.mjs"];
    }
    if (["app", "caddy"].includes(papel))
      options.healthcheck = {
        Test: ["CMD", node, options.cmd[0], "--saude"],
        Interval: 1000000000,
        Timeout: 1000000000,
        Retries: 10,
      };
    if (papel === "leitor")
      Object.assign(options, { entrypoint: ["/bin/cat"], cmd: ["/app/docker/app/migrar.mjs"] });
    if (papel === "inicializador") {
      for (const [n, t] of [
        ["dados", "/dados"],
        ["socket", "/pgsocket"],
        ["http", "/http"],
      ])
        mounts.push(volumeMount(m, n, t));
      Object.assign(options, {
        entrypoint: [node],
        cmd: [
          "-e",
          "const f=require('node:fs');for(const p of ['/dados','/pgsocket','/http']){if(f.readdirSync(p).length)throw Error('VOLUME_NAO_VAZIO');f.chmodSync(p,0o1777)}",
        ],
        cwd: "/",
      });
    }
    if (papel === "root") {
      mounts.push(volumeMount(m, "admin", root), {
        Type: "bind",
        Source: `${m.diretorio}/bootstrap`,
        Target: "/bootstrap",
        ReadOnly: true,
      });
      Object.assign(options, {
        cmd: [
          "/bootstrap/fonte/tests/servidor/atualizacao-integracao-real-root.mjs",
          "--root",
          modo,
        ],
        cwd: root,
        env: { ...AMBIENTE },
      });
    }
    const im = this.#images.get(image);
    options.labels = { ...(im.Config.Labels ?? {}), ...labels(m, papel) };
    options.mounts = mounts;
    options.exposedPorts = im.Config.ExposedPorts ?? {};
    return receitaContainer(m, papel, image, im.Config.Env, options);
  }
  async criar(papel, rev = "A", modo = "atualizar", signal) {
    this.autorizar(signal);
    const spec = this.especificacao(papel, rev, modo),
      name = `real-${this.m.rodada}-${papel}-${randomUUID().replaceAll("-", "")}`;
    await this.ledger.registrar("create-intent", {
      papel,
      rev,
      name,
      specSha256: hash(JSON.stringify(spec)),
    });
    this.autorizar(signal);
    const r = await this.#json("POST", `/containers/create?name=${name}`, spec, [201]);
    exigir(idDocker(r?.Id), "ID");
    this.#owned.set(r.Id, { spec, papel, rev, terminal: false });
    await this.ledger.registrar("create-id", { id: r.Id, papel, rev });
    this.autorizar(signal);
    await this.inspect(r.Id, "created");
    return r.Id;
  }
  #own(id) {
    exigir(idDocker(id) && this.#owned.has(id), "OWN");
    return this.#owned.get(id);
  }
  async inspect(id, fase = "observado") {
    const o = this.#own(id),
      r = await this.#json("GET", `/containers/${id}/json`);
    conferirContainer(r, id, o.spec, fase);
    if (fase === "exited") o.terminal = true;
    return r;
  }
  async start(id, signal) {
    this.autorizar(signal);
    await this.inspect(id, "created");
    this.autorizar(signal);
    await this.#json("POST", `/containers/${id}/start`, null, [204]);
  }
  async wait(id) {
    this.#own(id);
    const r = await this.#json("POST", `/containers/${id}/wait?condition=not-running`);
    exigir(Number.isInteger(r.StatusCode) && !r.Error?.Message, "WAIT");
    const c = await this.inspect(id, "exited");
    exigir(c.State.ExitCode === r.StatusCode, "WAIT");
    return r.StatusCode;
  }
  async remover(id) {
    const o = this.#own(id);
    exigir(o.terminal, "NAO_TERMINAL");
    await this.inspect(id, "exited");
    await this.#json("DELETE", `/containers/${id}?v=false&force=false`, null, [204]);
    const r = await this.#resposta("GET", `/containers/${id}/json`, null, { aceitos: [404] });
    const err = JSON.parse(r.bytes);
    exigir(
      /^no such (container|object):/i.test(err.message ?? "") && err.message.includes(id),
      "AUSENCIA",
    );
    this.#owned.delete(id);
    await this.ledger.registrar("removed", { id });
  }
  async parar(id) {
    this.#own(id);
    await this.#json("POST", `/containers/${id}/stop?t=10`, null, [204]);
  }
  async stopAppA(signal) {
    const id = this.ids.A;
    const o = this.#own(id);
    exigir(o.papel === "app" && o.rev === "A", "OWN");
    this.autorizar(signal);
    await this.inspect(id, "running");
    this.autorizar(signal);
    await this.#json("POST", `/containers/${id}/stop?t=10`, null, [204]);
    await this.wait(id);
  }
  async #anexar(rota, body = null) {
    const r = await this.#resposta("POST", rota, body, { hijack: true });
    const stdout = new PassThrough({ highWaterMark: 16384 }),
      stderr = new PassThrough({ highWaterMark: 16384 }),
      socket = typeof r.stream.write === "function" ? r.stream : r.stream.socket;
    stdout.on("error", () => {});
    stderr.on("error", () => {});
    socket.on("error", () => {});
    const close = new Promise((resolve) => socket.once("close", () => resolve({ close: true })));
    close.catch(() => {});
    const pump = desmultiplexar(r.stream, stdout, stderr);
    pump.catch((e) => {
      stdout.destroy(e);
      stderr.destroy(e);
      socket.destroy();
    });
    const stdin = new Writable({
      write(b, _e, cb) {
        socket.write(b, cb);
      },
      final(cb) {
        socket.end(cb);
      },
    });
    stdin.on("error", () => {});
    return {
      stdin,
      stdout,
      stderr,
      pump,
      close,
      socket,
      cancelarObservador: async () => {
        socket.destroy();
        await limitado(close);
      },
    };
  }
  async attach(id) {
    this.#own(id);
    return this.#anexar(`/containers/${id}/attach?stream=1&stdin=1&stdout=1&stderr=1`);
  }
  async coletarLeitor(rev, signal) {
    const id = await this.criar("leitor", rev, "atualizar", signal),
      x = await this.attach(id),
      out = [],
      err = [];
    const colher = async (s, a) => {
      for await (const b of s) a.push(Buffer.from(b));
    };
    const tarefas = [colher(x.stdout, out), colher(x.stderr, err)];
    tarefas.forEach((t) => t.catch(() => {}));
    this.autorizar(signal);
    await this.start(id, signal);
    await limitado(Promise.all([x.pump, ...tarefas]));
    await limitado(x.close);
    const code = await this.wait(id);
    const bytes = Buffer.concat(out);
    exigir(
      code === 0 && Buffer.concat(err).length === 0 && hash(bytes) === this.produto.migradorSha256,
      "OCI_BYTES",
    );
    this.autorizar(signal);
    await this.remover(id);
    return bytes;
  }
  execReceita(nome) {
    const p = this.produto,
      psql = ["psql", "-X", "-U", p.usuario, "-d", p.banco, "-v", "ON_ERROR_STOP=1", "-tAc"];
    const map = {
      dump: {
        id: this.ids.db,
        cmd: [
          "pg_dump",
          "-U",
          p.usuario,
          "-d",
          p.banco,
          "-Fc",
          "--no-publications",
          "--no-subscriptions",
          "--strict-names",
          "--schema=public",
          "--lock-wait-timeout=30s",
        ],
        stdin: false,
      },
      "listar-dump": { id: this.ids.db, cmd: ["pg_restore", "-l"], stdin: true },
      "identidade-banco": {
        id: this.ids.db,
        cmd: [...psql, "SELECT current_database();"],
        stdin: false,
      },
      sentinela: { id: this.ids.db, cmd: [...psql, "select valor from marcador"], stdin: false },
      inicializar: {
        id: this.ids.db,
        cmd: [
          ...psql,
          `create table marcador(valor text not null); insert into marcador values ('${this.m.rodada}');`,
        ],
        stdin: false,
      },
      "criar-recuperacao": {
        id: this.ids.db,
        cmd: ["createdb", "-U", p.usuario, "recuperacao"],
        stdin: false,
      },
      recuperar: {
        id: this.ids.db,
        cmd: ["pg_restore", "--exit-on-error", "--no-owner", "-U", p.usuario, "-d", "recuperacao"],
        stdin: true,
      },
      "sentinela-recuperada": {
        id: this.ids.db,
        cmd: [
          "psql",
          "-X",
          "-U",
          p.usuario,
          "-d",
          "recuperacao",
          "-v",
          "ON_ERROR_STOP=1",
          "-tAc",
          "select valor from marcador",
        ],
        stdin: false,
      },
      "http-commit": {
        id: this.ids.caddy,
        cmd: [
          "/usr/local/bin/node",
          "/app/tests/servidor/atualizacao-integracao-real-proxy.mjs",
          "--observar",
        ],
        stdin: false,
      },
      "app-saude": {
        id: this.ids[this.atual],
        cmd: [
          "/usr/local/bin/node",
          "/app/tests/servidor/atualizacao-integracao-real-app.mjs",
          "--observar",
        ],
        stdin: false,
      },
      "proxy-config": {
        id: this.ids.caddy,
        cmd: ["/usr/bin/sha256sum", "/app/tests/servidor/atualizacao-integracao-real-proxy.mjs"],
        stdin: false,
      },
    };
    map.migracoes = {
      id: this.ids.db,
      cmd: [
        ...psql,
        "select id || ':' || checksum || ':' || applied_steps_count::text from _prisma_migrations where migration_name='0001' and finished_at is not null and rolled_back_at is null",
      ],
      stdin: false,
    };
    exigir(Object.hasOwn(map, nome), "RECEITA");
    return map[nome];
  }
  async criarExec(nome, signal) {
    const r = this.execReceita(nome);
    this.autorizar(signal);
    await this.inspect(r.id, "running");
    this.autorizar(signal);
    const o = this.#own(r.id),
      spec = {
        AttachStdin: r.stdin,
        AttachStdout: true,
        AttachStderr: true,
        DetachKeys: "",
        Tty: false,
        Cmd: r.cmd,
        Env: [],
        Privileged: false,
        User: o.spec.User,
        WorkingDir: o.spec.WorkingDir,
      };
    const x = await this.#json("POST", `/containers/${r.id}/exec`, spec, [201]);
    exigir(idDocker(x.Id), "EXEC_ID");
    await this.ledger.registrar("exec-id", {
      id: x.Id,
      recurso: r.id,
      nome,
      specSha256: hash(JSON.stringify(spec)),
    });
    this.autorizar(signal);
    return { id: x.Id, recurso: r.id, nome, spec };
  }
  async #execInspect(x, terminal) {
    const r = await this.#json("GET", `/exec/${x.id}/json`);
    exigir(
      r.ID === x.id &&
        r.ContainerID === x.recurso &&
        typeof r.Running === "boolean" &&
        r.ProcessConfig?.privileged === false &&
        iguais(r.ProcessConfig?.entrypoint, x.spec.Cmd[0]) &&
        iguais(r.ProcessConfig?.arguments, x.spec.Cmd.slice(1)) &&
        r.ProcessConfig?.user === x.spec.User,
      "EXEC_IDENTIDADE",
    );
    if (terminal)
      exigir(r.Running === false && Number.isInteger(r.ExitCode) && r.Pid === 0, "EXEC_TERMINAL");
    return r;
  }
  async iniciarExec(x, signal) {
    this.autorizar(signal);
    await this.#execInspect(x, false);
    this.autorizar(signal);
    const io = await this.#anexar(`/exec/${x.id}/start`, { Detach: false, Tty: false });
    const fim = (async () => {
      await io.pump;
      await limitado(io.close);
      let r;
      for (let i = 0; i < 60; i++) {
        r = await this.#execInspect(x, false);
        if (!r.Running) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await this.#execInspect(x, true);
      return { codigo: r.ExitCode, sinal: null };
    })();
    fim.catch(() => {});
    const h = {
      ...x,
      ...io,
      fim,
      confirmar: async () => {
        const f = await fim,
          r = await this.#execInspect(x, true);
        return { id: x.id, running: r.Running, codigo: f.codigo, sinal: f.sinal };
      },
    };
    this.handles.add(h);
    fim.finally(() => this.handles.delete(h)).catch(() => {});
    return h;
  }
  async executarPequeno(nome, entrada = null, signal) {
    const x = await this.criarExec(nome, signal),
      h = await this.iniciarExec(x, signal),
      out = [],
      err = [];
    const colher = async (s, a) => {
      for await (const b of s) a.push(Buffer.from(b));
    };
    const tarefas = [colher(h.stdout, out), colher(h.stderr, err)];
    tarefas.forEach((p) => p.catch(() => {}));
    h.stdin.end(entrada);
    const f = await h.fim;
    await Promise.all(tarefas);
    await h.confirmar();
    exigir(f.codigo === 0, "EXEC_CODIGO");
    return Buffer.concat(out);
  }
  async observarFerramentas() {
    const image = this.m.imagens.tools.id;
    exigir(this.#images.has(image), "OCI");
    const spec = {
      Image: image,
      User: "65534:65534",
      Entrypoint: ["/bin/sh"],
      Cmd: ["-c", SONDA_FERRAMENTAS],
      Tty: true,
      OpenStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        NetworkMode: "none",
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        CapAdd: [],
        SecurityOpt: ["no-new-privileges:true"],
        Privileged: false,
        AutoRemove: false,
        PortBindings: {},
        PublishAllPorts: false,
        Binds: [],
      },
    };
    const nome = `sonda-ferramentas-${randomUUID().replaceAll("-", "")}`;
    const criado = await this.#json("POST", `/containers/create?name=${nome}`, spec, [201]);
    const id = criado?.Id;
    exigir(idDocker(id), "ID");
    this.#owned.set(id, { spec, papel: "sonda", rev: "A", terminal: false });
    await this.#json("POST", `/containers/${id}/start`, null, [204]);
    const espera = await this.#json("POST", `/containers/${id}/wait?condition=not-running`, null, [200]);
    exigir(Number.isInteger(espera?.StatusCode), "FERRAMENTAS");
    const logs = await this.#resposta("GET", `/containers/${id}/logs?stdout=1&stderr=1`, null, {
      aceitos: [200],
    });
    this.#owned.get(id).terminal = true;
    await this.#json("DELETE", `/containers/${id}?v=false&force=false`, null, [204]);
    this.#owned.delete(id);
    if (espera.StatusCode !== 0) throw falha("FERRAMENTAS");
    return lerFerramentas(logs.bytes.toString());
  }
  async inicializar() {
    this.autorizar();
    await this.daemon();
    await this.imagemBase("tools");
    await this.imagemBase("postgres");
    await this.observarFerramentas();
    await this.criarVolumes();
    const init = await this.criar("inicializador"),
      io = await this.attach(init),
      out = [],
      err = [];
    const consumir = async (s, a) => {
      for await (const b of s) a.push(b);
    };
    const ps = [consumir(io.stdout, out), consumir(io.stderr, err)];
    ps.forEach((p) => p.catch(() => {}));
    await this.start(init);
    await io.pump;
    await Promise.all(ps);
    await io.close;
    exigir((await this.wait(init)) === 0, "VOLUME_INIT");
    await this.remover(init);
    this.ids.db = await this.criar("db");
    await this.start(this.ids.db);
    // Readiness finita: só conexão recusada é transitória; SQL e identidade não.
    for (let i = 0; i < 60; i++) {
      await this.inspect(this.ids.db, "running");
      const x = await this.criarExec("identidade-banco"),
        h = await this.iniciarExec(x),
        o = [],
        e = [];
      const read = async (s, a) => {
        for await (const b of s) a.push(b);
      };
      const ps = [read(h.stdout, o), read(h.stderr, e)];
      h.stdin.end();
      const f = await h.fim;
      await Promise.all(ps);
      await h.confirmar();
      if (f.codigo === 0) {
        exigir(Buffer.concat(o).toString() === "frequencia\n", "PG_IDENTIDADE");
        break;
      }
      exigir(
        i < 59 &&
          /connection.*failed|No such file|Connection refused/i.test(Buffer.concat(e).toString()),
        "PG_READINESS",
      );
      await new Promise((r) => setTimeout(r, 100));
    }
    await this.executarPequeno("inicializar");
    await this.build("A");
    this.ids.A = await this.criar("app", "A");
    await this.start(this.ids.A);
    this.ids.caddy = await this.criar("caddy", "A");
    await this.start(this.ids.caddy);
    return this.ids;
  }
  async saude(rev, signal) {
    const fim = Date.now() + 10000;
    while (true) {
      this.autorizar(signal);
      const c = await this.inspect(this.ids[rev], "running");
      if (c.State.Health?.Status === "healthy") {
        const b = await this.executarPequeno("app-saude", null, signal);
        exigir(b.toString() === this.produto.revisoes[rev].commit + "\n", "HTTP_COMMIT");
        return;
      }
      exigir(c.State.Health?.Status !== "unhealthy" && Date.now() < fim, "SAUDE");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async subirB(signal) {
    this.autorizar(signal);
    await this.inspect(this.ids.db, "running");
    await this.inspect(this.ids.caddy, "running");
    await this.stopAppA(signal);
    this.autorizar(signal);
    this.ids.B = await this.criar("app", "B", "atualizar", signal);
    await this.start(this.ids.B, signal);
    this.atual = "B";
    await this.saude("B", signal);
    return this.ids.B;
  }
  async close() {
    this.revogar();
    exigir(this.handles.size === 0, "HANDLES_ATIVOS");
  }
}
