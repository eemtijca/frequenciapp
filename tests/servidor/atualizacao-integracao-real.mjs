// Coordena o ensaio real A/B no Host1000; a CLI é deliberadamente explícita.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { atender, limitado, escrever } from "./atualizacao-integracao-adaptador.mjs";
import {
  lerManifesto,
  exigir,
  falha,
  hash,
  iguais,
  validarPedidoReal,
  vinculo,
  idDocker,
} from "./atualizacao-integracao-real-contrato.mjs";
import { prepararRuntime, gravar } from "./atualizacao-integracao-real-fontes.mjs";
import { LedgerReal, EngineDockerReal } from "./atualizacao-integracao-real-engine.mjs";
import { PRAZO_ATUALIZAR_MS } from "./atualizacao-integracao-real-root.mjs";
export const PRAZO_SESSAO_ROOT_MS = PRAZO_ATUALIZAR_MS + 15_000;
export async function encerrarRootNoErro(engine, id) {
  try {
    await engine.parar(id);
    const codigo = await engine.wait(id);
    return {
      exitConfirmado: Number.isInteger(codigo),
      removido: false,
      codigo: Number.isInteger(codigo) ? codigo : null,
    };
  } catch (e) {
    return { exitConfirmado: false, removido: false, causa: e.code ?? "PARAR" };
  }
}
function leitura(bytes) {
  const stdin = new Writable({
      write(_b, _e, cb) {
        cb();
      },
    }),
    stdout = Readable.from([Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)]),
    stderr = Readable.from([]),
    id = randomUUID();
  return {
    id,
    stdin,
    stdout,
    stderr,
    fim: Promise.resolve({ codigo: 0, sinal: null }),
    confirmar: async () => ({ id, running: false, codigo: 0, sinal: null }),
  };
}
export class CoordenadorReal {
  constructor(runtime, engine, ledger, binding) {
    this.runtime = runtime;
    this.m = runtime.produto;
    this.engine = engine;
    this.ledger = ledger;
    this.binding = binding;
    this.fechado = false;
    this.pendentes = new Map();
    this.handles = new Map();
    this.historico = [];
    this.pin = null;
  }
  autorizar(signal) {
    exigir(!this.fechado, "REVOGADO");
    exigir(!signal?.aborted, "CANCELADO");
  }
  validar(p) {
    this.autorizar();
    validarPedidoReal(this.m, p, this.binding);
  }
  revogar() {
    this.fechado = true;
  }
  async fechar() {
    this.revogar();
    exigir(!this.pendentes.size && !this.handles.size, "ATIVOS");
    return this.historico;
  }
  async abrir(p, signal) {
    this.validar(p);
    const r = { op: randomUUID(), receita: p.receita, id: null, fase: "INTENT" };
    this.pendentes.set(r.op, r);
    try {
      await this.ledger.registrar("INTENT", r);
      this.autorizar(signal);
      const h = await this.#despachar(p, r, signal);
      r.id ??= h.id;
      this.handles.set(h.id, h);
      await this.ledger.registrar("ENVIADO", r);
      this.autorizar(signal);
      let confirmacao;
      return {
        ...h,
        confirmar: (f) =>
          (confirmacao ??= (async () => {
            const c = await h.confirmar();
            exigir(
              c.id === h.id &&
                !c.running &&
                c.codigo === f.codigo &&
                c.sinal === f.sinal &&
                Number.isInteger(f.codigo) &&
                f.sinal === null,
              "CONCLUSAO",
            );
            await this.ledger.registrar("CONFIRMADO", { ...r, codigo: f.codigo });
            this.handles.delete(h.id);
            this.pendentes.delete(r.op);
            this.historico.push({ ...r, codigo: f.codigo });
            return c;
          })()),
      };
    } catch (e) {
      r.erro = e.code ?? "INTERNO";
      this.revogar();
      await this.ledger.registrar("INCERTO", r);
      throw e;
    }
  }
  async #despachar(p, r, signal) {
    const e = this.engine,
      n = p.receita;
    if (
      [
        "dump",
        "listar-dump",
        "identidade-banco",
        "sentinela",
        "criar-recuperacao",
        "recuperar",
        "sentinela-recuperada",
        "http-commit",
        "proxy-config",
      ].includes(n)
    ) {
      if (p.prova) {
        exigir(this.pin && iguais(p.prova, this.pin), "PIN_DIVERGENTE");
      }
      const x = await e.criarExec(n, signal);
      r.id = x.id;
      await this.ledger.registrar("EXEC_ID", r);
      this.autorizar(signal);
      return e.iniciarExec(x, signal);
    }
    if (n === "daemon") return leitura(JSON.stringify(await e.daemon()) + "\n");
    if (n === "ids") return leitura([e.ids[e.atual], e.ids.db, e.ids.caddy].join("\n") + "\n");
    if (n === "config" || n === "config-quiet" || n === "servicos")
      return leitura(await e.config(p.revisao, n === "config-quiet", n === "servicos"));
    if (n === "inspecionar") {
      const out = [];
      for (const id of [e.ids[e.atual], e.ids.db, e.ids.caddy])
        out.push(await e.inspect(id, "running"));
      return leitura(JSON.stringify(out) + "\n");
    }
    if (n === "construir") {
      exigir(this.pin === null, "FASE");
      this.pin = p.prova;
      await this.ledger.registrar("PIN_ROOT", { prova: p.prova });
      this.autorizar(signal);
      await e.build("B", signal);
      return leitura("");
    }
    if (n === "revisao-imagem") {
      const im = await e.imagem(p.revisao);
      return leitura(im.Config.Labels["org.opencontainers.image.revision"] + "\n");
    }
    if (n === "validar-imagem") {
      exigir(this.pin && p.revisao === "B", "PIN");
      return leitura(await e.coletarLeitor("B", signal));
    }
    if (n === "subir") {
      exigir(this.pin && iguais(this.pin, p.prova), "PIN_DIVERGENTE");
      await e.subirB(signal);
      return leitura(JSON.stringify(e.ids) + "\n");
    }
    throw falha("RECEITA");
  }
}
export function argumentosReal(args) {
  exigir(
    args.length === 2 &&
      args[0] === "--executar" &&
      path.isAbsolute(args[1]) &&
      path.resolve(args[1]) === args[1],
    "ARGUMENTOS",
  );
  return args[1];
}
async function sessaoRoot(runtime, engine, ledger, modo, signal) {
  const id = await engine.criar("root", "A", modo, signal),
    io = await engine.attach(id),
    binding = vinculo(runtime.manifesto, id, runtime.inputsSha256, runtime.bootstrapSha256),
    c = new CoordenadorReal(runtime, engine, ledger, binding),
    stderr = [];
  const colher = (async () => {
    let n = 0;
    for await (const b of io.stderr) {
      n += b.length;
      exigir(n <= 1024 * 1024, "ROOT_STDERR_LIMITE");
      stderr.push(Buffer.from(b));
    }
  })();
  colher.catch(() => {});
  // O consumidor está ligado antes de liberar a barreira do Root.
  const servir = atender(io.stdout, io.stdin, c);
  servir.catch(() => {});
  const abort = () => {
    c.revogar();
    io.socket.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await engine.start(id, signal);
    const body = Buffer.from(JSON.stringify(binding)),
      cab = Buffer.alloc(4);
    cab.writeUInt32BE(body.length);
    await escrever(io.stdin, Buffer.concat([cab, body]));
    await limitado(Promise.all([servir, io.pump, colher]), PRAZO_SESSAO_ROOT_MS);
    await limitado(io.close);
    const code = await engine.wait(id);
    await ledger.raw("root-stderr", Buffer.concat(stderr));
    exigir(code === 0 && !signal.aborted, "ROOT_CODIGO");
    const linhas = Buffer.concat(stderr)
      .toString()
      .split("\n")
      .filter((l) => l.startsWith("REAL_ROOT_FIM="));
    exigir(linhas.length === 1, "ROOT_RESULTADO");
    const token = linhas[0].slice("REAL_ROOT_FIM=".length),
      bytes = Buffer.from(token, "base64");
    exigir(bytes.toString("base64") === token, "ROOT_RESULTADO");
    const result = JSON.parse(bytes);
    exigir(
      result.versao === 1 &&
        result.modo === modo &&
        iguais(result.vinculo, binding) &&
        result.estado.bloqueado === false &&
        result.estado.operacoes.length === 1,
      "ROOT_RESULTADO",
    );
    await ledger.registrar("ROOT_RESULTADO", { id, result });
    exigir(!signal.aborted, "CANCELADO");
    await engine.remover(id);
    return result;
  } catch (e) {
    await encerrarRootNoErro(engine, id);
    c.revogar();
    engine.revogar();
    io.socket.destroy();
    await limitado(Promise.allSettled([servir, io.pump, colher, io.close])).catch(() => {});
    throw e;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export async function executarReal(arquivo) {
  const m = lerManifesto(arquivo),
    base = path.dirname(arquivo),
    runtime = prepararRuntime(m, `${base}/fontes`, `${base}/fontes/node_modules`);
  fs.mkdirSync(`${m.diretorio}/docker-vazio`, { mode: 0o700 });
  const ledger = new LedgerReal(m.diretorio),
    engine = new EngineDockerReal(runtime, ledger),
    abort = new AbortController();
  const sinal = () => {
    abort.abort(falha("SINAL"));
    engine.revogar();
  };
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, sinal);
  try {
    await engine.inicializar();
    await engine.saude("A", abort.signal);
    const antes = {
      ids: structuredClone(engine.ids),
      sentinela: (await engine.executarPequeno("sentinela", null, abort.signal)).toString(),
      migracoes: (await engine.executarPequeno("migracoes", null, abort.signal)).toString(),
    };
    exigir(
      antes.sentinela === m.rodada + "\n" &&
        /^[a-f0-9-]{36}:[a-f0-9]{64}:1\n$/.test(antes.migracoes),
      "BASELINE_PG",
    );
    await ledger.registrar("BASELINE", antes);
    const root = await sessaoRoot(runtime, engine, ledger, "atualizar", abort.signal);
    const depois = {
      ids: structuredClone(engine.ids),
      sentinela: (await engine.executarPequeno("sentinela", null, abort.signal)).toString(),
      migracoes: (await engine.executarPequeno("migracoes", null, abort.signal)).toString(),
      http: (await engine.executarPequeno("http-commit", null, abort.signal)).toString(),
    };
    exigir(
      depois.ids.db === antes.ids.db &&
        depois.ids.caddy === antes.ids.caddy &&
        depois.ids.A === antes.ids.A &&
        idDocker(depois.ids.B) &&
        depois.sentinela === antes.sentinela &&
        depois.migracoes === antes.migracoes &&
        depois.http === runtime.produto.revisoes.B.commit + "\n" &&
        root.recuperacao === "sentinela-conferida",
      "PROVA_AB",
    );
    const reabertura = await sessaoRoot(runtime, engine, ledger, "estado", abort.signal);
    exigir(
      iguais(root.estado, reabertura.estado) && iguais(root.arquivos, reabertura.arquivos),
      "DURABILIDADE",
    );
    await engine.close();
    exigir(!abort.signal.aborted, "CANCELADO");
    const resultado = {
      versao: 1,
      perfil: "real-operacional",
      rodada: m.rodada,
      antes,
      depois,
      root,
      reabertura,
      volumesPreservados: ["dados", "socket", "http", "admin"],
      powerLossTestado: false,
      recursosPreservados: true,
    };
    gravar(`${m.diretorio}/resultado.json`, JSON.stringify(resultado) + "\n");
    return resultado;
  } catch (e) {
    engine.revogar();
    await ledger.registrar("FALHA_PRESERVAR", { causa: e.code ?? "INTERNO", ids: engine.ids });
    throw e;
  } finally {
    for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.off(s, sinal);
  }
}
let entradaDireta = false;
try {
  entradaDireta =
    Boolean(process.argv[1]) &&
    fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
} catch {}
if (entradaDireta) {
  try {
    const arquivo = argumentosReal(process.argv.slice(2));
    const r = await executarReal(arquivo);
    process.stdout.write(
      JSON.stringify({
        rodada: r.rodada,
        resultado: `${lerManifesto(arquivo).diretorio}/resultado.json`,
      }) + "\n",
    );
  } catch (e) {
    process.stderr.write(`Real recusou: ${e.code ?? e.message}\n`);
    process.exitCode = 78;
  }
}
