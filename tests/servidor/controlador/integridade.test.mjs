// Reproduz inconsistências de persistência no ensaio exclusivamente sintético.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, unlink, writeFile, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

const alvo = "alvo-sintetico";
const pastaAlvo = (raiz) => join(raiz, createHash("sha256").update(alvo).digest("hex"));

for (const journals of ["ausente", "vazio"]) {
  test(`recusa backup órfão com estado ausente e journals ${journals}`, async () => {
    const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
    const pasta = pastaAlvo(raiz);
    const backups = join(pasta, "backups");
    await mkdir(backups, { recursive: true });
    if (journals === "vazio") await mkdir(join(pasta, "journals"));
    const arquivo = join(backups, "evidencia.backup");
    const bytes = Buffer.from("evidência sintética anterior");
    await writeFile(arquivo, bytes);
    const adaptador = criarAdaptadorEnsaio();
    await assert.rejects(executar({ raiz, alvo, adaptador }), /estado.*backup/i);
    assert.equal(adaptador.observar().migracoes, 0);
    assert.deepEqual(await readFile(arquivo), bytes);
    await assert.rejects(readFile(join(pasta, "estado.json")), { code: "ENOENT" });
    assert.deepEqual(await readdir(backups), ["evidencia.backup"]);
  });
}

test("admite primeira execução com diretórios de journals e backups vazios", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  await mkdir(join(pastaAlvo(raiz), "journals"), { recursive: true });
  await mkdir(join(pastaAlvo(raiz), "backups"));
  const adaptador = criarAdaptadorEnsaio();
  assert.equal((await executar({ raiz, alvo, adaptador })).estado, "concluida");
  assert.equal(adaptador.observar().migracoes, 1);
});

test("recusa backup de operação anterior quando estado e journal foram removidos", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const bytes = await readFile(primeira.backup.arquivo);
  await unlink(join(pastaAlvo(raiz), "estado.json"));
  await unlink(join(pastaAlvo(raiz), "journals", `${primeira.operacao}.json`));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /estado.*backup/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.deepEqual(await readFile(primeira.backup.arquivo), bytes);
  await assert.rejects(readFile(join(pastaAlvo(raiz), "estado.json")), { code: "ENOENT" });
});

test("recusa estado ausente quando existe journal anterior", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  await unlink(join(pastaAlvo(raiz), "estado.json"));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /estado|journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.ok(await readFile(join(pastaAlvo(raiz), "journals", `${primeira.operacao}.json`)));
});

test("recusa estado anterior quando um journal posterior já foi gravado", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const estado = join(pastaAlvo(raiz), "estado.json");
  await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const anterior = await readFile(estado);
  const posterior = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  await writeFile(estado, anterior);
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /estado|journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.ok(await readFile(join(pastaAlvo(raiz), "journals", `${posterior.operacao}.json`)));
});

test("recusa journal divergente do estado mesmo com digest válido", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const arquivo = join(pastaAlvo(raiz), "journals", `${primeira.operacao}.json`);
  const registro = JSON.parse(await readFile(arquivo, "utf8"));
  registro.dados.estado = "migracao_iniciada";
  registro.sha256 = createHash("sha256").update(JSON.stringify(registro.dados)).digest("hex");
  await writeFile(arquivo, JSON.stringify(registro));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /estado|journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
});

test("recusa raiz cujo ancestral dentro de /tmp é symlink", async () => {
  const base = await mkdtemp(join(tmpdir(), "integridade-"));
  const real = join(base, "real");
  await mkdir(real);
  await mkdir(join(real, "raiz"));
  await symlink(real, join(base, "atalho"));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(
    executar({ raiz: join(base, "atalho", "raiz"), alvo, adaptador }),
    /symlink|simbólico/i,
  );
  assert.equal(adaptador.observar().migracoes, 0);
  assert.deepEqual(await readdir(join(real, "raiz")), []);
});

test("recusa pasta de alvo que é symlink sem escrever no destino", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const destino = await mkdtemp(join(tmpdir(), "destino-"));
  await symlink(destino, pastaAlvo(raiz));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /symlink|simbólico/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.deepEqual(await readdir(destino), []);
});

test("recusa diretório de journals que é symlink antes de escrever no destino", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const destino = await mkdtemp(join(tmpdir(), "destino-"));
  await mkdir(pastaAlvo(raiz));
  await symlink(destino, join(pastaAlvo(raiz), "journals"));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /symlink/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.deepEqual(await readdir(destino), []);
});

test("recusa journal ausente preservando estado e backup", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  const estado = join(pastaAlvo(raiz), "estado.json");
  const antes = await readFile(estado);
  const bytes = await readFile(primeira.backup.arquivo);
  await unlink(join(pastaAlvo(raiz), "journals", `${primeira.operacao}.json`));
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
  assert.deepEqual(await readFile(estado), antes);
  assert.deepEqual(await readFile(primeira.backup.arquivo), bytes);
});

test("recusa histórico anterior adulterado mesmo que o último estado esteja íntegro", async () => {
  const raiz = await mkdtemp(join(tmpdir(), "integridade-"));
  const primeira = await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  await executar({ raiz, alvo, adaptador: criarAdaptadorEnsaio() });
  await writeFile(join(pastaAlvo(raiz), "journals", `${primeira.operacao}.json`), "{}");
  const adaptador = criarAdaptadorEnsaio();
  await assert.rejects(executar({ raiz, alvo, adaptador }), /journal/i);
  assert.equal(adaptador.observar().migracoes, 0);
});
