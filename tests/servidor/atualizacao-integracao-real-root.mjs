// Mantém controlador, fd9, pins e ponte Unix dentro do Root persistente confinado.
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { Cliente, atender, limitado } from "./atualizacao-integracao-adaptador.mjs";
import { pedidoPara } from "./atualizacao-integracao-receitas.mjs";
import { reconhecer } from "./atualizacao-integracao-shim.mjs";
import {
  AMBIENTE,
  gravar,
  copiarBootstrap,
  inventarioReal,
} from "./atualizacao-integracao-real-fontes.mjs";
import {
  exigir,
  falha,
  hash,
  iguais,
  arquivoProtegido,
  validarPedidoReal,
  validarProva,
  validarVinculo,
  raizRoot,
} from "./atualizacao-integracao-real-contrato.mjs";
export const PRAZO_ATUALIZAR_MS = 180_000 + 12 * 5_000;
export function aguardarComando(filho, prazoMs) {
  exigir(Number.isSafeInteger(prazoMs) && prazoMs > 0, "PRAZO");
  return new Promise((resolve, reject) => {
    let settled = false,
      estourou = false;
    const timer = setTimeout(() => {
      estourou = true;
      filho.kill("SIGKILL");
    }, prazoMs);
    const fim = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    filho.once("close", (codigo, sinal) =>
      fim(() =>
        estourou
          ? reject(Object.assign(falha("PRAZO"), { close: true, codigo, sinal }))
          : resolve({ codigo, sinal, close: true }),
      ),
    );
  });
}
export function conferirRootPersistente(m) {
  exigir(process.getuid() === 0, "ROOT");
  const s = fs.readFileSync("/proc/self/status", "utf8");
  exigir(/^CapEff:\s*0000000000000000$/m.test(s) && /^NoNewPrivs:\s*1$/m.test(s), "CONFINAMENTO");
  exigir(
    !fs.existsSync("/run/docker.sock") && !fs.existsSync("/var/run/docker.sock"),
    "SOCKET_DOCKER",
  );
  exigir(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length === 1, "REDE");
  const root = raizRoot(m),
    mounts = fs
      .readFileSync("/proc/self/mountinfo", "utf8")
      .trim()
      .split("\n")
      .map((l) => {
        const [a, b] = l.split(" - ");
        return { a: a.split(" "), b: b.split(" ") };
      });
  const admin = mounts.filter((l) => l.a[4] === root),
    rfs = mounts.filter((l) => l.a[4] === "/"),
    source = mounts.filter((l) => l.a[4] === "/bootstrap");
  exigir(
    admin.length === 1 &&
      !["tmpfs", "ramfs", "overlay"].includes(admin[0].b[0]) &&
      admin[0].a[5].split(",").includes("rw"),
    "PERSISTENCIA",
  );
  exigir(
    rfs.length === 1 &&
      rfs[0].a[5].split(",").includes("ro") &&
      source.length === 1 &&
      source[0].a[5].split(",").includes("ro"),
    "ROOTFS",
  );
  const st = fs.lstatSync(root);
  exigir(st.isDirectory() && !st.isSymbolicLink() && st.uid === 0, "OWNER");
  fs.chmodSync(root, 0o700);
  return { uid: 0, capEff: "0000000000000000", nnp: 1, persistente: true };
}
export function receberBinding(entrada, runtime) {
  return limitado(
    new Promise((resolve, reject) => {
      let b = Buffer.alloc(0);
      const limpar = () => {
        entrada.off("data", dados);
        entrada.off("end", eof);
        entrada.off("error", erro);
      };
      const erro = (e) => {
          limpar();
          reject(e);
        },
        eof = () => erro(Object.assign(new Error("BINDING_EOF"), { code: "BINDING_EOF" }));
      const dados = (p) => {
        try {
          b = Buffer.concat([b, p]);
          exigir(b.length <= 2048, "BINDING_LIMITE");
          if (b.length < 4) return;
          const n = b.readUInt32BE();
          exigir(n > 0 && n <= 1024, "BINDING_LIMITE");
          if (b.length < 4 + n) return;
          exigir(b.length === 4 + n, "BINDING_EXTRA");
          const v = JSON.parse(b.subarray(4));
          validarVinculo(v, {
            ...v,
            versao: 1,
            rodada: runtime.manifesto.rodada,
            inputsSha256: runtime.inputsSha256,
            fontesSha256: runtime.bootstrapSha256,
          });
          exigir(/^[a-f0-9]{64}$/.test(v.rootId), "BINDING");
          entrada.pause();
          limpar();
          resolve(v);
        } catch (e) {
          erro(e);
        }
      };
      entrada.on("data", dados);
      entrada.once("end", eof);
      entrada.once("error", erro);
    }),
  );
}
export function pedidoRoot(runtime, binding, receita, revisao = "B", prova = null) {
  const m = runtime.produto,
    r = m.revisoes[revisao];
  const p = {
    receita,
    revisao,
    commit: r.commit,
    contextoSha256: r.contextoSha256,
    env: { APP_IMAGEM: r.imagem, COMMIT_SHA: r.commit },
    operacionalSha256: m.operacionalSha256,
    vinculo: binding,
  };
  if (prova) p.prova = prova;
  return p;
}
export async function extrairProva(runtime, binding, { concluida = false } = {}) {
  exigir(process.getuid() === 0, "ROOT");
  const v = runtime.produto.vertical;
  const { autorizar, verificarPin } = await import(
    pathToFileURL(`${v.prefixo}/snapshot/scripts/servidor/controlador/contrato.mjs`).href
  );
  const perfil = autorizar(`${v.prefixo}/perfil.json`, "atualizar"),
    journal = `${perfil.dados}/journal`;
  const ops = fs
    .readdirSync(journal)
    .filter((n) => fs.existsSync(`${journal}/${n}/concluida.json`) === concluida);
  exigir(ops.length === 1, "PIN");
  const op = ops[0],
    pin = verificarPin(perfil, op),
    base = `${perfil.dados}/pins/${op}`;
  const lock = fs.statSync(`${perfil.locks}/operacoes-${perfil.alvo}.lock`, { bigint: true }),
    fd = fs.fstatSync(9, { bigint: true });
  exigir(lock.dev === fd.dev && lock.ino === fd.ino, "PIN_LOCK");
  const arquivos = pin.arquivos.map((a) => {
    const b = arquivoProtegido(`${base}/${a.nome}`, 0);
    exigir(hash(b) === a.sha256, "PIN");
    return { ...a, bytes: b.length };
  });
  const cifra = arquivos.find((a) => a.nome.endsWith(".dump.age"));
  exigir(cifra, "PIN_CIFRA");
  exigir(
    arquivoProtegido(`${base}/${cifra.nome}`, 0)
      .subarray(0, Buffer.byteLength("age-encryption.org/v1\n"))
      .toString() === "age-encryption.org/v1\n",
    "PIN_CIFRA",
  );
  const p = {
    versao: 1,
    vinculo: binding,
    operacao: op,
    alvo: perfil.alvo,
    commit: runtime.produto.revisoes.B.commit,
    contextoSha256: runtime.produto.revisoes.B.contextoSha256,
    pinSha256: hash(arquivoProtegido(`${base}/pin.json`, 0)),
    cifra: { ...cifra, formato: "age-encryption.org/v1" },
    arquivos,
    lock: { dev: lock.dev.toString(), ino: lock.ino.toString() },
  };
  validarProva(p, binding, runtime.produto);
  return p;
}
async function comando(bin, args, { cwd, env = AMBIENTE, entrada = null, prazo = 15000 } = {}) {
  const p = spawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] }),
    out = [],
    err = [];
  let error = null,
    n = 0;
  const colher = (a) => (b) => {
    n += b.length;
    exigir(n <= 32 * 1024 * 1024, "COMANDO_LIMITE");
    a.push(Buffer.from(b));
  };
  p.stdout.on("data", colher(out));
  p.stderr.on("data", colher(err));
  p.on("error", (e) => {
    error = e.code;
  });
  p.stdin.on("error", () => {});
  p.stdin.end(entrada);
  const fim = await aguardarComando(p, prazo);
  exigir(error === null && fim.codigo === 0 && fim.sinal === null, "COMANDO_ROOT");
  return { ...fim, stdout: Buffer.concat(out), stderr: Buffer.concat(err) };
}
const destino = (stream) =>
  new Writable({
    write(b, _e, cb) {
      stream.write(b, cb);
    },
  });
async function abrirPonte(runtime, binding, cliente) {
  const conexoes = new Set(),
    tarefas = new Set(),
    v = runtime.produto.vertical;
  if (!fs.existsSync(`${v.raiz}/canal`)) fs.mkdirSync(`${v.raiz}/canal`, { mode: 0o700 });
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    conexoes.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => conexoes.delete(socket));
    let revogado = false;
    const pendentes = new Set();
    const c = {
      historico: [],
      validar(p) {
        exigir(!revogado, "REVOGADO");
        validarPedidoReal(runtime.produto, p, binding);
      },
      revogar() {
        revogado = true;
      },
      async fechar() {
        revogado = true;
        exigir(!pendentes.size, "ATIVOS");
        return this.historico;
      },
      async abrir(p, signal) {
        this.validar(p);
        const id = randomUUID(),
          stdin = new PassThrough({ highWaterMark: 1024 }),
          stdout = new PassThrough({ highWaterMark: 1024 }),
          stderr = new PassThrough({ highWaterMark: 1024 });
        pendentes.add(id);
        const r = cliente.executar(p, { entrada: stdin, saida: stdout, erro: stderr, signal });
        r.catch(() => {});
        const fim = r.then((x) => ({ codigo: x.codigo, sinal: x.sinal }));
        fim.catch(() => {});
        return {
          id,
          stdin,
          stdout,
          stderr,
          fim,
          confirmar: async () => {
            const x = await r;
            pendentes.delete(id);
            c.historico.push({ id, remoto: x.id, receita: p.receita });
            return { id, running: false, codigo: x.codigo, sinal: x.sinal };
          },
        };
      },
    };
    const t = atender(socket, socket, c);
    tarefas.add(t);
    t.then(
      () => tarefas.delete(t),
      () => tarefas.delete(t),
    );
    t.catch(() => socket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(v.socket, resolve);
  });
  fs.chmodSync(v.socket, 0o600);
  return async () => {
    await limitado(Promise.all([...tarefas]));
    await limitado(
      new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
    );
    exigir(!conexoes.size, "CONEXOES");
  };
}
export async function shimReal(arquivo, bin, argv) {
  exigir(process.getuid() === 0, "ROOT");
  const runtime = JSON.parse(arquivoProtegido(arquivo, 0)),
    v = runtime.produto.vertical,
    binding = JSON.parse(arquivoProtegido(`${v.raiz}/binding.json`, 0));
  const ids = JSON.parse(arquivoProtegido(`${v.raiz}/ids.json`, 0));
  const base = reconhecer(runtime.produto, bin, argv, process.env, process.cwd(), ids);
  if (["dump", "construir", "subir"].includes(base.receita)) {
    const { autorizar } = await import(
      pathToFileURL(`${v.prefixo}/snapshot/scripts/servidor/controlador/contrato.mjs`).href
    );
    autorizar(`${v.prefixo}/perfil.json`, "atualizar");
  }
  const prova = ["construir", "subir"].includes(base.receita)
    ? await extrairProva(runtime, binding)
    : null;
  const p = { ...base, vinculo: binding, ...(prova ? { prova } : {}) };
  validarPedidoReal(runtime.produto, p, binding);
  const socket = net.createConnection(v.socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const cliente = new Cliente(socket, socket),
    out = [];
  const saida =
    base.receita === "subir"
      ? new Writable({
          write(b, _e, cb) {
            out.push(Buffer.from(b));
            cb();
          },
        })
      : destino(process.stdout);
  try {
    const r = await cliente.executar(p, {
      entrada: base.receita === "listar-dump" ? process.stdin : null,
      saida,
      erro: destino(process.stderr),
    });
    await cliente.fechar();
    if (base.receita === "subir" && r.codigo === 0) {
      const novos = JSON.parse(Buffer.concat(out));
      exigir(
        novos.A === ids.A &&
          novos.db === ids.db &&
          novos.caddy === ids.caddy &&
          /^[a-f0-9]{64}$/.test(novos.B),
        "ID",
      );
      fs.writeFileSync(`${v.raiz}/ids.json`, JSON.stringify(novos) + "\n", { mode: 0o600 });
      gravar(`${v.raiz}/subiu`, "B\n");
    }
    return r.codigo;
  } catch (e) {
    await cliente.fechar().catch(() => {});
    throw e;
  }
}
function opsRoot(runtime) {
  const v = runtime.produto.vertical;
  return {
    COMPOSE_PROJECT_NAME: runtime.produto.projeto,
    COMPOSE_ARQUIVOS: "compose.yml",
    BACKUP_PLANILHAS_HABILITADO: "false",
    ATUALIZAR_MODO: "main",
    ATUALIZAR_PERMITIR_BACKUP_LOCAL: "true",
    ATUALIZAR_ESPACO_MINIMO_MB: "0",
    ATUALIZAR_SAUDE_URL: "https://sintetico.invalid/api/saude",
    ATUALIZAR_VERIFICAR_SAUDE_PUBLICA: "false",
    APP_IMAGEM_REPOSITORIO: `ensaio/real-${runtime.manifesto.rodada}`,
    APP_IMAGEM_BACKUP_REPOSITORIO: "ensaio/backup",
    BACKUP_CRIPTOGRAFIA: "age",
    BACKUP_AGE_DESTINATARIOS: `${v.raiz}/destinatarios.age`,
    BACKUP_AGE_DESTINATARIOS_SHA256: hash(fs.readFileSync(`${v.raiz}/destinatarios.age`)),
    BACKUP_ESPACO_MINIMO_MB: "0",
    BACKUP_REMOTO: "",
    BACKUP_RCLONE_CONFIG: "",
    ESTADO_DIR: `${v.raiz}/legado`,
  };
}
async function recuperar(runtime, binding) {
  const p = await extrairProva(runtime, binding, { concluida: true }),
    v = runtime.produto.vertical,
    socket = net.createConnection(v.socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const cli = new Cliente(socket, socket);
  const executar = async (nome, entrada = null) => {
    const a = [];
    const out = new Writable({
      write(b, _e, cb) {
        a.push(Buffer.from(b));
        cb();
      },
    });
    const r = await cli.executar(pedidoRoot(runtime, binding, nome, "B", p), {
      entrada,
      saida: out,
    });
    exigir(r.codigo === 0, "RECUPERACAO");
    return Buffer.concat(a);
  };
  try {
    await executar("criar-recuperacao");
    const age = spawn(
      "/usr/bin/age",
      [
        "--decrypt",
        "--identity",
        `${v.raiz}/age-privada.txt`,
        `${v.prefixo}/dados/pins/${p.operacao}/${p.cifra.nome}`,
      ],
      { env: AMBIENTE, stdio: ["ignore", "pipe", "pipe"] },
    );
    let error = null,
      stderr = 0;
    age.on("error", (e) => {
      error = e.code;
    });
    age.stderr.on("data", (b) => {
      stderr += b.length;
    });
    const close = new Promise((resolve) =>
      age.once("close", (codigo, sinal) => resolve({ codigo, sinal })),
    );
    await executar("recuperar", age.stdout);
    const f = await limitado(close);
    exigir(!error && f.codigo === 0 && f.sinal === null && stderr === 0, "AGE_RECUPERACAO");
    exigir(
      (await executar("sentinela-recuperada")).toString() === runtime.manifesto.rodada + "\n",
      "RECUPERACAO_SENTINELA",
    );
    await cli.fechar();
    return p;
  } catch (e) {
    await cli.fechar().catch(() => {});
    throw e;
  }
}
export async function rootReal(modo) {
  const runtime = JSON.parse(arquivoProtegido("/bootstrap/runtime.json", 1000)),
    v = runtime.produto.vertical;
  conferirRootPersistente(runtime.manifesto);
  copiarBootstrap(runtime);
  const binding = await receberBinding(process.stdin, runtime);
  if (fs.existsSync(`${v.raiz}/binding.json`))
    fs.writeFileSync(`${v.raiz}/binding.json`, JSON.stringify(binding) + "\n");
  else gravar(`${v.raiz}/binding.json`, JSON.stringify(binding) + "\n");
  const cliente = new Cliente(process.stdin, process.stdout);
  process.stdin.resume();
  const fecharPonte = await abrirPonte(runtime, binding, cliente);
  let result;
  try {
    const out = [],
      saida = new Writable({
        write(b, _e, cb) {
          out.push(Buffer.from(b));
          cb();
        },
      });
    const r = await cliente.executar(pedidoRoot(runtime, binding, "ids", "A"), { saida });
    exigir(r.codigo === 0, "IDS");
    const lista = Buffer.concat(out).toString().trim().split("\n");
    exigir(lista.length === 3 && lista.every((x) => /^[a-f0-9]{64}$/.test(x)), "IDS");
    if (modo === "atualizar")
      gravar(
        `${v.raiz}/ids.json`,
        JSON.stringify({ A: lista[0], db: lista[1], caddy: lista[2], B: null }) + "\n",
      );
    else {
      const ids = JSON.parse(arquivoProtegido(`${v.raiz}/ids.json`, 0));
      exigir(lista[0] === ids.B && lista[1] === ids.db && lista[2] === ids.caddy, "IDS");
    }
    const arquivo = `${v.raiz}/runtime.json`,
      shim = "/bootstrap/fonte/tests/servidor/atualizacao-integracao-real-root.mjs";
    if (modo === "atualizar") {
      fs.mkdirSync(v.bin, { mode: 0o700 });
      for (const bin of ["docker", "curl"])
        gravar(
          `${v.bin}/${bin}`,
          `#!/bin/sh\n# Receita fechada; nunca recebe um programa do operador.\nexec /usr/local/bin/node ${shim} --shim ${arquivo} ${bin} "$@"\n`,
          0o700,
        );
      fs.mkdirSync(v.config, { mode: 0o700 });
      await comando("/usr/bin/age-keygen", ["-o", `${v.raiz}/age-privada.txt`], { cwd: v.raiz });
      const publica = (
        await comando("/usr/bin/age-keygen", ["-y", `${v.raiz}/age-privada.txt`], { cwd: v.raiz })
      ).stdout;
      gravar(`${v.raiz}/destinatarios.age`, publica);
      gravar(`${v.config}/app.env`, "POSTGRES_USER=frequencia\nPOSTGRES_DB=frequencia\n");
      const ops = opsRoot(runtime);
      gravar(
        `${v.config}/ops.env`,
        Object.entries(ops)
          .map(([k, val]) => `${k}='${val}'\n`)
          .join(""),
      );
      const env = {
        ...AMBIENTE,
        ...ops,
        PATH: `${v.bin}:${AMBIENTE.PATH}`,
        APP_DIR: v.app,
        APP_ENV_FILE: `${v.config}/app.env`,
        OPS_ENV_FILE: `${v.config}/ops.env`,
        SERVIDOR_IDENTIDADE_ARQUIVO: `${v.config}/identidade.json`,
        SERVIDOR_CONFIG_DIR: v.config,
        SERVIDOR_AMBIENTE_INJETADO: "true",
        SERVIDOR_LOCK_DIR: `${v.raiz}/locks`,
        POSTGRES_DB: "frequencia",
        POSTGRES_USER: "frequencia",
      };
      await comando(
        "/bin/bash",
        [`${v.fonte}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"],
        { cwd: v.raiz, env },
      );
      await comando(
        "/bin/bash",
        [
          `${v.fonte}/scripts/servidor/instalar-controlador.sh`,
          "--fonte",
          v.fonte,
          "--app",
          v.app,
          "--config",
          v.config,
          "--prefixo",
          v.prefixo,
          "--operador",
          "nobody",
          "--bin-dir",
          v.bin,
          "--confirmar",
        ],
        { cwd: v.raiz },
      );
      await comando(`${v.prefixo}/executar`, ["atualizar"], {
        cwd: v.raiz,
        prazo: PRAZO_ATUALIZAR_MS,
      });
      const perfil = JSON.parse(arquivoProtegido(`${v.prefixo}/perfil.json`, 0));
      const lock = `${perfil.locks}/operacoes-${perfil.alvo}.lock`,
        envRec = { ...AMBIENTE, SERVIDOR_ALVO_CHAVE: perfil.alvo };
      await comando(
        "/bin/bash",
        [
          "--noprofile",
          "--norc",
          "-c",
          'set -Eeuo pipefail; exec 9>"$1"; flock -x 9; exec /usr/local/bin/node "$2" --recuperar "$3"',
          "recuperacao",
          lock,
          shim,
          arquivo,
        ],
        { cwd: v.raiz, env: envRec },
      );
    } else exigir(modo === "estado", "MODO");
    const estado = await comando(`${v.prefixo}/executar`, ["estado"], { cwd: v.raiz }),
      perfil = JSON.parse(arquivoProtegido(`${v.prefixo}/perfil.json`, 0));
    const arquivos = {};
    for (const n of ["estado", "journal", "pins"]) {
      for (const [rel, met] of Object.entries(inventarioReal(`${perfil.dados}/${n}`, 0)))
        arquivos[`${n}/${rel}`] = met;
    }
    result = {
      versao: 1,
      vinculo: binding,
      modo,
      estado: JSON.parse(estado.stdout),
      arquivos,
      recuperacao: modo === "atualizar" ? "sentinela-conferida" : null,
    };
    await fecharPonte();
    await cliente.fechar();
    process.stderr.write(
      "REAL_ROOT_FIM=" + Buffer.from(JSON.stringify(result)).toString("base64") + "\n",
    );
    return result;
  } catch (e) {
    await fecharPonte().catch(() => {});
    await cliente.fechar().catch(() => {});
    throw e;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (
      process.argv.length === 4 &&
      process.argv[2] === "--root" &&
      ["atualizar", "estado"].includes(process.argv[3])
    )
      await rootReal(process.argv[3]);
    else if (process.argv.length >= 6 && process.argv[2] === "--shim")
      process.exitCode = await shimReal(process.argv[3], process.argv[4], process.argv.slice(5));
    else if (process.argv.length === 4 && process.argv[2] === "--recuperar") {
      const runtime = JSON.parse(arquivoProtegido(process.argv[3], 0)),
        binding = JSON.parse(arquivoProtegido(`${runtime.produto.vertical.raiz}/binding.json`, 0));
      await recuperar(runtime, binding);
    } else throw Object.assign(new Error("ARGUMENTOS"), { code: "ARGUMENTOS" });
  } catch (e) {
    process.stderr.write(`Root recusou: ${e.code ?? e.message}\n`);
    process.exitCode = 78;
  }
}
