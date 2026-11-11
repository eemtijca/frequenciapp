// Confere exclusão entre processos durante a migração sintética em curso.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { aguardarPronto, encerrarFilho } from "./filhos.mjs";
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

test("processos distintos não iniciam migração simultânea do mesmo alvo", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "controlador-processos-"));
  const filho = spawn(
    process.execPath,
    [join(dirname(fileURLToPath(import.meta.url)), "crash-filho.mjs"), raiz],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let diagnostico = "";
  filho.stderr.on("data", (parte) => {
    diagnostico += parte;
  });
  try {
    const pronto = await aguardarPronto(filho);
    assert.equal(pronto, "migracao-viva");
    const adaptador = criarAdaptadorEnsaio();
    await assert.rejects(executar({ raiz, alvo: "alvo-sintetico", adaptador }), /bloquead/i);
    assert.equal(adaptador.observar().migracoes, 0);
  } finally {
    const resultado = await encerrarFilho(filho);
    assert.deepEqual(resultado, { codigo: null, sinal: "SIGKILL" }, diagnostico);
  }
});
