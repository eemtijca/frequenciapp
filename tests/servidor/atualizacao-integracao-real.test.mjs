// Testa o backend real com daemon/CLI falsos declarados e streams locais reais.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { EventEmitter } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { PassThrough, Readable, Writable, Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { CoordenadorReal, executarReal, argumentosReal } from "./atualizacao-integracao-real.mjs";
import {
  EngineDockerReal,
  desmultiplexar,
  processoFechado,
  lerFerramentas,
} from "./atualizacao-integracao-real-engine.mjs";
import {
  exigir,
  hash,
  ambienteExato,
  conferirContainer,
  conferirImagem,
  receitaContainer,
  validarPedidoReal,
  vinculo,
  validarProva,
  arquivoProtegido,
} from "./atualizacao-integracao-real-contrato.mjs";
import { pedidoRoot, receberBinding } from "./atualizacao-integracao-real-root.mjs";
import {
  conferirContexto,
  inventarioReal,
  fechamentoPg,
} from "./atualizacao-integracao-real-fontes.mjs";
import { respostaCommit, consultarUnix } from "./atualizacao-integracao-real-app.mjs";
import { resolverSchema } from "../../src/infra/schema-postgres.mjs";
import { Cliente, atender, quadros, LIMITES } from "./atualizacao-integracao-adaptador.mjs";
const ROUND = "a".repeat(32),
  CID = "c".repeat(64),
  DB = "d".repeat(64),
  EXEC = "e".repeat(64),
  IMAGE = "sha256:" + "b".repeat(64),
  H = "1".repeat(64),
  A = "2".repeat(40),
  B = "3".repeat(40),
  DUMP = Buffer.from([0, 255, 1, 10, 0, 13]);
const runtime = {
  manifesto: {
    versao: 1,
    rodada: ROUND,
    diretorio: `/scratch/real-${ROUND}`,
    imagens: { tools: { id: IMAGE }, postgres: { id: IMAGE } },
  },
  produto: {
    versao: 1,
    rodada: `coeso-${ROUND}`,
    projeto: `real-${ROUND}`,
    operacionalSha256: H,
    migradorSha256: hash(Buffer.from("migrador original como dados")),
    banco: "frequencia",
    usuario: "frequencia",
    schema: "public",
    revisoes: {
      A: { commit: A, contextoSha256: H, imagem: `ensaio/real-${ROUND}:main-${A.slice(0, 12)}` },
      B: { commit: B, contextoSha256: H, imagem: `ensaio/real-${ROUND}:main-${B.slice(0, 12)}` },
    },
    vertical: { inventarios: {} },
  },
  inputsSha256: H,
  bootstrapSha256: H,
};
const binding = vinculo(runtime.manifesto, CID, H, H);
const arquivo = "frequenciapp-20260101T000000Z-aabbccdd.dump.age";
const prova = {
  versao: 1,
  vinculo: binding,
  operacao: "12345678-1234-1234-1234-123456789abc",
  alvo: H,
  commit: B,
  contextoSha256: H,
  pinSha256: H,
  cifra: { nome: arquivo, sha256: H, bytes: 32, formato: "age-encryption.org/v1" },
  arquivos: [
    { nome: arquivo, sha256: H, bytes: 32 },
    { nome: arquivo + ".sha256", sha256: H, bytes: 64 },
    { nome: "frequenciapp-20260101T000000Z-aabbccdd.confirmado.json", sha256: H, bytes: 64 },
    { nome: "ponteiro.json", sha256: H, bytes: 64 },
  ],
  lock: { dev: "172", ino: "346" },
};
const pedido = (n, rev = "B") =>
  pedidoRoot(
    runtime,
    binding,
    n,
    rev,
    ["construir", "subir", "criar-recuperacao", "recuperar", "sentinela-recuperada"].includes(n)
      ? prova
      : null,
  );
const coletor = () => {
  const bytes = [];
  return {
    bytes,
    stream: new Writable({
      write(b, _e, cb) {
        bytes.push(Buffer.from(b));
        setImmediate(cb);
      },
    }),
  };
};
const ler = async (s) => {
  const a = [];
  for await (const b of s) a.push(Buffer.from(b));
  return Buffer.concat(a);
};
const ledger = () => ({
  registros: [],
  raws: [],
  async registrar(tipo, dados) {
    this.registros.push({ tipo, ...structuredClone(dados) });
  },
  async raw(tipo, bytes) {
    this.raws.push({ tipo, bytes: Buffer.from(bytes) });
  },
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function specLeitor() {
  return receitaContainer(
    runtime.manifesto,
    "leitor",
    IMAGE,
    ["PATH=/usr/local/bin:/usr/bin:/bin"],
    { entrypoint: ["/bin/cat"], cmd: ["/app/docker/app/migrar.mjs"] },
  );
}
// Resposta independente: não é construída a partir da receita observada.
function rawLeitor() {
  return {
    Id: CID,
    Image: IMAGE,
    Config: {
      User: "65534:65534",
      Env: ["PATH=/usr/local/bin:/usr/bin:/bin"],
      Labels: {
        "frequenciapp.real.rodada": ROUND,
        "com.docker.compose.project": `real-${ROUND}`,
        "com.docker.compose.service": "leitor",
      },
      Entrypoint: ["/bin/cat"],
      Cmd: ["/app/docker/app/migrar.mjs"],
      WorkingDir: "/app",
      Healthcheck: { Test: ["NONE"] },
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      ExposedPorts: {},
    },
    HostConfig: {
      NetworkMode: "none",
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Privileged: false,
      AutoRemove: false,
      Init: true,
      PidsLimit: 256,
      Memory: 1073741824,
      NanoCpus: 2000000000,
      RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
      IpcMode: "private",
      PidMode: "",
      PublishAllPorts: false,
      Tmpfs: { "/tmp": "rw,nosuid,nodev,exec,size=128m,mode=1777" },
      LogConfig: { Type: "json-file", Config: { "max-size": "8m", "max-file": "2" } },
      CapAdd: [],
      PortBindings: {},
      Binds: [],
      GroupAdd: [],
      Devices: [],
      DeviceRequests: [],
      VolumesFrom: [],
      Links: [],
    },
    Mounts: [],
    State: {
      Running: false,
      Status: "created",
      Pid: 0,
      ExitCode: 0,
      OOMKilled: false,
      Dead: false,
      Error: "",
    },
  };
}
class EngineDubleDeclarado {
  constructor() {
    this.ids = { A: "4".repeat(64), B: "5".repeat(64), db: DB, caddy: "6".repeat(64) };
    this.atual = "A";
    this.eventos = [];
    this.iniciados = [];
  }
  async criarExec(nome) {
    const id = nome === "dump" ? "7".repeat(64) : nome === "listar-dump" ? "8".repeat(64) : EXEC;
    this.eventos.push(["exec-create", nome, id]);
    return { id, nome };
  }
  async iniciarExec(x) {
    this.eventos.push(["exec-start", x.id]);
    this.iniciados.push(x.nome);
    const a = [],
      stdout = new PassThrough(),
      stderr = new PassThrough();
    let resolver;
    const fim = new Promise((r) => {
      resolver = r;
    });
    const stdin = new Writable({
      write(b, _e, cb) {
        a.push(Buffer.from(b));
        cb();
      },
      final: (cb) => {
        if (x.nome === "listar-dump") assert.deepEqual(Buffer.concat(a), DUMP);
        stdout.end(
          x.nome === "dump"
            ? DUMP
            : x.nome === "http-commit"
              ? Buffer.from(B + "\n")
              : Buffer.from("listagem\n"),
        );
        stderr.end(Buffer.from([255, 0]));
        resolver({ codigo: 0, sinal: null });
        cb();
      },
    });
    return {
      id: x.id,
      stdin,
      stdout,
      stderr,
      fim,
      confirmar: async () => {
        await fim;
        this.eventos.push(["exec-inspect", x.id]);
        return { id: x.id, running: false, codigo: 0, sinal: null };
      },
    };
  }
  async build(rev) {
    this.eventos.push(["build", rev]);
  }
  async imagem(rev) {
    return { Config: { Labels: { "org.opencontainers.image.revision": rev === "B" ? B : A } } };
  }
  async coletarLeitor(rev) {
    this.eventos.push(["oci-lifecycle", rev]);
    return Buffer.from("migrador original como dados");
  }
  async subirB() {
    this.eventos.push(["subir", "B"]);
    this.atual = "B";
  }
}
test("REAL disponibilidade: coordenador operacional separado do EngineFake", () => {
  assert.equal(typeof CoordenadorReal, "function", "REAL_API_AUSENTE");
  assert.equal(typeof executarReal, "function", "REAL_API_AUSENTE");
});
test("REAL unidade confere confinamento UID1000 sem autoridade Root física", () => {
  assert.equal(process.getuid(), 1000);
  const s = fs.readFileSync("/proc/self/status", "utf8");
  assert.match(s, /^CapEff:\s*0000000000000000$/m);
  assert.match(s, /^NoNewPrivs:\s*1$/m);
  assert.equal(fs.existsSync("/var/run/docker.sock"), false);
  assert.equal(fs.existsSync("/run/docker.sock"), false);
});
test("REAL argumentos inválidos não iniciam o transporte", () => {
  for (const a of [
    [],
    ["--engine-fake"],
    ["--executar"],
    ["--executar", "relativo"],
    ["--executar", "/x", "extra"],
  ])
    assert.throws(() => argumentosReal(a), { code: "ARGUMENTOS" });
  assert.equal(argumentosReal(["--executar", "/x/manifesto.json"]), "/x/manifesto.json");
});
test("REAL CLI sem flag termina 78 antes de qualquer acesso ao daemon", () => {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./atualizacao-integracao-real.mjs", import.meta.url))],
    {
      env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/scratch", TMPDIR: "/scratch" },
      timeout: 15000,
      maxBuffer: 65536,
    },
  );
  assert.equal(r.status, 78);
  assert.equal(r.signal, null);
  assert.equal(r.error, undefined);
  assert.equal(r.stdout.length, 0);
  assert.equal(r.stderr.toString(), "Real recusou: ARGUMENTOS\n");
});
test("REAL pedidos recusam extra env binding contexto e pin", () => {
  validarPedidoReal(runtime.produto, pedido("construir"), binding);
  for (const [alterar, code] of [
    [
      (p) => {
        p.argv = ["rm"];
      },
      "CAMPOS",
    ],
    [
      (p) => {
        p.env.EXTRA = "x";
      },
      "AMBIENTE",
    ],
    [
      (p) => {
        p.vinculo.rootId = DB;
      },
      "BINDING",
    ],
    [
      (p) => {
        p.contextoSha256 = "9".repeat(64);
      },
      "CONTEXTO",
    ],
    [
      (p) => {
        p.prova.pinSha256 = "bad";
      },
      "PIN",
    ],
    [
      (p) => {
        p.prova.cifra.formato = "texto";
      },
      "PIN_CIFRA",
    ],
  ]) {
    const p = structuredClone(pedido("construir"));
    alterar(p);
    assert.throws(() => validarPedidoReal(runtime.produto, p, binding), { code });
  }
});
test("REAL raw wrong-ID", () => {
  const r = rawLeitor();
  r.Id = DB;
  let actual = null;
  try {
    conferirContainer(r, CID, specLeitor(), "created");
  } catch (e) {
    actual = e.code;
  }
  assert.equal(actual, process.env.REAL_CONTROLE === "wrong-ID" ? "ID_INCORRETO" : "ID");
});
test("REAL witness rejeita expectativa wrong-result independente", () => {
  const r = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--test-name-pattern=^REAL raw wrong-ID$",
      fileURLToPath(import.meta.url),
    ],
    {
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: "/scratch",
        TMPDIR: "/scratch",
        REAL_CONTROLE: "wrong-ID",
      },
      maxBuffer: 1024 * 1024,
      timeout: 15000,
    },
  );
  const receipt = {
    codigo: r.status,
    sinal: r.signal,
    spawnError: r.error?.code ?? null,
    stdout: r.stdout.toString("base64"),
    stderr: r.stderr.toString("base64"),
  };
  process.stdout.write(
    "REAL_CONTROLE=" + Buffer.from(JSON.stringify(receipt)).toString("base64") + "\n",
  );
  assert.equal(receipt.codigo, 1);
  assert.equal(receipt.sinal, null);
  assert.equal(receipt.spawnError, null);
  assert.match(r.stdout.toString(), /actual: 'ID'/);
  assert.match(r.stdout.toString(), /expected: 'ID_INCORRETO'/);
  assert.match(r.stdout.toString(), /code: 'ERR_ASSERTION'/);
});
test("REAL inspect recusa env owner mount e privilégios extras", () => {
  conferirContainer(rawLeitor(), CID, specLeitor(), "created");
  for (const [alterar, code] of [
    [(r) => r.Config.Env.push("EXTRA=x"), "AMBIENTE"],
    [
      (r) => {
        r.Config.User = "0:0";
      },
      "OWNER",
    ],
    [(r) => r.Mounts.push({ Type: "bind", Destination: "/var/run/docker.sock" }), "MOUNTS"],
    [
      (r) => {
        r.HostConfig.Privileged = true;
      },
      "CONFINAMENTO",
    ],
    [
      (r) => {
        r.Config.ExposedPorts = { "80/tcp": {} };
      },
      "PORTAS",
    ],
  ]) {
    const r = rawLeitor();
    alterar(r);
    assert.throws(() => conferirContainer(r, CID, specLeitor(), "created"), { code });
  }
  assert.throws(() => ambienteExato(["A=1", "A=1"], ["A=1"]), { code: "AMBIENTE" });
});
test("REAL OCI exige hash de Config e não reutiliza fixture Fake", () => {
  const raw = { Id: IMAGE, Config: { Env: ["PATH=/x"], Labels: {}, Volumes: {}, OnBuild: [] } },
    pin = {
      id: IMAGE,
      configSha256: hash(JSON.stringify(raw.Config)),
      env: ["PATH=/x"],
      labels: {},
    };
  conferirImagem(raw, pin);
  const errado = structuredClone(raw);
  errado.Config.Env.push("LD_PRELOAD=/x");
  assert.throws(() => conferirImagem(errado, pin), { code: "OCI_PIN" });
});
test("REAL API Unix finita preserva raw e aceita versão anunciada superior", async () => {
  const l = ledger(),
    calls = [];
  const request = (o, cb) => {
    calls.push(o);
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const res = new PassThrough();
        res.statusCode = 200;
        res.headers = { "api-version": "1.53" };
        cb(res);
        res.end(JSON.stringify({ ID: "daemon-duble-declarado" }));
      });
    return req;
  };
  const e = new EngineDockerReal(runtime, l, { request });
  assert.equal((await e.daemon()).ID, "daemon-duble-declarado");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].socketPath, "/var/run/docker.sock");
  assert.equal(calls[0].path, "/v1.47/info");
  assert.equal(calls[0].method, "GET");
  assert.deepEqual(JSON.parse(l.raws[0].bytes), { ID: "daemon-duble-declarado" });
  await assert.rejects(e.remover(CID), { code: "OWN" });
  assert.equal(calls.length, 1);
});
test("REAL API ExecCreate persiste ID antes do Start e confirma Inspect terminal", async () => {
  const config = {
    Env: ["PATH=/usr/local/bin:/usr/bin:/bin"],
    Labels: {},
    Volumes: { "/var/lib/postgresql/data": {} },
    OnBuild: [],
    ExposedPorts: { "5432/tcp": {} },
  };
  const rt = structuredClone(runtime);
  rt.manifesto.imagens.postgres = {
    id: IMAGE,
    configSha256: hash(JSON.stringify(config)),
    env: config.Env,
    labels: {},
  };
  const pg = rawLeitor();
  pg.Id = DB;
  pg.Config.User = "999:999";
  pg.Config.Labels["com.docker.compose.service"] = "db";
  pg.Config.Entrypoint = ["docker-entrypoint.sh"];
  pg.Config.Cmd = [
    "postgres",
    "-c",
    "listen_addresses=",
    "-c",
    "unix_socket_directories=/pgsocket",
  ];
  pg.Config.WorkingDir = "/";
  pg.Config.ExposedPorts = { "5432/tcp": {} };
  pg.Config.Env = [
    "PATH=/usr/local/bin:/usr/bin:/bin",
    "POSTGRES_USER=frequencia",
    "POSTGRES_DB=frequencia",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "PGDATA=/var/lib/postgresql/data/pgdata",
    "PGHOST=/pgsocket",
  ];
  pg.Mounts = [
    {
      Type: "volume",
      Name: `real-${ROUND}-dados`,
      Source: "/own/dados",
      Destination: "/var/lib/postgresql/data",
      RW: true,
    },
    {
      Type: "volume",
      Name: `real-${ROUND}-socket`,
      Source: "/own/socket",
      Destination: "/pgsocket",
      RW: true,
    },
  ];
  const running = structuredClone(pg);
  running.State = { ...running.State, Running: true, Status: "running", Pid: 42 };
  const cmd = [
    "psql",
    "-X",
    "-U",
    "frequencia",
    "-d",
    "frequencia",
    "-v",
    "ON_ERROR_STOP=1",
    "-tAc",
    "SELECT current_database();",
  ];
  const exec = {
    ID: EXEC,
    ContainerID: DB,
    Running: false,
    ExitCode: 0,
    Pid: 0,
    ProcessConfig: {
      privileged: false,
      entrypoint: "psql",
      arguments: cmd.slice(1),
      user: "999:999",
    },
  };
  const script = [
      ["GET", `/v1.47/images/${IMAGE}/json`, 200, { Id: IMAGE, Config: config }],
      ["POST", /^\/v1\.47\/containers\/create\?name=real-/, 201, { Id: DB }],
      ["GET", `/v1.47/containers/${DB}/json`, 200, pg],
      ["GET", `/v1.47/containers/${DB}/json`, 200, pg],
      ["POST", `/v1.47/containers/${DB}/start`, 204, null],
      ["GET", `/v1.47/containers/${DB}/json`, 200, running],
      ["POST", `/v1.47/containers/${DB}/exec`, 201, { Id: EXEC }],
      ["GET", `/v1.47/exec/${EXEC}/json`, 200, exec],
      ["POST", `/v1.47/exec/${EXEC}/start`, 101, null],
      ...Array.from({ length: 3 }, () => ["GET", `/v1.47/exec/${EXEC}/json`, 200, exec]),
    ],
    bodies = [],
    l = ledger();
  const request = (options, cb) => {
    const step = script.shift();
    assert.ok(step, "API inesperada");
    assert.equal(options.socketPath, "/var/run/docker.sock");
    assert.equal(options.method, step[0]);
    if (step[1] instanceof RegExp) assert.match(options.path, step[1]);
    else assert.equal(options.path, step[1]);
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = (b) => {
      bodies.push({ path: options.path, body: b ? JSON.parse(b) : null });
      queueMicrotask(() => {
        if (step[2] === 101) {
          const socket = new Duplex({
            read() {},
            write(_b, _e, done) {
              done();
            },
            final(done) {
              this.push(frame(1, Buffer.from("frequencia\n")));
              this.push(null);
              done();
            },
          });
          req.emit(
            "upgrade",
            { statusCode: 101, headers: { "api-version": "1.53" } },
            socket,
            Buffer.alloc(0),
          );
        } else {
          const res = new PassThrough();
          res.statusCode = step[2];
          res.headers = { "api-version": "1.53" };
          cb(res);
          res.end(step[3] === null ? undefined : JSON.stringify(step[3]));
        }
      });
    };
    return req;
  };
  const e = new EngineDockerReal(rt, l, { request });
  await e.imagemBase("postgres");
  e.ids.db = await e.criar("db");
  assert.equal(e.ids.db, DB);
  await e.start(DB);
  const x = await e.criarExec("identidade-banco");
  assert.equal(x.id, EXEC);
  assert.ok(l.registros.some((r) => r.tipo === "exec-id" && r.id === EXEC));
  const h = await e.iniciarExec(x),
    out = ler(h.stdout),
    err = ler(h.stderr);
  h.stdin.end();
  const f = await h.fim;
  assert.equal((await out).toString(), "frequencia\n");
  assert.equal((await err).length, 0);
  assert.deepEqual(f, { codigo: 0, sinal: null });
  assert.deepEqual(await h.confirmar(), { id: EXEC, running: false, codigo: 0, sinal: null });
  assert.equal(script.length, 0);
  const body = bodies.find((r) => r.path.endsWith(`/${DB}/exec`)).body;
  assert.deepEqual(body.Cmd, cmd);
  assert.equal(body.User, "999:999");
  assert.equal(body.Privileged, false);
  assert.deepEqual(body.Env, []);
  assert.ok(
    l.registros.findIndex((r) => r.tipo === "exec-id") <
      l.registros.findIndex((r) => r.tipo === "http" && r.rota === `/exec/${EXEC}/start`),
  );
  await e.close();
});
test("REAL HTTP local por Unix retorna bytes reais do servidor sintético", async () => {
  const p = fs.mkdtempSync("/scratch/real-http-"),
    socket = p + "/app.sock",
    server = http.createServer((req, res) => {
      assert.equal(req.url, "/api/saude");
      assert.equal(req.method, "GET");
      res.end(respostaCommit(B));
    });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  try {
    assert.equal((await consultarUnix(socket)).toString(), B + "\n");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
function frame(canal, b) {
  const h = Buffer.alloc(8);
  h[0] = canal;
  h.writeUInt32BE(b.length, 4);
  return Buffer.concat([h, b]);
}
test("REAL framing Docker preserva binário separado e EOF", async () => {
  const out = coletor(),
    err = coletor(),
    f = Buffer.concat([frame(1, DUMP), frame(2, Buffer.from([254, 0]))]);
  await desmultiplexar(
    Readable.from([f.subarray(0, 5), f.subarray(5, 11), f.subarray(11)]),
    out.stream,
    err.stream,
  );
  assert.deepEqual(Buffer.concat(out.bytes), DUMP);
  assert.deepEqual(Buffer.concat(err.bytes), Buffer.from([254, 0]));
  await assert.rejects(
    desmultiplexar(Readable.from([f.subarray(0, -1)]), coletor().stream, coletor().stream),
    { code: "DOCKER_EOF" },
  );
});
test("REAL framing recusa tamanho antes de alocar payload", async () => {
  const h = Buffer.alloc(8);
  h[0] = 1;
  h.writeUInt32BE(1024 * 1024 + 1, 4);
  await assert.rejects(desmultiplexar(Readable.from([h]), coletor().stream, coletor().stream), {
    code: "STREAM_LIMITE",
  });
  const q = Buffer.alloc(16);
  q.write("FAAB");
  q[4] = 1;
  q[5] = 1;
  q.writeUInt32BE(LIMITES.quadro + 1, 12);
  await assert.rejects(
    async () => {
      for await (const _ of quadros(Readable.from([q]))) {
      }
    },
    { code: "LIMITE" },
  );
});
test("REAL binding inicial delimita prontidão antes do codec", async () => {
  const input = new PassThrough(),
    body = Buffer.from(JSON.stringify(binding)),
    h = Buffer.alloc(4);
  h.writeUInt32BE(body.length);
  const p = receberBinding(input, runtime);
  input.write(h.subarray(0, 2));
  input.write(Buffer.concat([h.subarray(2), body]));
  assert.deepEqual(await p, binding);
  input.destroy();
  const eof = new PassThrough(),
    r = receberBinding(eof, runtime);
  eof.end();
  await assert.rejects(r, { code: "BINDING_EOF" });
});
test("REAL coordenador vertical B com pin OCI e HTTP em dublê declarado", async () => {
  const e = new EngineDubleDeclarado(),
    l = ledger(),
    c = new CoordenadorReal(runtime, e, l, binding),
    entrada = new PassThrough(),
    saida = new PassThrough();
  const server = atender(entrada, saida, c);
  server.catch(() => {});
  const cliente = new Cliente(saida, entrada);
  for (const n of ["construir", "revisao-imagem", "validar-imagem", "subir", "http-commit"]) {
    const out = coletor(),
      r = await cliente.executar(pedido(n), { saida: out.stream });
    assert.equal(r.codigo, 0);
    if (n === "validar-imagem")
      assert.equal(hash(Buffer.concat(out.bytes)), runtime.produto.migradorSha256);
    if (n === "http-commit") assert.equal(Buffer.concat(out.bytes).toString(), B + "\n");
  }
  await cliente.fechar();
  await server;
  assert.equal(c.fechado, true);
  assert.equal(c.pendentes.size, 0);
  assert.equal(c.handles.size, 0);
  assert.deepEqual(
    e.eventos.filter((x) => ["build", "oci-lifecycle", "subir"].includes(x[0])),
    [
      ["build", "B"],
      ["oci-lifecycle", "B"],
      ["subir", "B"],
    ],
  );
  assert.ok(
    l.registros.findIndex((x) => x.tipo === "PIN_ROOT") <
      l.registros.findIndex((x) => x.tipo === "CONFIRMADO"),
  );
  await assert.rejects(c.abrir(pedido("construir")), { code: "REVOGADO" });
});
test("REAL dump e listagem concorrentes atravessam pipes reais", async () => {
  const e = new EngineDubleDeclarado(),
    l = ledger(),
    c = new CoordenadorReal(runtime, e, l, binding),
    a = new PassThrough(),
    b = new PassThrough(),
    server = atender(a, b, c);
  server.catch(() => {});
  const cli = new Cliente(b, a),
    pipe = new PassThrough({ highWaterMark: 1 }),
    erro1 = coletor(),
    erro2 = coletor(),
    out = coletor();
  const listar = cli.executar(pedido("listar-dump"), {
    entrada: pipe,
    saida: out.stream,
    erro: erro2.stream,
  });
  const dump = cli.executar(pedido("dump"), { saida: pipe, erro: erro1.stream });
  const results = await Promise.all([listar, dump]);
  assert.deepEqual(
    results.map((x) => x.codigo),
    [0, 0],
  );
  assert.deepEqual(e.iniciados, ["listar-dump", "dump"]);
  assert.deepEqual(Buffer.concat(erro1.bytes), Buffer.from([255, 0]));
  assert.deepEqual(Buffer.concat(erro2.bytes), Buffer.from([255, 0]));
  await cli.fechar();
  await server;
  assert.equal(c.pendentes.size, 0);
});
for (const fase of ["INTENT", "EXEC_ID"]) {
  test(`REAL cancelamento após ${fase} não envia novo efeito`, async () => {
    const entered = deferred(),
      release = deferred(),
      l = ledger(),
      e = new EngineDubleDeclarado(),
      base = l.registrar.bind(l);
    l.registrar = async (tipo, d) => {
      await base(tipo, d);
      if (tipo === fase) {
        entered.resolve();
        await release.promise;
      }
    };
    const c = new CoordenadorReal(runtime, e, l, binding),
      abort = new AbortController(),
      promise = c.abrir(pedido("dump"), abort.signal);
    promise.catch(() => {});
    await entered.promise;
    abort.abort();
    release.resolve();
    await assert.rejects(promise, { code: "CANCELADO" });
    assert.deepEqual(e.iniciados, []);
    assert.equal(c.fechado, true);
    assert.equal(c.pendentes.size, 1);
    if (fase === "EXEC_ID") assert.equal([...c.pendentes.values()][0].id, "7".repeat(64));
  });
}
test("REAL resultado desconhecido é preservado sem stop ou rm", async () => {
  const l = ledger(),
    e = new EngineDubleDeclarado();
  e.criarExec = async () => {
    e.eventos.push(["enviado-sem-id"]);
    throw Object.assign(new Error("RESPOSTA_PERDIDA"), { code: "RESPOSTA_PERDIDA" });
  };
  const c = new CoordenadorReal(runtime, e, l, binding);
  await assert.rejects(c.abrir(pedido("dump")), { code: "RESPOSTA_PERDIDA" });
  assert.equal(c.pendentes.size, 1);
  assert.equal([...c.pendentes.values()][0].id, null);
  assert.deepEqual(e.eventos, [["enviado-sem-id"]]);
  assert.equal(l.registros.at(-1).tipo, "INCERTO");
});
test("REAL contexto stale e owner errado recusam antes do consumo", () => {
  const p = fs.mkdtempSync("/scratch/real-fonte-");
  fs.chmodSync(p, 0o700);
  fs.writeFileSync(p + "/modulo.mjs", "original\n", { mode: 0o600 });
  const inv = inventarioReal(p, 1000);
  conferirContexto(p, inv, 1000);
  fs.writeFileSync(p + "/modulo.mjs", "trocado\n");
  assert.throws(() => conferirContexto(p, inv, 1000), { code: "CONTEXTO" });
  assert.throws(() => arquivoProtegido(p + "/modulo.mjs", 0), { code: "OWNER" });
});
test("REAL processo captura close e status sem confundir com recurso", async () => {
  const p = processoFechado(
      process.execPath,
      ["-e", "process.stdout.write('saída');process.stderr.write('erro');process.exitCode=7"],
      { env: { PATH: "/usr/local/bin:/usr/bin:/bin" } },
    ),
    r = await p.resultado;
  assert.equal(r.codigo, 7);
  assert.equal(r.sinal, null);
  assert.equal(r.spawnError, null);
  assert.equal(r.close, true);
  assert.equal(r.stdout.toString(), "saída");
  assert.equal(r.stderr.toString(), "erro");
});
test("REAL observador cancelado confirma close local sem inferir término Docker", async () => {
  const abort = new AbortController(),
    p = processoFechado(
      process.execPath,
      ["-e", "process.stdout.write('READY');setInterval(()=>{},1000)"],
      { signal: abort.signal, env: { PATH: "/usr/local/bin:/usr/bin:/bin" } },
    );
  const closed = new Promise((resolve) =>
    p.filho.once("close", (codigo, sinal) => resolve({ codigo, sinal })),
  );
  await new Promise((resolve) => p.filho.stdout.once("data", resolve));
  const rejected = assert.rejects(p.resultado, { code: "CANCELADO" });
  abort.abort();
  await rejected;
  const r = await closed;
  assert.equal(r.codigo, null);
  assert.equal(r.sinal, "SIGTERM");
  assert.equal(p.filho.signalCode, "SIGTERM");
});
test("REAL fechamento pg local é inventariado como dados sem executar pacotes", () => {
  const esperado = JSON.parse(fs.readFileSync("/repo/fixtures-pg/manifesto.json")),
    actual = fechamentoPg("/repo/fixtures-pg/node_modules");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(actual.arquivos).map(([n, d]) => [n, { sha256: d.sha256, bytes: d.bytes }]),
    ),
    Object.fromEntries(
      Object.entries(esperado.arquivos).map(([n, d]) => [n, { sha256: d.sha256, bytes: d.bytes }]),
    ),
  );
  assert.equal(Object.keys(actual.arquivos).length, 138);
  assert.equal(actual.pacotes.pg.versao, "8.23.1");
});
test("REAL bytes HTTP decorrem do commit e não de uma constante B", () => {
  assert.equal(respostaCommit(A).toString(), A + "\n");
  assert.equal(respostaCommit(B).toString(), B + "\n");
  assert.notDeepEqual(respostaCommit(A), respostaCommit(B));
  assert.throws(() => respostaCommit("B"), /COMMIT/);
});
const URL_ANTIGA = "postgresql:///frequencia?host=/pgsocket&user=frequencia";
const URL_NOVA = "postgresql://frequencia@localhost/frequencia?host=/pgsocket";
test("REAL URL antiga é recusada pelo migrador e a nova é a usada", () => {
  assert.throws(() => resolverSchema({ url: URL_ANTIGA, schemaExplicito: "public" }), /inválida/);
  const endereco = new URL(URL_NOVA);
  assert.ok(endereco.hostname);
  assert.equal(endereco.hostname, "localhost");
  assert.equal(endereco.searchParams.get("host"), "/pgsocket");
  assert.equal(resolverSchema({ url: URL_NOVA, schemaExplicito: "public" }), "public");
  assert.equal(resolverSchema({ url: URL_NOVA }), "public");
  for (const nome of [
    "atualizacao-integracao-real-engine.mjs",
    "atualizacao-integracao-real-app.mjs",
  ]) {
    const texto = fs.readFileSync(new URL(`./${nome}`, import.meta.url), "utf8");
    assert.equal(texto.includes(URL_NOVA), true, nome);
    assert.equal(texto.includes(URL_ANTIGA), false, nome);
  }
});
test(
  "REAL prazo do atualizar mata o filho e a sessão não remove sem exit",
  { timeout: 8000 },
  async () => {
    const rootTexto = fs.readFileSync(
      new URL("./atualizacao-integracao-real-root.mjs", import.meta.url),
      "utf8",
    );
    const realTexto = fs.readFileSync(
      new URL("./atualizacao-integracao-real.mjs", import.meta.url),
      "utf8",
    );
    const minimo = 180_000 + 12 * 5_000;
    assert.match(rootTexto, /export const PRAZO_ATUALIZAR_MS/);
    assert.match(rootTexto, /aguardarComando\(/);
    assert.match(realTexto, /export const PRAZO_SESSAO_ROOT_MS/);
    assert.match(realTexto, /encerrarRootNoErro\(\s*engine,\s*id\s*\)/);
    const root = await import("./atualizacao-integracao-real-root.mjs");
    const real = await import("./atualizacao-integracao-real.mjs");
    assert.equal(root.PRAZO_ATUALIZAR_MS, minimo);
    assert.ok(real.PRAZO_SESSAO_ROOT_MS > root.PRAZO_ATUALIZAR_MS);
    const filho = spawn(process.execPath, ["-e", "setInterval(()=>{},1e9)"], { stdio: "ignore" });
    const err = await root.aguardarComando(filho, 40).then(
      () => null,
      (e) => e,
    );
    assert.equal(err?.code, "PRAZO");
    assert.equal(err.close, true);
    assert.equal(filho.signalCode, "SIGKILL");
    const id = "a".repeat(64);
    const chamadas = [];
    const engine = {
      async parar(x) {
        chamadas.push(["parar", x]);
      },
      async wait() {
        chamadas.push("wait");
        throw Object.assign(new Error("sem exit"), { code: "WAIT" });
      },
      async remover() {
        chamadas.push("remover");
      },
    };
    const encerrado = await real.encerrarRootNoErro(engine, id);
    assert.equal(encerrado.exitConfirmado, false);
    assert.equal(encerrado.removido, false);
    assert.deepEqual(chamadas, [["parar", id], "wait"]);
  },
);
test("REAL ferramentas ausentes recusam depois do command -v e antes dos volumes", async () => {
  const toolsId = "sha256:" + "a".repeat(64);
  const pgId = "sha256:" + "b".repeat(64);
  const toolsConfig = {
    Env: ["PATH=/usr/bin:/bin"],
    Labels: { papel: "tools" },
    Volumes: {},
    OnBuild: [],
  };
  const pgConfig = {
    Env: ["PATH=/usr/bin:/bin"],
    Labels: { papel: "postgres" },
    Volumes: { "/var/lib/postgresql/data": {} },
    OnBuild: [],
  };
  const rt = structuredClone(runtime);
  rt.manifesto.imagens = {
    tools: {
      id: toolsId,
      configSha256: hash(JSON.stringify(toolsConfig)),
      env: toolsConfig.Env,
      labels: toolsConfig.Labels,
    },
    postgres: {
      id: pgId,
      configSha256: hash(JSON.stringify(pgConfig)),
      env: pgConfig.Env,
      labels: pgConfig.Labels,
    },
  };
  const imagens = {
    [`/v1.47/images/${toolsId}/json`]: { Id: toolsId, Config: toolsConfig },
    [`/v1.47/images/${pgId}/json`]: { Id: pgId, Config: pgConfig },
  };
  const chamadas = [];
  const request = (options, cb) => {
    chamadas.push({ method: options.method, path: options.path, body: options.body ?? null });
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.end = (bytes) =>
      queueMicrotask(() => {
        if (bytes) chamadas.at(-1).body = JSON.parse(bytes);
        const res = new PassThrough();
        res.headers = { "api-version": "1.53" };
        const sonda = "c".repeat(64);
        if (options.path === "/v1.47/info") {
          res.statusCode = 200;
          cb(res);
          res.end(JSON.stringify({ ID: "daemon-ferramentas" }));
          return;
        }
        if (imagens[options.path]) {
          res.statusCode = 200;
          cb(res);
          res.end(JSON.stringify(imagens[options.path]));
          return;
        }
        if (options.method === "POST" && options.path.startsWith("/v1.47/containers/create")) {
          res.statusCode = 201;
          cb(res);
          res.end(JSON.stringify({ Id: sonda }));
          return;
        }
        if (options.method === "POST" && options.path === `/v1.47/containers/${sonda}/start`) {
          res.statusCode = 204;
          cb(res);
          res.end();
          return;
        }
        if (options.method === "POST" && options.path.startsWith(`/v1.47/containers/${sonda}/wait`)) {
          res.statusCode = 200;
          cb(res);
          res.end(JSON.stringify({ StatusCode: 0 }));
          return;
        }
        if (options.method === "GET" && options.path.startsWith(`/v1.47/containers/${sonda}/logs`)) {
          res.statusCode = 200;
          cb(res);
          res.end("/usr/bin/age\n/usr/bin/age-keygen\n/usr/bin/git\n/usr/bin/curl\n");
          return;
        }
        if (options.method === "DELETE" && options.path.startsWith(`/v1.47/containers/${sonda}`)) {
          res.statusCode = 204;
          cb(res);
          res.end();
          return;
        }
        res.statusCode = 500;
        cb(res);
        res.end(JSON.stringify({ message: "inesperado" }));
      });
    return req;
  };
  const e = new EngineDockerReal(rt, ledger(), { request });
  await assert.rejects(() => e.inicializar(), { code: "FERRAMENTAS" });
  const criacoes = chamadas.filter((c) => c.method === "POST" && c.path.startsWith("/v1.47/containers/create"));
  assert.equal(criacoes.length, 1);
  assert.match(criacoes[0].body.Cmd.join(" "), /command -v age/);
  assert.equal(criacoes[0].body.HostConfig.NetworkMode, "none");
  assert.equal(criacoes[0].body.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(criacoes[0].body.HostConfig.CapDrop, ["ALL"]);
  assert.equal(
    chamadas.some((c) => c.method === "POST" && c.path === "/v1.47/volumes/create"),
    false,
  );
});
test("REAL command -v completo é aceito e caminho relativo não", () => {
  assert.deepEqual(lerFerramentas("/usr/bin/age\n/usr/bin/age-keygen\n/usr/bin/jq\n/usr/bin/git\n/usr/bin/curl\n"), [
    "/usr/bin/age",
    "/usr/bin/age-keygen",
    "/usr/bin/jq",
    "/usr/bin/git",
    "/usr/bin/curl",
  ]);
  assert.throws(() => lerFerramentas("age\n"), { code: "FERRAMENTAS" });
});
