// Cobre a inclusão condicional do overlay de observabilidade na lista Compose.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const COMUM = path.join(RAIZ, "scripts", "servidor", "comum.sh");
const ARQUIVOS = [
  "compose.yml",
  "compose.servidor.yml",
  "compose.servidor-caddy.yml",
  "compose.observabilidade.yml",
];

function preparar(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-compose-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const app = path.join(raiz, "app");
  fs.mkdirSync(app);
  for (const nome of ARQUIVOS) fs.writeFileSync(path.join(app, nome), "services: {}\n");
  const rotina = path.join(raiz, "montar.sh");
  fs.writeFileSync(
    rotina,
    'set -Eeuo pipefail\n. "$1"\nmontar_compose\nprintf "%s\\n" "${COMPOSE[@]}"\n',
    { mode: 0o700 },
  );
  return { app, rotina };
}

function montar({ app, rotina }, variaveis = {}) {
  return spawnSync("/bin/bash", [rotina, COMUM], {
    encoding: "utf8",
    env: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: app,
      TMPDIR: app,
      APP_DIR: app,
      COMPOSE_PROJECT_NAME: "sintetico",
      PROXY_TIPO: "caddy",
      ...variaveis,
    },
  });
}

function arquivos(resultado) {
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, 0, resultado.stderr);
  const linhas = resultado.stdout.trim().split("\n");
  const lista = [];
  for (let indice = 0; indice < linhas.length; indice += 1) {
    if (linhas[indice] === "-f") lista.push(linhas[indice + 1]);
  }
  return lista;
}

test("inclui o overlay quando a observabilidade está habilitada", (t) => {
  const f = preparar(t);
  const lista = arquivos(montar(f, { OBSERVABILIDADE_HABILITADA: "true" }));
  assert.deepEqual(
    lista,
    ARQUIVOS.map((nome) => path.join(f.app, nome)),
  );
});

test("não inclui o overlay quando a observabilidade está desligada ou ausente", (t) => {
  const f = preparar(t);
  for (const variaveis of [{ OBSERVABILIDADE_HABILITADA: "false" }, {}]) {
    const lista = arquivos(montar(f, variaveis));
    assert.deepEqual(
      lista,
      ARQUIVOS.slice(0, 3).map((nome) => path.join(f.app, nome)),
    );
  }
});

test("acrescenta o overlay ao COMPOSE_ARQUIVOS e não duplica", (t) => {
  const f = preparar(t);
  const base = ["compose.yml", "compose.servidor.yml", "compose.servidor-caddy.yml"];
  const esperado = ARQUIVOS.map((nome) => path.join(f.app, nome));
  const acrescentado = arquivos(
    montar(f, {
      OBSERVABILIDADE_HABILITADA: "true",
      COMPOSE_ARQUIVOS: base.join(":"),
    }),
  );
  assert.deepEqual(acrescentado, esperado);
  const repetido = arquivos(
    montar(f, {
      OBSERVABILIDADE_HABILITADA: "true",
      COMPOSE_ARQUIVOS: [...base, "compose.observabilidade.yml"].join(":"),
    }),
  );
  assert.deepEqual(repetido, esperado);
  const absoluto = arquivos(
    montar(f, {
      OBSERVABILIDADE_HABILITADA: "true",
      COMPOSE_ARQUIVOS: [
        ...base.map((nome) => path.join(f.app, nome)),
        path.join(f.app, "compose.observabilidade.yml"),
      ].join(":"),
    }),
  );
  assert.deepEqual(absoluto, esperado);
});

test("recusa a instalação quando o overlay habilitado não existe", (t) => {
  const f = preparar(t);
  fs.rmSync(path.join(f.app, "compose.observabilidade.yml"));
  const resultado = montar(f, { OBSERVABILIDADE_HABILITADA: "true" });
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /Arquivo Compose não encontrado: .*compose\.observabilidade\.yml/);
});
