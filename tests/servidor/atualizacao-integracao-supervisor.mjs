// Multiplexa conexões Unix privadas sobre um único vínculo STDIO supervisionado.
import fs from "node:fs";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { Cliente, atender, limitado } from "./atualizacao-integracao-adaptador.mjs";
import { exigir, validarPedido } from "./atualizacao-integracao-receitas.mjs";
import { AMBIENTE } from "./atualizacao-integracao-fontes.mjs";
const observado = (p) =>
  p.then(
    (valor) => ({ valor }),
    (erro) => ({ erro }),
  );
export async function abrirSupervisor(m, arquivo) {
  const engine = fileURLToPath(new URL("./atualizacao-integracao-engine.mjs", import.meta.url));
  const filho = spawn(process.execPath, [engine, "--host-falso", arquivo], {
    env: AMBIENTE,
    cwd: m.vertical.raiz,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stderr = [];
  filho.stderr.on("data", (b) => stderr.push(Buffer.from(b)));
  const close = new Promise((resolve, reject) => {
    filho.once("error", reject);
    filho.once("close", (codigo, sinal) => resolve({ codigo, sinal }));
  });
  close.catch(() => {});
  const cliente = new Cliente(filho.stdout, filho.stdin),
    conexoes = new Set(),
    tarefas = new Set();
  let fechado = false;
  fs.mkdirSync(`${m.vertical.raiz}/canal`, { mode: 0o700 });
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    conexoes.add(socket);
    socket.once("close", () => conexoes.delete(socket));
    let revogado = false;
    const pendentes = new Set(),
      historico = [];
    const proxy = {
      historico,
      validar(p) {
        exigir(!fechado && !revogado, "REVOGADO");
        validarPedido(m, p);
      },
      revogar() {
        revogado = true;
      },
      async fechar() {
        revogado = true;
        exigir(pendentes.size === 0, "ATIVOS");
        return historico;
      },
      async abrir(p, signal) {
        this.validar(p);
        const id = randomUUID(),
          stdin = new PassThrough({ highWaterMark: 1024 }),
          stdout = new PassThrough({ highWaterMark: 1024 }),
          stderr = new PassThrough({ highWaterMark: 1024 });
        pendentes.add(id);
        const resultado = cliente.executar(p, {
          entrada: stdin,
          saida: stdout,
          erro: stderr,
          signal,
        });
        resultado.catch(() => {});
        const fim = resultado.then((r) => ({ codigo: r.codigo, sinal: r.sinal }));
        fim.catch(() => {});
        return {
          id,
          stdin,
          stdout,
          stderr,
          fim,
          confirmar: async () => {
            const r = await resultado;
            pendentes.delete(id);
            historico.push({ id, remoto: r.id, receita: p.receita });
            return { id, running: false, codigo: r.codigo, sinal: r.sinal };
          },
        };
      },
    };
    const t = atender(socket, socket, proxy);
    tarefas.add(t);
    t.then(
      () => tarefas.delete(t),
      () => tarefas.delete(t),
    );
    t.catch((e) => {
      socket.destroy();
      process.stderr.write(`Supervisor: ${e.code ?? e.message}\n`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(m.vertical.socket, resolve);
  });
  fs.chmodSync(m.vertical.socket, 0o600);
  let encerramento;
  return {
    cliente,
    filho,
    close,
    fechar() {
      encerramento ??= (async () => {
        fechado = true;
        await limitado(Promise.all([...tarefas].map(observado)));
        await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
        let causa;
        try {
          await cliente.fechar();
        } catch (e) {
          causa = e;
        }
        const c = await limitado(close);
        exigir(c.codigo === 0 && c.sinal === null, "SUPERVISOR");
        exigir(conexoes.size === 0, "ATIVOS");
        if (causa) throw causa;
        return { ...c, stderr: Buffer.concat(stderr).toString("base64"), conexoes: conexoes.size };
      })();
      return encerramento;
    },
  };
}
