// Exercita o fluxo sintético completo e a repetição após a conclusão persistida.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const modulo = await import("../../../scripts/servidor/controlador/ensaio.mjs").catch((erro) => {
  if (erro.code === "ERR_MODULE_NOT_FOUND") return {};
  throw erro;
});

test("conclui e admite uma segunda execução, preservando o primeiro backup", async () => {
  assert.equal(typeof modulo.executar, "function", "o fluxo de ensaio deve existir");
  const raiz = await mkdtemp(join(tmpdir(), "controlador-sucesso-"));
  const adaptador = modulo.criarAdaptadorEnsaio();
  const primeira = await modulo.executar({ raiz, alvo: "alvo-sintetico", adaptador });
  assert.equal(primeira.estado, "concluida");
  const bytes = await readFile(primeira.backup.arquivo);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), primeira.backup.sha256);
  const segunda = await modulo.executar({ raiz, alvo: "alvo-sintetico", adaptador });
  assert.equal(segunda.estado, "concluida");
  assert.notEqual(segunda.operacao, primeira.operacao);
  assert.deepEqual(await readFile(primeira.backup.arquivo), bytes);
  assert.equal(adaptador.observar().migracoes, 2);
});
