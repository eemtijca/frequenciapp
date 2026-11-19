// Cobre a resolução única da lista Compose e a política do overlay de observabilidade.
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
  for (const nome of ARQUIVOS) fs.writeFileSync(path.join(app, nome), `# ${nome}\nservices: {}\n`);
  const rotina = path.join(raiz, "montar.sh");
  fs.writeFileSync(
    rotina,
    'set -Eeuo pipefail\n. "$1"\nmontar_compose\nprintf "%s\\n" "${COMPOSE[@]}"\n',
    { mode: 0o700 },
  );
  const listar = path.join(raiz, "listar.sh");
  fs.writeFileSync(listar, 'set -Eeuo pipefail\n. "$1"\nlistar_compose_em "$2"\n', {
    mode: 0o700,
  });
  return { app, rotina, listar };
}

function executar(f, script, variaveis = {}, raiz = f.app) {
  return spawnSync("/bin/bash", [script, COMUM, ...(script === f.listar ? [raiz] : [])], {
    encoding: "utf8",
    env: {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: f.app,
      TMPDIR: f.app,
      APP_DIR: f.app,
      COMPOSE_PROJECT_NAME: "sintetico",
      PROXY_TIPO: "caddy",
      ...variaveis,
    },
  });
}

function montar(f, variaveis = {}) {
  return executar(f, f.rotina, variaveis);
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

function recusa(resultado, motivo) {
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, motivo);
}

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

test("inclui o overlay implícito quando a observabilidade está habilitada", (t) => {
  const f = preparar(t);
  const lista = arquivos(montar(f, { OBSERVABILIDADE_HABILITADA: "true" }));
  assert.deepEqual(
    lista,
    ARQUIVOS.map((nome) => path.join(f.app, nome)),
  );
});

test("lista explícita com overlay relativo, absoluto ou link não duplica", (t) => {
  const f = preparar(t);
  const base = ["compose.yml", "compose.servidor.yml", "compose.servidor-caddy.yml"];
  const esperado = ARQUIVOS.map((nome) => path.join(f.app, nome));
  for (const overlay of [
    "compose.observabilidade.yml",
    path.join(f.app, "compose.observabilidade.yml"),
    "./compose.observabilidade.yml",
  ]) {
    const lista = arquivos(
      montar(f, {
        OBSERVABILIDADE_HABILITADA: "true",
        COMPOSE_ARQUIVOS: [...base, overlay, overlay].join(":"),
      }),
    );
    assert.deepEqual(lista, esperado);
  }
  fs.symlinkSync("compose.observabilidade.yml", path.join(f.app, "overlay-link.yml"));
  const porLink = arquivos(
    montar(f, {
      OBSERVABILIDADE_HABILITADA: "true",
      COMPOSE_ARQUIVOS: [
        ...base,
        "compose.observabilidade.yml",
        path.join(f.app, "overlay-link.yml"),
      ].join(":"),
    }),
  );
  assert.deepEqual(porLink, esperado);
});

test("deduplica caminhos relativos, absolutos e links do mesmo Compose", (t) => {
  const f = preparar(t);
  fs.symlinkSync("compose.yml", path.join(f.app, "compose-link.yml"));
  const resultado = executar(f, f.listar, {
    COMPOSE_ARQUIVOS: [
      "compose.yml",
      path.join(f.app, "compose.yml"),
      "./compose.yml",
      "compose-link.yml",
    ].join(":"),
  });
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual(resultado.stdout.trim().split("\n"), [path.join(f.app, "compose.yml")]);
});

test("recusa lista explícita sem overlay quando a flag está ligada", (t) => {
  const f = preparar(t);
  const resultado = montar(f, {
    OBSERVABILIDADE_HABILITADA: "true",
    COMPOSE_ARQUIVOS: ["compose.yml", "compose.servidor.yml", "compose.servidor-caddy.yml"].join(
      ":",
    ),
  });
  recusa(resultado, /OBSERVABILIDADE_HABILITADA=true exige compose\.observabilidade\.yml/);
});

test("respeita overlay explícito com a flag desligada", (t) => {
  const f = preparar(t);
  const lista = arquivos(
    montar(f, {
      OBSERVABILIDADE_HABILITADA: "false",
      COMPOSE_ARQUIVOS: ARQUIVOS.join(":"),
    }),
  );
  assert.deepEqual(
    lista,
    ARQUIVOS.map((nome) => path.join(f.app, nome)),
  );
});

test("recusa overlays e Compose ausentes antes de montar", (t) => {
  const f = preparar(t);
  fs.rmSync(path.join(f.app, "compose.observabilidade.yml"));
  recusa(
    montar(f, { OBSERVABILIDADE_HABILITADA: "true" }),
    /Arquivo Compose não encontrado: .*compose\.observabilidade\.yml/,
  );

  fs.rmSync(path.join(f.app, "compose.servidor.yml"));
  recusa(montar(f, {}), /Arquivo Compose não encontrado: .*compose\.servidor\.yml/);
});

test("recusa PROXY_TIPO inválido na lista implícita", (t) => {
  const f = preparar(t);
  recusa(montar(f, { PROXY_TIPO: "traefik" }), /PROXY_TIPO inválido: traefik/);
});

test("normaliza a raiz relativa antes de resolver a lista", (t) => {
  const f = preparar(t);
  const resultado = executar(
    f,
    f.listar,
    { COMPOSE_ARQUIVOS: "compose.yml" },
    path.relative(process.cwd(), f.app),
  );
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual(resultado.stdout.trim().split("\n"), [path.join(f.app, "compose.yml")]);
});
