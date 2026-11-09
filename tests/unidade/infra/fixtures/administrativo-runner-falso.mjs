// Cliente FADM real em subprocesso; não conhece paths host, socket ou IDs físicos.
import assert from "node:assert/strict";
import { escreverFrame } from "../../../isolamento/administrativo/escritor.mjs";
import { lerFrames } from "../../../isolamento/administrativo/leitor.mjs";
import { TIPOS_FRAME as T } from "../../../isolamento/administrativo/protocolo.mjs";
const modo = process.argv[2] ?? "normal";
const sequencias = new Map();
const receber = lerFrames(process.stdin);
async function enviar(tipo, requestId, corpo = {}) {
  const sequencia = sequencias.get(requestId) ?? 0;
  sequencias.set(requestId, sequencia + 1);
  await escreverFrame(process.stdout, {
    tipo,
    requestId,
    sequencia,
    flags: 0,
    payload: Buffer.isBuffer(corpo) ? corpo : Buffer.from(JSON.stringify(corpo)),
  });
}
async function proximo(tipo) {
  const frame = (await receber.next()).value;
  assert.equal(frame?.tipo, tipo);
  return frame;
}
async function pedido(id, corpo) {
  await enviar(T.REQUEST, id, corpo);
  await proximo(T.ACCEPTED);
  const frame = await proximo(T.RESULT);
  // O wire jamais pode conter o ID físico alocado pelo Engine falso.
  assert.doesNotMatch(frame.payload.toString(), /[a-f0-9]{64}/);
  return JSON.parse(frame.payload.toString());
}
async function executar() {
  assert.deepEqual(Object.keys(process.env).sort(), ["NODE_ENV"]);
  if (modo === "pendente") {
    await new Promise(() => {
      setInterval(() => {}, 1000);
    });
  }
  await enviar(T.HELLO, 0, { versao: 1 });
  await proximo(T.HELLO);
  if (modo === "sem-fim") {
    process.stdout.end();
    process.stdin.destroy();
    return;
  }
  const config = await pedido(1, { operacao: "consultarConfiguracao" });
  assert.equal(config.dados.servicos.length, 1);
  const { handle } = config.dados.servicos[0];
  assert.match(handle, /^[a-f0-9]{32}$/);
  if (modo === "campo-extra" || modo === "id-alheio") {
    await enviar(T.REQUEST, 2, {
      operacao: "consultarServico",
      servico: modo === "id-alheio" ? "f".repeat(64) : handle,
      ...(modo === "campo-extra" ? { argv: ["sh"] } : {}),
    });
    for await (const frame of receber) assert.notEqual(frame.tipo, T.RESULT);
    process.stdin.destroy();
    return;
  }
  const servico = await pedido(2, { operacao: "consultarServico", servico: handle });
  assert.equal(servico.dados.estado, "iniciado");
  await enviar(T.REQUEST, 3, { operacao: "executar", servico: handle, variante: "dump" });
  await proximo(T.ACCEPTED);
  await enviar(T.STDIN, 3, Buffer.from([0, 255, 10, 0]));
  await enviar(T.STDIN_END, 3, Buffer.alloc(0));
  await enviar(T.WINDOW, 3, { stream: "stdout", bytes: 65536 });
  await enviar(T.WINDOW, 3, { stream: "stderr", bytes: 65536 });
  const blocos = [];
  for (;;) {
    const frame = (await receber.next()).value;
    assert.ok(frame);
    if (frame.tipo === T.STDOUT) blocos.push(frame.payload);
    else if (frame.tipo === T.RESULT) {
      assert.equal(JSON.parse(frame.payload.toString()).codigo, 0);
      break;
    } else assert.equal(frame.tipo, T.WINDOW);
  }
  assert.deepEqual(Buffer.concat(blocos), Buffer.from([0, 255, 100, 0]));
  await pedido(4, { operacao: "coletar" });
  await enviar(T.SESSION_END, 0);
  process.stderr.write("FADM:session-end-enviado\n");
  const fim = await proximo(T.SESSION_END);
  assert.equal(JSON.parse(fim.payload.toString()).codigo, 0);
  process.stderr.write("FADM:session-end-recebido\n");
  process.stdin.destroy();
  if (modo === "exit-invalido") process.exitCode = 17;
}
try {
  await executar();
} catch (erro) {
  console.error(erro);
  process.stdin.destroy();
  process.exitCode = 1;
}
