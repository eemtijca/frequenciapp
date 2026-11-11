// Verifica exclusão, bloqueio durável e falhas do ensaio sem clientes externos.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { aguardarPronto, comPrazo, encerrarFilho } from "./filhos.mjs";
import { createHash } from "node:crypto";
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

const alvo = "alvo-sintetico";
const pastaAlvo = (raiz) => join(raiz, createHash("sha256").update(alvo).digest("hex"));
const raizNova = () => mkdtemp(join(tmpdir(), "controlador-bloqueio-"));
const aguardar = async (condicao) => {
  for (let i = 0; i < 200; i++) {
    if (await condicao()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condição sintética não ocorreu");
};

test("exclui outra execução no mesmo alvo enquanto a migração está viva", async () => {
  const raiz = await raizNova();
  const adaptador = criarAdaptadorEnsaio({ bloquearEm: "migracao" });
  const primeira = executar({ raiz, alvo, adaptador });
  // Observa rejeição desde o início, inclusive quando a preparação falha primeiro.
  primeira.catch(() => {});
  try {
    await comPrazo(
      Promise.race([
        aguardar(() => adaptador.observar().vivo),
        primeira.then(() => {
          throw new Error("Migração não permaneceu pendente.");
        }),
      ]),
    );
    await comPrazo(
      assert.rejects(executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() }), /bloquead/i),
    );
    assert.equal(adaptador.observar().migracoes, 1);
  } finally {
    adaptador.liberar();
    await comPrazo(primeira);
  }
  assert.equal(
    (await comPrazo(executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() }))).estado,
    "concluida",
  );
});

test("falha na migração preserva evidência e impede uma tentativa posterior", async () => {
  const raiz = await raizNova();
  const adaptador = criarAdaptadorEnsaio({ falharEm: "migracao" });
  await assert.rejects(executar({ raiz, alvo, adaptador }), /falha sintética/i);
  assert.equal(adaptador.observar().vivo, true);
  const antes = await readFile(join(pastaAlvo(raiz), "estado.json"), "utf8");
  const backups = await readdir(join(pastaAlvo(raiz), "backups"));
  assert.equal(backups.length, 1);
  const bytes = await readFile(join(pastaAlvo(raiz), "backups", backups[0]));
  const outro = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador: outro }), /bloquead/i);
  assert.equal(outro.observar().migracoes, 0);
  assert.equal(await readFile(join(pastaAlvo(raiz), "estado.json"), "utf8"), antes);
  assert.deepEqual(await readFile(join(pastaAlvo(raiz), "backups", backups[0])), bytes);
});

test("recusa adaptador ausente ou não criado pelo ensaio antes de criar estado", async () => {
  const raiz = await raizNova();
  await assert.rejects(executar({ raiz, alvo }), /adaptador/i);
  await assert.rejects(executar({ raiz, alvo, adaptador: { migrar() {} } }), /adaptador/i);
  assert.deepEqual(await readdir(raiz), []);
});

test("recusa migrador ainda vivo antes de criar uma nova intenção", async () => {
  const raiz = await raizNova();
  const adaptador = criarAdaptadorEnsaio({ migradorVivo: true });
  await assert.rejects(executar({ raiz, alvo, adaptador }), /vivo/i);
  assert.equal(adaptador.observar().migracoes, 0);
});

test("recusa estado adulterado depois do sucesso sem iniciar outra migração", async () => {
  const raiz = await raizNova();
  await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const arquivo = join(pastaAlvo(raiz), "estado.json");
  const registro = JSON.parse(await readFile(arquivo, "utf8"));
  registro.dados.estado = "intencao";
  await writeFile(arquivo, JSON.stringify(registro));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /estado|journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
});

test("crash do processo durante migração mantém trava, journal e backup", async () => {
  const raiz = await raizNova();
  const filho = spawn(
    process.execPath,
    [join(dirname(fileURLToPath(import.meta.url)), "crash-filho.mjs"), raiz],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  let erroFilho = "";
  filho.stderr.on("data", (parte) => {
    erroFilho += parte;
  });
  try {
    assert.equal(await aguardarPronto(filho), "migracao-viva");
    const estado = await readFile(join(pastaAlvo(raiz), "estado.json"), "utf8");
    const registro = JSON.parse(estado);
    assert.equal(registro.dados.estado, "migracao_iniciada");
    const backup = join(pastaAlvo(raiz), "backups", `${registro.dados.operacao}.backup`);
    const bytes = await readFile(backup);
    assert.deepEqual(await encerrarFilho(filho), { codigo: null, sinal: "SIGKILL" }, erroFilho);
    const adaptador = criarAdaptadorEnsaio();
    await assert.rejects(executar({ raiz, alvo, adaptador }), /bloquead/i);
    assert.equal(adaptador.observar().migracoes, 0);
    assert.equal(await readFile(join(pastaAlvo(raiz), "estado.json"), "utf8"), estado);
    assert.deepEqual(await readFile(backup), bytes);
  } finally {
    await encerrarFilho(filho);
  }
});
