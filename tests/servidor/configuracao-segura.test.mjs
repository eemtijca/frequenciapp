// Verifica o exemplo de ambiente e o recorte de regras do contexto Docker.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ler = (caminho) => readFileSync(join(raiz, caminho), "utf8");

// Subconjunto usado pelo arquivo atual: padrões relativos sem classes ou **.
// Não substitui a implementação Docker e falha fechado em sintaxe não suportada.
function incluído(caminho, regras) {
  let incluido = true;
  const partes = caminho.split("/");
  const candidatos = partes.map((_, i) => partes.slice(0, i + 1).join("/"));
  for (const linha of regras.split(/\r?\n/)) {
    let regra = linha.trim();
    if (!regra || regra.startsWith("#")) continue;
    const excecao = regra.startsWith("!");
    if (excecao) regra = regra.slice(1);
    regra = regra.replace(/^\/+|\/+$/g, "");
    const emQualquerDiretorio = regra.startsWith("**/");
    if (emQualquerDiretorio) regra = regra.slice(3);
    assert.ok(!regra.includes("**") && !/[\[\]\\]/.test(regra), `Regra não suportada: ${linha}`);
    const regex = new RegExp(
      `^${regra
        .replace(/[.+^${}()|]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")}$`,
    );
    if (
      candidatos.some(
        (candidato) =>
          regex.test(candidato) || (emQualquerDiretorio && regex.test(candidato.split("/").at(-1))),
      )
    )
      incluido = excecao;
  }
  return incluido;
}

test("o contexto isolado do Nginx exclui certificados", () => {
  const regras = ler("infra/servidor/nginx/.dockerignore");
  assert.equal(incluído("certificados/live/exemplo/privkey.pem", regras), false);
  assert.equal(incluído("outro-diretorio/chave.key", regras), false);
  assert.equal(incluído("outro-diretorio/chave.pem", regras), false);
  assert.equal(incluído("config/ops.env", regras), false);
  assert.equal(incluído("frequenciapp-http.conf", regras), true);
});

test("o shell carrega todos os horários sem executá-los como comandos", () => {
  const esperado = {
    AGENDA_HORARIO: "*/5 * * * *",
    BACKUP_HORARIO: "30 2 * * *",
    BACKUP_PLANILHAS_HORARIO: "0 3 * * *",
    ATUALIZAR_HORARIO: "30 4 * * *",
    CERTBOT_RENOVAR_HORARIO: "15 2 * * *",
  };
  const comando =
    '. "$1"; printf "%s\\n" "$AGENDA_HORARIO" "$BACKUP_HORARIO" "$BACKUP_PLANILHAS_HORARIO" "$ATUALIZAR_HORARIO" "$CERTBOT_RENOVAR_HORARIO"';
  const resultado = spawnSync(
    "/bin/sh",
    ["-eu", "-c", comando, "teste", join(raiz, "infra/servidor/servidor.env.example")],
    {
      cwd: tmpdir(),
      env: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
      encoding: "utf8",
    },
  );
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual(resultado.stdout.trimEnd().split("\n"), Object.values(esperado));
});

test("o contexto raiz exclui certificados aninhados e conserva exceções necessárias", () => {
  assert.match(ler("Dockerfile"), /COPY \. \./);
  assert.match(ler("compose.yml"), /context:\s*\./);
  assert.match(
    ler("compose.servidor.yml"),
    /context:\s*\.[\s\S]*dockerfile:\s*infra\/servidor\/backup\/Dockerfile/,
  );
  for (const dockerfile of ["Dockerfile", "infra/servidor/backup/Dockerfile"]) {
    assert.equal(
      existsSync(join(raiz, `${dockerfile}.dockerignore`)),
      false,
      `Ignora o arquivo raiz: ${dockerfile}`,
    );
  }
  const regras = ler(".dockerignore");
  const arquivos = {
    "infra/servidor/nginx/certificados/chave.pem": false,
    "infra/servidor/nginx/certificados/live/exemplo/privkey.pem": false,
    "infra/servidor/nginx/certificados/archive/exemplo/cert1.pem": false,
    "config/privada.pem": false,
    "config/rclone.conf": false,
    "config/app.env": false,
    "config/ops.env": false,
    "dados/teste.dump": false,
    "deploy/teste.tfstate": false,
    "infra/servidor/nginx/frequenciapp-http.conf": true,
    "docs/api.md": true,
    "docs/openapi.json": true,
    "docs/outro.md": false,
    ".env.example": true,
    ".env.local": false,
  };
  const diretorio = mkdtempSync(join(tmpdir(), "contexto-sintetico-"));
  try {
    for (const [caminho, esperado] of Object.entries(arquivos)) {
      const arquivo = join(diretorio, caminho);
      mkdirSync(dirname(arquivo), { recursive: true });
      writeFileSync(arquivo, "conteúdo sintético\n");
      assert.equal(existsSync(arquivo), true);
      assert.equal(incluído(caminho, regras), esperado, caminho);
    }
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});
