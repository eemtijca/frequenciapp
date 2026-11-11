// Confere independência entre alvos e rejeição de backup sintético adulterado.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comPrazo } from "./filhos.mjs";
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

const raizNova = () => mkdtemp(join(tmpdir(), "controlador-extra-"));

test("uma migração pendente não bloqueia outro alvo sintético", async () => {
  const raiz = await raizNova();
  const adaptador = criarAdaptadorEnsaio({ bloquearEm: "migracao" });
  const primeira = executar({ raiz, alvo: "alvo-a", adaptador });
  primeira.catch(() => {});
  try {
    await comPrazo(
      Promise.race([
        (async () => {
          for (let i = 0; i < 200 && !adaptador.observar().vivo; i++) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.equal(adaptador.observar().vivo, true);
        })(),
        primeira.then(() => {
          throw new Error("Migração não permaneceu pendente.");
        }),
      ]),
    );
    const segunda = await comPrazo(
      executar({ raiz, alvo: "alvo-b", adaptador: criarAdaptadorEnsaio() }),
    );
    assert.equal(segunda.estado, "concluida");
  } finally {
    adaptador.liberar();
    await comPrazo(primeira);
  }
});

test("não inicia nova migração se o backup anterior foi adulterado", async () => {
  const raiz = await raizNova();
  const primeira = await executar({ raiz, alvo: "alvo-a", adaptador: criarAdaptadorEnsaio() });
  await writeFile(primeira.backup.arquivo, "alteração sintética");
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(
    executar({ raiz, alvo: "alvo-a", adaptador }),
    /backup anterior não confere/i,
  );
  assert.equal(adaptador.observar().migracoes, 0);
});
