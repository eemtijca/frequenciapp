// Exercita receitas fechadas com processos e pipes reais, sem cliente Docker ou banco.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { test } from "./atualizacao-integracao-casos.mjs";

const aqui = fileURLToPath(import.meta.url);
const modulo = new URL("./atualizacao-integracao-adaptador.mjs", import.meta.url);
const carga = Buffer.from(Array.from({ length: 262193 }, (_, i) => i % 256));
const manifesto = {
  versao: 1,
  rodada: "ensaio-contrato",
  projeto: "atualizacao-contrato",
  revisoes: {
    A: { commit: "a".repeat(40), contextoSha256: "1".repeat(64), imagem: "ensaio/app:a" },
    B: { commit: "b".repeat(40), contextoSha256: "2".repeat(64), imagem: "ensaio/app:b" },
  },
  operacionalSha256: "3".repeat(64),
  migradorSha256: "4".repeat(64),
  banco: "frequencia",
  usuario: "frequencia",
  schema: "public",
};

function pedido(receita, revisao = "A", extra = {}) {
  const r = manifesto.revisoes[revisao];
  return {
    receita,
    revisao,
    commit: r.commit,
    contextoSha256: r.contextoSha256,
    operacionalSha256: manifesto.operacionalSha256,
    env: { APP_IMAGEM: r.imagem, COMMIT_SHA: r.commit },
    ...extra,
  };
}
function coletor() {
  const partes = [];
  return {
    partes,
    stream: new Writable({
      highWaterMark: 1024,
      write(bytes, _encoding, cb) {
        partes.push(Buffer.from(bytes));
        setImmediate(cb);
      },
    }),
    bytes: () => Buffer.concat(partes),
  };
}

// O fake aloca identidades antes e independentemente dos argumentos do consumidor.
class EngineFalso {
  constructor() {
    this.recursos = new Map();
    this.efeitos = [];
    this.filhos = new Set();
    this.dump = null;
  }
  async criar(papel, especificacao) {
    const id = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    const independente = {
      papel: "db",
      imagem: "fixture-banco",
      rodada: manifesto.rodada,
      projeto: manifesto.projeto,
      rede: "none",
      somenteLeitura: true,
      usuario: "65534:65534",
      capacidades: [],
      nnp: true,
      memoria: 268435456,
      pids: 64,
      healthcheck: false,
      autoremove: false,
      portas: [],
      mounts: [],
    };
    assert.deepEqual(especificacao, independente);
    this.recursos.set(id, { id, papel, especificacao: independente, running: false, codigo: 0 });
    this.efeitos.push({ tipo: "criar", papel, id });
    return id;
  }
  async inspecionar(id) {
    const r = this.recursos.get(id);
    assert.ok(r, "inspect precisa usar um ID alocado pelo engine");
    this.efeitos.push({ tipo: "inspect", id });
    return structuredClone(r);
  }
  async iniciar(id) {
    const r = this.recursos.get(id);
    assert.ok(r);
    r.running = true;
    this.efeitos.push({ tipo: "start", id });
  }
  async criarExec(id, receita) {
    return { id: randomUUID(), recurso: id, receita };
  }
  async iniciarExec(exec, { signal }) {
    const id = exec.recurso,
      receita = exec.receita;
    assert.ok(this.recursos.get(id)?.running);
    const execId = exec.id;
    const role = receita.nome;
    this.efeitos.push({ tipo: "exec", id, execId, role, argv: [...receita.argv] });
    const filho = spawn(process.execPath, [aqui, "--filho", role], {
      env: { PATH: "/usr/bin:/bin", HOME: process.env.TMPDIR, TMPDIR: process.env.TMPDIR },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.filhos.add(filho);
    let codigo = null;
    let sinal = null;
    const fim = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (code, sig) => {
        codigo = code;
        sinal = sig;
        this.filhos.delete(filho);
        resolve({ codigo: code, sinal: sig });
      });
    });
    fim.catch(() => {});
    const cancelar = () => filho.kill("SIGTERM");
    signal.addEventListener("abort", cancelar, { once: true });
    fim.finally(() => signal.removeEventListener("abort", cancelar)).catch(() => {});
    if (role === "dump") this.dump = filho;
    else if (role === "listar-dump") {
      assert.ok(this.dump && this.filhos.has(this.dump), "dump e listagem precisam coexistir");
      this.dump.stdin.end(Buffer.from([1]));
    }
    Object.assign(exec, {
      id: execId,
      stdin: role === "dump" ? new PassThrough() : filho.stdin,
      stdout: filho.stdout,
      stderr: filho.stderr,
      fim,
      confirmar: async () => {
        await fim;
        return { id: execId, running: false, codigo, sinal };
      },
    });
  }
}

if (process.argv[2] === "--filho") {
  const role = process.argv[3];
  if (role === "dump") {
    for await (const _ of process.stdin) break;
    process.stderr.write(Buffer.from([0, 255, 13, 10, 83]));
    for (let i = 0; i < carga.length; i += 16381) {
      const b = carga.subarray(i, i + 16381);
      await new Promise((resolve, reject) =>
        process.stdout.write(b, (e) => (e ? reject(e) : resolve())),
      );
    }
  } else if (role === "listar-dump") {
    const partes = [];
    for await (const b of process.stdin) partes.push(b);
    assert.deepEqual(Buffer.concat(partes), carga);
    process.stdout.write(Buffer.from([76, 0, 255, 10]));
    process.stderr.write(Buffer.from([82, 0, 254, 10]));
  } else {
    process.stderr.write("papel de fixture desconhecido\n");
    process.exitCode = 79;
  }
} else {
  test("vertical: dump/listagem simultâneos preservam binários e recusam enum antes do efeito", async () => {
    // A ausência da implementação é uma asserção do contrato, não falha de importação/coleta.
    assert.equal(fs.existsSync(modulo), true, "adaptador fechado ainda não implementado");
    const { Coordenador, atender, Cliente } = await import(modulo.href);
    const engine = new EngineFalso();
    const coordenador = new Coordenador(manifesto, engine);
    await coordenador.prepararBanco();
    const ida = new PassThrough({ highWaterMark: 1024 });
    const volta = new PassThrough({ highWaterMark: 1024 });
    const servidor = atender(ida, volta, coordenador);
    const cliente = new Cliente(volta, ida);
    const ponte = new PassThrough({ highWaterMark: 1024 });
    const saida = coletor(),
      errDump = coletor(),
      errLista = coletor();
    const dump = cliente.executar(pedido("dump"), { saida: ponte, erro: errDump.stream });
    const listar = cliente.executar(pedido("listar-dump"), {
      entrada: ponte,
      saida: saida.stream,
      erro: errLista.stream,
    });
    const [d, l] = await Promise.all([dump, listar]);
    assert.equal(d.codigo, 0);
    assert.equal(l.codigo, 0);
    assert.deepEqual(saida.bytes(), Buffer.from([76, 0, 255, 10]));
    assert.deepEqual(errDump.bytes(), Buffer.from([0, 255, 13, 10, 83]));
    assert.deepEqual(errLista.bytes(), Buffer.from([82, 0, 254, 10]));
    const antes = engine.efeitos.length;
    await assert.rejects(cliente.executar(pedido("shell")), { code: "RECEITA" });
    assert.equal(engine.efeitos.length, antes);
    const db = engine.efeitos.find((e) => e.tipo === "criar" && e.papel === "db");
    const execs = engine.efeitos.filter((e) => e.tipo === "exec");
    assert.equal(execs.length, 2);
    for (const e of execs)
      assert.equal(e.id, db.id, "posição do ID deve apontar para o banco criado");
    assert.equal(engine.filhos.size, 0);
    await cliente.fechar();
    await servidor;
  });
}
