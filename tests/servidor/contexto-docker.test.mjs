// Confere com Docker real que os contextos de build não recebem chaves nem segredos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const imagemBase =
  "node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";
const dockerfile = `FROM ${imagemBase}\nCOPY . /contexto\n`;

function executarDocker(argumentos) {
  const resultado = spawnSync("docker", argumentos, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  assert.ifError(resultado.error);
  return resultado;
}

function criarContexto(nome, regrasRelativas, arquivos) {
  const diretorio = mkdtempSync(join(tmpdir(), `contexto-${nome}-`));
  writeFileSync(
    join(diretorio, ".dockerignore"),
    readFileSync(join(raiz, regrasRelativas), "utf8"),
  );
  writeFileSync(join(diretorio, "Dockerfile"), dockerfile);
  for (const caminho of Object.keys(arquivos)) {
    const arquivo = join(diretorio, caminho);
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, "conteúdo sintético\n");
  }
  return diretorio;
}

function inspecionarContexto(nome, regrasRelativas, sensiveis, permitidos) {
  const diretorio = criarContexto(nome, regrasRelativas, {
    ...sensiveis,
    ...permitidos,
  });
  const etiqueta = `frequenciapp-contexto-docker:${nome}-${randomUUID()}`;
  try {
    const construcao = executarDocker(["build", "--quiet", "--tag", etiqueta, diretorio]);
    assert.equal(
      construcao.status,
      0,
      `Falha ao construir o contexto ${nome}:\n${construcao.stderr}`,
    );

    const execucao = executarDocker([
      "run",
      "--rm",
      "--network=none",
      etiqueta,
      "find",
      "/contexto",
      "-type",
      "f",
      "-printf",
      "%P\n",
    ]);
    assert.equal(execucao.status, 0, `Falha ao listar o contexto ${nome}:\n${execucao.stderr}`);

    const arquivos = execucao.stdout
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => linha && linha !== ".dockerignore" && linha !== "Dockerfile");

    for (const caminho of Object.keys(sensiveis)) {
      assert.equal(
        arquivos.includes(caminho),
        false,
        `Arquivo sensível no contexto ${nome}: ${caminho}`,
      );
    }
    for (const caminho of Object.keys(permitidos)) {
      assert.equal(
        arquivos.includes(caminho),
        true,
        `Arquivo necessário ausente do contexto ${nome}: ${caminho}`,
      );
    }
  } finally {
    executarDocker(["image", "rm", "--force", etiqueta]);
    rmSync(diretorio, { recursive: true, force: true });
  }
}

test("o contexto raiz exclui chaves e segredos e conserva arquivos necessários", () => {
  const sensiveis = {
    ".env": true,
    ".env.local": true,
    ".git/config": true,
    "app.env": true,
    "ops.env": true,
    "backups/banco.dump": true,
    "backups/banco.dump.1": true,
    "certificados/AuthKey.p8": true,
    "certificados/chave.ppk": true,
    "certificados/servidor.jks": true,
    "certificados/servidor.keystore": true,
    "chaves/id_ed25519": true,
    "compose.yml": true,
    "config/app.env": true,
    "config/chave.key": true,
    "config/ops.env": true,
    "config/privada.pem": true,
    "config/rclone.conf": true,
    "config/rclone.conf.bak": true,
    "config/servidor.p12": true,
    "config/servidor.pfx": true,
    "docs/outro.md": true,
    id_ed25519: true,
    id_rsa: true,
    "infra/servidor/nginx/certificados/live/exemplo/privkey.pem": true,
    "infra/terraform/producao.tfstate": true,
    "infra/terraform/producao.tfstate.backup": true,
    "infra/terraform/segredo.tfvars": true,
    "infra/terraform/segredo.tfvars.local": true,
    "node_modules/pacote/index.js": true,
    "tests/sigiloso.mjs": true,
  };
  const permitidos = {
    ".env.example": true,
    "docs/api.md": true,
    "docs/openapi.json": true,
    "infra/servidor/nginx/frequenciapp-http.conf": true,
    "infra/terraform/exemplo.tfvars.example": true,
  };
  inspecionarContexto("raiz", ".dockerignore", sensiveis, permitidos);
});

test("o contexto do Nginx exclui chaves e segredos e conserva a configuração", () => {
  const sensiveis = {
    ".ssh/id_rsa": true,
    "certificados/live/exemplo/privkey.pem": true,
    "chaves/AuthKey.p8": true,
    "chaves/chave.ppk": true,
    "chaves/id_ed25519": true,
    "chaves/servidor.jks": true,
    "chaves/servidor.keystore": true,
    "config/app.env": true,
    "config/chave.key": true,
    "config/ops.env": true,
    "config/privada.pem": true,
    "config/rclone.conf": true,
    "config/rclone.conf.bak": true,
    "config/servidor.p12": true,
    "config/servidor.pfx": true,
    id_rsa: true,
  };
  const permitidos = {
    ".env.example": true,
    "docs/api.md": true,
    "docs/openapi.json": true,
    "frequenciapp-http.conf": true,
  };
  inspecionarContexto("nginx", "infra/servidor/nginx/.dockerignore", sensiveis, permitidos);
});
