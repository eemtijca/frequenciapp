// Despacha receitas finitas em EngineFake; não contém cliente do daemon nem PostgreSQL real.
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { PassThrough, Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  exigir,
  falha,
  hash,
  iguais,
  manifestoFechado,
  validarPedido,
  receitaBanco,
} from "./atualizacao-integracao-receitas.mjs";
import { AMBIENTE, conferirFonte, gravar } from "./atualizacao-integracao-fontes.mjs";
import { atender } from "./atualizacao-integracao-adaptador.mjs";
const aqui = fileURLToPath(import.meta.url);
export const CARGA = Buffer.from(Array.from({ length: 262193 }, (_, i) => i % 256));
const idNovo = () => randomBytes(32).toString("hex");
const clonar = (x) => structuredClone(x);
const leitura = (bytes) => ({
  stdin: new Writable({
    write(_b, _e, cb) {
      cb();
    },
  }),
  stdout: Readable.from(bytes.length ? [bytes] : []),
  stderr: Readable.from([]),
  fim: Promise.resolve({ codigo: 0, sinal: null }),
});
export function capturas() {
  const container = fs.readFileSync(
    new URL("./atualizacao-integracao-container.json", import.meta.url),
  );
  const imagem = fs.readFileSync(new URL("./atualizacao-integracao-imagem.json", import.meta.url));
  return {
    container: JSON.parse(container)[0],
    imagem: JSON.parse(imagem)[0],
    hashes: { container: hash(container), imagem: hash(imagem) },
  };
}
function observacao(m, base, papel, id, image, running) {
  // Transformações explícitas da captura real. Nenhum campo provém da spec enviada.
  const c = clonar(base),
    leitor = papel === "leitor",
    db = papel === "db";
  c.Id = id;
  c.Name = `/EngineFake-${papel}-${id.slice(0, 12)}`;
  c.Image = image;
  c.Path = leitor ? "/bin/cat" : "/fixture";
  c.Args = leitor ? ["/app/docker/app/migrar.mjs"] : [papel];
  c.Config.Hostname = id.slice(0, 12);
  c.Config.User = leitor ? "65534:65534" : "0:0";
  c.Config.Env = ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"];
  c.Config.Entrypoint = [c.Path];
  c.Config.Cmd = [...c.Args];
  c.Config.WorkingDir = "/";
  c.Config.Labels = {
    "com.docker.compose.project": m.projeto,
    "com.docker.compose.service": papel,
    "frequenciapp.rodada": m.rodada,
  };
  c.Config.Healthcheck = { Test: ["NONE"] };
  c.Config.Volumes = null;
  c.Config.ExposedPorts = null;
  Object.assign(c.HostConfig, {
    NetworkMode: "none",
    ReadonlyRootfs: true,
    CapDrop: ["ALL"],
    CapAdd: null,
    SecurityOpt: ["no-new-privileges:true"],
    Memory: 268435456,
    NanoCpus: 1000000000,
    PidsLimit: 64,
    Binds: null,
    Mounts: [],
    Tmpfs: {},
    Init: true,
    AutoRemove: false,
    Privileged: false,
    PortBindings: {},
    Devices: [],
    DeviceRequests: null,
    PidMode: "",
    IpcMode: "private",
    RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
  });
  c.Mounts = db
    ? [
        {
          Type: "volume",
          Name: `${m.projeto}-dados`,
          Source: `/virtual/EngineFake/${m.projeto}-dados`,
          Destination: "/var/lib/postgresql/data",
          Driver: "local",
          Mode: "z",
          RW: true,
          Propagation: "",
        },
      ]
    : [];
  c.HostConfig.Mounts = db
    ? [{ Type: "volume", Source: `${m.projeto}-dados`, Target: "/var/lib/postgresql/data" }]
    : [];
  c.State = {
    Status: running ? "running" : "created",
    Running: running,
    Paused: false,
    Restarting: false,
    OOMKilled: false,
    Dead: false,
    Pid: 0,
    ExitCode: 0,
    Error: "",
    StartedAt: "0001-01-01T00:00:00Z",
    FinishedAt: "0001-01-01T00:00:00Z",
  };
  if (running && papel === "app") c.State.Health = { Status: "healthy" };
  return c;
}
export function validarRaw(m, c, { id, papel, image, running }) {
  exigir(
    c.Id === id &&
      c.Image === image &&
      c.State.Running === running &&
      c.State.Error === "" &&
      !c.State.OOMKilled &&
      !c.State.Dead,
    "IDENTIDADE",
  );
  exigir(
    iguais(c.Config.Labels, {
      "com.docker.compose.project": m.projeto,
      "com.docker.compose.service": papel,
      "frequenciapp.rodada": m.rodada,
    }),
    "IDENTIDADE",
  );
  const h = c.HostConfig;
  exigir(
    h.NetworkMode === "none" &&
      h.ReadonlyRootfs &&
      !h.Privileged &&
      !h.AutoRemove &&
      h.Init === true &&
      h.Memory === 268435456 &&
      h.NanoCpus === 1000000000 &&
      h.PidsLimit === 64,
    "CONFINAMENTO",
  );
  exigir(
    iguais(h.CapDrop, ["ALL"]) &&
      !h.CapAdd?.length &&
      iguais(h.SecurityOpt, ["no-new-privileges:true"]) &&
      h.PidMode === "" &&
      h.IpcMode === "private" &&
      h.RestartPolicy.Name === "no" &&
      !Object.keys(h.PortBindings ?? {}).length &&
      !h.Devices?.length &&
      !h.DeviceRequests?.length &&
      !h.Binds?.length &&
      !Object.keys(h.Tmpfs ?? {}).length,
    "CONFINAMENTO",
  );
  exigir(
    iguais(c.Config.Env, ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"]) &&
      iguais(c.Config.Healthcheck, { Test: ["NONE"] }) &&
      c.Config.User === (papel === "leitor" ? "65534:65534" : "0:0"),
    "AMBIENTE",
  );
  const cmd = papel === "leitor" ? ["/app/docker/app/migrar.mjs"] : [papel];
  exigir(
    iguais(c.Config.Cmd, cmd) &&
      iguais(c.Config.Entrypoint, [papel === "leitor" ? "/bin/cat" : "/fixture"]) &&
      c.Config.WorkingDir === "/" &&
      !c.Config.Volumes &&
      !c.Config.ExposedPorts,
    "COMANDO",
  );
  exigir(
    papel === "db"
      ? c.Mounts.length === 1 &&
          c.Mounts[0].Type === "volume" &&
          c.Mounts[0].Name === `${m.projeto}-dados` &&
          c.Mounts[0].Destination === "/var/lib/postgresql/data"
      : c.Mounts.length === 0 && h.Mounts.length === 0,
    "MONTAGENS",
  );
  return c;
}
export class EngineFake {
  constructor(m, captura = capturas()) {
    this.m = m;
    this.captura = captura;
    this.efeitos = [];
    this.recursos = new Map();
    this.imagens = new Map();
    this.filhos = new Set();
    this.dump = null;
    this.ids = Object.fromEntries(["db", "caddy", "A", "B", "leitor"].map((p) => [p, idNovo()]));
    this.atual = "A";
    for (const r of ["A", "B"])
      this.imagens.set(r, { id: "sha256:" + idNovo(), commit: m.revisoes[r].commit, bytes: null });
    this.imagemPapeis = { db: "sha256:" + idNovo(), caddy: "sha256:" + idNovo() };
    for (const p of ["db", "caddy", "A"]) {
      const papel = p === "A" ? "app" : p,
        image = p === "A" ? this.imagens.get("A").id : this.imagemPapeis[p];
      this.recursos.set(
        this.ids[p],
        observacao(m, captura.container, papel, this.ids[p], image, true),
      );
    }
  }
  evento(tipo, dados = {}) {
    this.efeitos.push({ tipo, ...dados });
  }
  async inspect(id) {
    exigir(this.recursos.has(id), "ID");
    this.evento("inspect", { id });
    return clonar(this.recursos.get(id));
  }
  async criar(papel, revisao, receita) {
    exigir(iguais(receita, receitaCriar(this.m, papel, revisao)), "RECEITA");
    const id = this.ids[papel === "app" ? revisao : papel];
    exigir(!this.recursos.has(id), "ID");
    this.recursos.set(
      id,
      observacao(this.m, this.captura.container, papel, id, this.imagens.get(revisao).id, false),
    );
    this.evento("create", { id, papel, receita });
    return id;
  }
  async start(id) {
    const c = this.recursos.get(id);
    exigir(c && !c.State.Running, "ID");
    this.evento("start", { id });
    c.State.Running = true;
    c.State.Status = "running";
    if (c.Config.Labels["com.docker.compose.service"] === "app") {
      c.State.Health = { Status: "healthy" };
      this.atual = "B";
    }
  }
  async build(revisao, receita) {
    exigir(iguais(receita, receitaBuild(this.m, revisao)), "RECEITA");
    exigir(
      this.captura.imagem.Id === this.m.vertical.baseId &&
        this.captura.imagem.RepoTags.includes(this.m.vertical.baseTag),
      "BASE",
    );
    const imagem = this.imagens.get(revisao);
    imagem.bytes = fs.readFileSync(`${this.m.vertical.host}/${revisao}/docker/app/migrar.mjs`);
    imagem.config = clonar(this.captura.imagem);
    imagem.config.Id = imagem.id;
    imagem.config.Config.Labels = { "org.opencontainers.image.revision": imagem.commit };
    this.evento("build", { revisao, receita, image: imagem.id });
  }
  async attach(id) {
    const c = this.recursos.get(id);
    exigir(c?.State.Running && c.Config.Labels["com.docker.compose.service"] === "leitor", "ID");
    this.evento("attach", { id });
    const img = [...this.imagens.values()].find((i) => i.id === c.Image);
    exigir(img?.bytes, "OCI");
    c.State.Running = false;
    c.State.Status = "exited";
    return Buffer.from(img.bytes);
  }
  async wait(id) {
    const c = this.recursos.get(id);
    exigir(c && !c.State.Running, "ATIVOS");
    this.evento("wait", { id });
    return c.State.ExitCode;
  }
  async remover(id) {
    exigir(id === this.ids.leitor && !this.recursos.get(id)?.State.Running, "ID");
    this.evento("rmOwn", { id });
    this.recursos.delete(id);
  }
  async criarExec(nome) {
    const r = { id: randomUUID(), nome };
    this.evento("exec-create", { id: r.id, nome, recurso: this.ids.db });
    return r;
  }
  async iniciarExec(exec, signal) {
    exigir(["dump", "listar-dump", "identidade-banco", "sentinela"].includes(exec.nome), "RECEITA");
    this.evento("exec-start", { id: exec.id, nome: exec.nome });
    const filho = spawn(process.execPath, [aqui, "--pgfake", exec.nome], {
      env: AMBIENTE,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    });
    this.filhos.add(filho);
    exec.stdin = filho.stdin;
    exec.stdout = filho.stdout;
    exec.stderr = filho.stderr;
    exec.fim = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (codigo, sinal) => {
        this.filhos.delete(filho);
        this.evento("exec-close", { id: exec.id, codigo, sinal });
        resolve({ codigo, sinal });
      });
    });
    exec.fim.catch(() => {});
    const cancelar = () => filho.kill("SIGTERM");
    signal?.addEventListener("abort", cancelar, { once: true });
    exec.fim.finally(() => signal?.removeEventListener("abort", cancelar)).catch(() => {});
    if (exec.nome === "dump") {
      this.dump = filho;
      exec.stdin = new PassThrough();
    }
    if (exec.nome === "listar-dump") {
      // Ambos podem chegar em qualquer ordem; o dump só é liberado com a listagem viva.
      this.lista = filho;
    }
    if (this.dump && this.lista) {
      this.evento("pgfake-concorrente");
      this.dump.stdio[3].end(Buffer.from([1]));
      this.dump = null;
      this.lista = null;
    }
    exec.confirmar = async () => {
      const f = await exec.fim;
      return { id: exec.id, running: false, ...f };
    };
  }
}
export function receitaCriar(m, papel, revisao) {
  return {
    papel,
    image: m.revisoes[revisao].imagem,
    project: m.projeto,
    network: "none",
    readOnly: true,
    user: papel === "leitor" ? "65534:65534" : "0:0",
    capDrop: ["ALL"],
    nnp: true,
    memory: 268435456,
    nanoCpus: 1000000000,
    pids: 64,
    healthcheck: "NONE",
    autoremove: false,
    pull: "never",
    build: false,
    ports: [],
    mounts: [],
    command: papel === "leitor" ? ["/bin/cat", "/app/docker/app/migrar.mjs"] : ["/fixture", papel],
  };
}
export function receitaBuild(m, r) {
  return {
    context: `${m.vertical.host}/${r}`,
    commit: m.revisoes[r].commit,
    contextoSha256: m.revisoes[r].contextoSha256,
    operacionalSha256: m.operacionalSha256,
    baseTag: m.vertical.baseTag,
    baseIdConferido: m.vertical.baseId,
    from: m.vertical.baseTag,
    pull: false,
    network: "none",
    image: m.revisoes[r].imagem,
  };
}
export class Dispatcher {
  constructor(manifesto, engine) {
    this.m = manifestoFechado(manifesto);
    this.engine = engine;
    this.fechado = false;
    this.pendentes = new Set();
    this.historico = [];
    this.handles = new Map();
    const v = this.m.vertical;
    exigir(
      v &&
        iguais(
          Object.keys(v).sort(),
          [
            "raiz",
            "fonte",
            "app",
            "host",
            "config",
            "prefixo",
            "bin",
            "socket",
            "inventarios",
            "publico",
            "composeSha256",
            "baseTag",
            "baseId",
          ].sort(),
        ),
      "MANIFESTO",
    );
    exigir(
      v.raiz.startsWith("/scratch/coeso-") && /^[a-z0-9-]+$/.test(v.raiz.slice(9)),
      "MANIFESTO",
    );
    for (const [n, suf] of Object.entries({
      fonte: "fonte",
      app: "app",
      host: "host-simulado",
      config: "config",
      prefixo: "controlador",
      bin: "bin",
      socket: "canal/supervisor.sock",
    }))
      exigir(v[n] === `${v.raiz}/${suf}`, "MANIFESTO");
    for (const r of ["A", "B"]) {
      conferirFonte(`${v.host}/${r}`, v.inventarios[r]);
      exigir(
        hash(JSON.stringify(v.inventarios[r])) === this.m.revisoes[r].contextoSha256,
        "CONTEXTO",
      );
    }
  }
  autorizar(signal) {
    exigir(!this.fechado, "REVOGADO");
    if (signal?.aborted) throw signal.reason ?? falha("CANCELADO");
  }
  validar(p) {
    this.autorizar();
    validarPedido(this.m, p);
  }
  revogar() {
    this.fechado = true;
  }
  get ledger() {
    return [...this.pendentes].map((r) => ({ ...r }));
  }
  async fechar() {
    this.revogar();
    exigir(!this.pendentes.size, "ATIVOS");
    return this.historico;
  }
  async registro(r, etapa) {
    r.fase = etapa;
    const n = `${this.m.vertical.raiz}/ledger/${r.op}-${etapa}.json`;
    gravar(n, JSON.stringify(r) + "\n");
  }
  async conferir(id, papel, image, running) {
    return validarRaw(this.m, await this.engine.inspect(id), { id, papel, image, running });
  }
  pin() {
    const v = this.m.vertical,
      journal = `${v.prefixo}/dados/journal`,
      nomes = fs.readdirSync(journal);
    const ativos = nomes.filter((n) => !fs.existsSync(`${journal}/${n}/concluida.json`));
    exigir(ativos.length === 1, "PIN");
    const pinDir = `${v.prefixo}/dados/pins/${ativos[0]}`,
      pin = JSON.parse(fs.readFileSync(`${pinDir}/pin.json`));
    exigir(pin.operacao === ativos[0] && pin.arquivos.length >= 4, "PIN");
    for (const a of pin.arquivos) {
      exigir(
        !a.nome.includes("/") && hash(fs.readFileSync(`${pinDir}/${a.nome}`)) === a.sha256,
        "PIN",
      );
    }
    return pin;
  }
  async abrir(p, signal) {
    this.validar(p);
    const r = { op: randomUUID(), receita: p.receita, id: null, fase: "intencao" };
    this.pendentes.add(r);
    try {
      await this.registro(r, "intencao");
      this.autorizar(signal);
      const exec = await this.despachar(p, r, signal);
      r.id ??= exec.id ?? randomUUID();
      await this.registro(r, "enviado");
      this.autorizar(signal);
      let confirmacao;
      return {
        ...exec,
        id: r.id,
        confirmar: (f) =>
          (confirmacao ??= (async () => {
            try {
              const c = exec.confirmar
                ? await exec.confirmar()
                : { id: r.id, running: false, ...(await exec.fim) };
              exigir(
                c.id === r.id &&
                  !c.running &&
                  c.codigo === f.codigo &&
                  c.sinal === f.sinal &&
                  Number.isInteger(f.codigo) &&
                  !f.sinal,
                "CONCLUSAO",
              );
              await this.registro(r, "confirmado");
              this.historico.push({ ...r, codigo: f.codigo, sinal: f.sinal });
              this.pendentes.delete(r);
              this.handles.delete(r.id);
            } catch (e) {
              r.erro = e.code ?? "INTERNO";
              this.revogar();
              throw e;
            }
          })()),
      };
    } catch (e) {
      r.erro = e.code ?? "INTERNO";
      this.revogar();
      throw e;
    }
  }
  async despachar(p, r, signal) {
    const e = this.engine,
      m = this.m,
      v = m.vertical,
      rev = p.revisao,
      n = p.receita;
    const bytes = (b) => leitura(Buffer.isBuffer(b) ? b : Buffer.from(b));
    if (["dump", "listar-dump", "identidade-banco", "sentinela"].includes(n)) {
      await this.conferir(e.ids.db, "db", e.imagemPapeis.db, true);
      this.autorizar(signal);
      const x = await e.criarExec(n);
      r.id = x.id;
      this.handles.set(x.id, x);
      await this.registro(r, "exec-id");
      this.autorizar(signal);
      await e.iniciarExec(x, signal);
      this.autorizar(signal);
      return x;
    }
    if (n === "daemon") return bytes(JSON.stringify({ ID: "EngineFake-explicito" }) + "\n");
    if (n === "config-quiet") return bytes("");
    if (n === "servicos") return bytes("app\ndb\ncaddy\n");
    if (n === "config")
      return bytes(
        JSON.stringify({
          name: m.projeto,
          services: {
            app: { image: m.revisoes[rev].imagem },
            db: {
              image: "postgres:17-bookworm",
              volumes: [{ type: "volume", source: "dados", target: "/var/lib/postgresql/data" }],
            },
            caddy: { image: "sintese/proxy:fixo" },
          },
          volumes: { dados: { name: `${m.projeto}-dados` } },
        }) + "\n",
      );
    if (n === "ids") return bytes([e.ids[e.atual], e.ids.db, e.ids.caddy].join("\n") + "\n");
    if (n === "inspecionar") {
      const raws = [];
      for (const [id, papel, image] of [
        [e.ids[e.atual], "app", e.imagens.get(e.atual).id],
        [e.ids.db, "db", e.imagemPapeis.db],
        [e.ids.caddy, "caddy", e.imagemPapeis.caddy],
      ])
        raws.push(await this.conferir(id, papel, image, true));
      return bytes(JSON.stringify(raws) + "\n");
    }
    if (n === "construir") {
      this.pin();
      e.evento("pin-conferido");
      conferirFonte(`${v.host}/${rev}`, v.inventarios[rev]);
      this.autorizar(signal);
      await e.build(rev, receitaBuild(m, rev));
      return bytes("");
    }
    if (n === "revisao-imagem") {
      const im = e.imagens.get(rev);
      exigir(
        im.config?.Config.Labels["org.opencontainers.image.revision"] === m.revisoes[rev].commit,
        "OCI",
      );
      return bytes(im.config.Config.Labels["org.opencontainers.image.revision"] + "\n");
    }
    if (n === "validar-imagem" || n === "subir") {
      const papel = n === "subir" ? "app" : "leitor",
        image = e.imagens.get(rev).id;
      const im = e.imagens.get(rev);
      exigir(rev === "B" && im.bytes, "FASE");
      exigir(
        im.config?.Id === image &&
          im.config.Config.Labels["org.opencontainers.image.revision"] === m.revisoes[rev].commit &&
          hash(im.bytes) === m.migradorSha256,
        "OCI",
      );
      this.pin();
      this.autorizar(signal);
      const id = await e.criar(papel, rev, receitaCriar(m, papel, rev));
      r.id = id;
      await this.registro(r, "create-id");
      this.autorizar(signal);
      await this.conferir(id, papel, image, false);
      this.autorizar(signal);
      await e.start(id);
      await this.conferir(id, papel, image, true);
      if (n === "subir") return bytes("");
      const conteudo = await e.attach(id),
        codigo = await e.wait(id);
      await this.conferir(id, papel, image, false);
      exigir(codigo === 0 && hash(conteudo) === m.migradorSha256, "OCI");
      // Remoção exclusiva previamente delimitada é coleta, não reabertura de autoridade.
      await e.remover(id);
      return bytes(conteudo);
    }
    if (n === "http-commit") return bytes(m.revisoes[e.atual].commit + "\n");
    if (n === "proxy-config") return bytes("proxy-config-estavel\n");
    throw falha("RECEITA");
  }
}
if (process.argv[2] === "--host-falso") {
  const m = JSON.parse(fs.readFileSync(process.argv[3])),
    e = new EngineFake(m),
    c = new Dispatcher(m, e);
  // Identidades alocadas antes de qualquer pedido são entregues fora do canal de comandos.
  gravar(`${m.vertical.raiz}/ids.json`, JSON.stringify(e.ids) + "\n");
  try {
    await atender(process.stdin, process.stdout, c);
  } catch (err) {
    process.stderr.write(`Dispatcher: ${err.code ?? err.message}\n`);
    process.exitCode = 1;
  } finally {
    gravar(
      `${m.vertical.raiz}/engine-final.json`,
      JSON.stringify({
        efeitos: e.efeitos,
        historico: c.historico,
        ledger: c.ledger,
        atual: e.atual,
        ids: e.ids,
        recursos: [...e.recursos.values()],
        filhosAtivos: e.filhos.size,
        capturas: e.captura.hashes,
        revogado: c.fechado,
      }) + "\n",
    );
  }
} else if (process.argv[2] === "--pgfake") {
  const n = process.argv[3];
  if (n === "dump") {
    const liberar = fs.createReadStream(null, { fd: 3, autoClose: true });
    for await (const _ of liberar) break;
    process.stderr.write(Buffer.from([0, 255, 13, 10, 83]));
    for (let i = 0; i < CARGA.length; i += 16381)
      await new Promise((resolve, reject) =>
        process.stdout.write(CARGA.subarray(i, i + 16381), (e) => (e ? reject(e) : resolve())),
      );
  } else if (n === "listar-dump") {
    const a = [];
    for await (const b of process.stdin) a.push(b);
    exigir(Buffer.concat(a).equals(CARGA), "PGFAKE_BYTES");
    process.stderr.write(Buffer.from([82, 0, 254, 10]));
    process.stdout.write("PGFake-listagem-confirmada\n");
  } else if (n === "identidade-banco") process.stdout.write("frequencia\n");
  else if (n === "sentinela") process.stdout.write("preservado\n");
  else throw falha("RECEITA");
}
