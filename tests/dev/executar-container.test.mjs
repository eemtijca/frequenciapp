// Testa o executor de testes em contêiner sem iniciar as suítes completas.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EXECUTOR = path.join(RAIZ, "scripts", "dev", "executar-container.sh");
const COMPOSE_LOCAL = path.join(RAIZ, "compose.ci-local.yml");
const QUALIDADE_DOCKERFILE = path.join(RAIZ, "scripts", "dev", "img", "quality.Dockerfile");
const SCRIPT = readFileSync(EXECUTOR, "utf8");
const COMPOSE = readFileSync(COMPOSE_LOCAL, "utf8");
const QUALIDADE = readFileSync(QUALIDADE_DOCKERFILE, "utf8");
const DOCKER = process.platform === "win32" ? "docker.exe" : "docker";

function executar(argumentos, ambiente = {}) {
  return spawnSync("bash", [EXECUTOR, ...argumentos], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { ...process.env, ...ambiente },
  });
}

function temDocker() {
  const resultado = spawnSync(DOCKER, ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
  });
  return resultado.status === 0;
}

test("a ajuda lista todos os subcomandos", () => {
  const resultado = executar(["--ajuda"]);
  assert.equal(resultado.status, 0);
  for (const comando of [
    "qualidade",
    "servidor",
    "api",
    "e2e",
    "pwa",
    "instalador-plano",
    "instalador-aplicar",
  ]) {
    assert.match(resultado.stdout, new RegExp(comando));
  }
});

test("o script passa na análise sintática do Bash", () => {
  const resultado = spawnSync("bash", ["-n", EXECUTOR], { encoding: "utf8" });
  assert.equal(resultado.status, 0, resultado.stderr);
});

test("as imagens Node e Playwright estão fixas por digest", () => {
  assert.match(
    SCRIPT,
    /mcr\.microsoft\.com\/playwright:v1\.65\.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe/,
  );
  assert.match(
    QUALIDADE,
    /node:26\.13\.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68/,
  );
  assert.match(QUALIDADE, /\bgit\b/);
  assert.match(QUALIDADE, /\bopenssl\b/);
});

test("o executor prepara Corepack explícito antes de usar Node 26", () => {
  assert.match(QUALIDADE, /npm install --global corepack@0\.36\.0/);
  const ferramentas = readFileSync(
    path.join(RAIZ, "scripts", "dev", "img", "ferramentas.Dockerfile"),
    "utf8",
  );
  assert.match(ferramentas, /npm install --global corepack@0\.36\.0/);
  assert.match(
    SCRIPT,
    /rodar_suite api '[\s\S]*?npm install --global corepack@0\.36\.0\ncorepack enable/,
  );
});

test("a sobreposição local não usa a rede do host", () => {
  assert.doesNotMatch(COMPOSE, /network_mode:\s*host/);
  assert.match(COMPOSE, /network_mode:\s*"service:app"/);
  assert.match(COMPOSE, /COMPOSE|frequenciapp-plan/);
  assert.match(COMPOSE, /external:\s*true/);
});

test("o executor recusa identificador de tarefa inválido antes do Docker", () => {
  const resultado = executar(["qualidade"], { EXECUTOR_TAREFA: "Tarefa Invalida" });
  assert.notEqual(resultado.status, 0);
  assert.match(resultado.stderr, /Tarefa inválida/);
});

test(
  "o Compose local é válido",
  { skip: !temDocker() && "Docker indisponível neste ambiente" },
  () => {
    const resultado = spawnSync(
      DOCKER,
      [
        "compose",
        "--project-directory",
        RAIZ,
        "--project-name",
        "frequenciapp-plan-teste",
        "--file",
        "compose.yml",
        "--file",
        "compose.ci.yml",
        "--file",
        "compose.ci-local.yml",
        "config",
        "--quiet",
      ],
      {
        cwd: RAIZ,
        encoding: "utf8",
        env: {
          ...process.env,
          AUTH_SECRET: "segredo-dummy-de-32-bytes-para-testes-00",
          APP_IMAGEM: "frequenciapp-plan-teste:app",
        },
      },
    );
    assert.equal(resultado.status, 0, resultado.stderr);
  },
);
