// Exercita os limites de espera dos filhos sintéticos sem clientes externos.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aguardarPronto, encerrarFilho } from "./filhos.mjs";

test("espera limitada rejeita no prazo mesmo com promessa pendente", async () => {
  const { comPrazo } = await import("./filhos.mjs");
  assert.equal(typeof comPrazo, "function");
  let rejeitarTarde;
  const pendente = new Promise((_, reject) => {
    rejeitarTarde = reject;
  });
  await assert.rejects(comPrazo(pendente, 30), /prazo/i);
  rejeitarTarde(new Error("falha tardia observada"));
  await new Promise((resolve) => setImmediate(resolve));
});

test("liberação antes de iniciar a migração não deixa o processo pendente", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "liberacao-"));
  const arquivo = join(dirname(fileURLToPath(import.meta.url)), "liberar-antes-filho.mjs");
  const filho = spawn(process.execPath, [arquivo, raiz], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  try {
    assert.equal(await aguardarPronto(filho, 1000), "concluida");
  } finally {
    await encerrarFilho(filho);
  }
});

test("setup abortado libera e finaliza operação ainda em preparação", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "liberacao-"));
  const arquivo = join(dirname(fileURLToPath(import.meta.url)), "liberar-antes-filho.mjs");
  const filho = spawn(process.execPath, [arquivo, raiz, "setup-abortado"], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  try {
    assert.deepEqual(await aguardarPronto(filho, 1500), {
      falha: "setup sintético abortado",
      estado: "concluida",
      migracoes: 1,
    });
  } finally {
    await encerrarFilho(filho);
  }
});

test("o filho que não envia prontidão é encerrado após prazo limitado", async () => {
  const filho = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let timer;
  try {
    await assert.rejects(
      Promise.race([
        aguardarPronto(filho, 100),
        new Promise((_, rejeitar) => {
          timer = setTimeout(() => rejeitar(new Error("a espera não aplicou o prazo")), 500);
        }),
      ]),
      /prazo de prontidão/i,
    );
  } finally {
    clearTimeout(timer);
    assert.deepEqual(await encerrarFilho(filho), { codigo: null, sinal: "SIGKILL" });
  }
});
