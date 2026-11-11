// Exige histórico verificável da evidência de backup depois de uma nova operação.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

test("guarda o journal concluído e o digest do primeiro backup após a segunda operação", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "controlador-historico-"));
  const alvo = "alvo-sintetico";
  const pasta = join(raiz, createHash("sha256").update(alvo).digest("hex"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const estadoOriginal = await readFile(join(pasta, "estado.json"), "utf8");
  await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const nomes = await readdir(pasta);
  assert.ok(nomes.includes("journals"), "o histórico de journals deve permanecer disponível");
  const historico = JSON.parse(
    await readFile(join(pasta, "journals", `${primeira.operacao}.json`), "utf8"),
  );
  assert.deepEqual(historico, JSON.parse(estadoOriginal));
  assert.equal(historico.dados.backup, primeira.backup.sha256);
  assert.equal(
    historico.sha256,
    createHash("sha256").update(JSON.stringify(historico.dados)).digest("hex"),
  );
});
