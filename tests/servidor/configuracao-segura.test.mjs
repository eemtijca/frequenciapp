// Verifica o exemplo de ambiente e o recorte de regras do contexto Docker.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
        .replace(/[\\.+^${}()|]/g, "\\$&")
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

test("padrões literais não permitem escape ou metacaracteres de regex", () => {
  assert.equal(incluído("dados/arquivoXpem", "dados/arquivo.pem"), true);
  assert.equal(incluído("dados/arquivo.pem", "dados/arquivo.pem"), false);
  assert.throws(() => incluído("dados/chave.pem", "dados/\\\\*.pem"), /Regra não suportada/);
});

test("o contexto isolado do Nginx exclui certificados", () => {
  const regras = ler("infra/servidor/nginx/.dockerignore");
  assert.equal(incluído("certificados/live/exemplo/privkey.pem", regras), false);
  assert.equal(incluído("outro-diretorio/chave.key", regras), false);
  assert.equal(incluído("outro-diretorio/chave.pem", regras), false);
  assert.equal(incluído("config/ops.env", regras), false);
  assert.equal(incluído("frequenciapp-http.conf", regras), true);
});

// Aceita somente comentários e atribuições literais, antes de iniciar o shell.
function validarEnv(conteudo) {
  assert.ok(!/[\r\0]/.test(conteudo), "Linha de ambiente insegura");
  for (const linha of conteudo.split("\n")) {
    assert.ok(
      /^(?:#[^\x00-\x1f\x7f\\]*|[A-Z_][A-Z0-9_]*=(?:[A-Za-z0-9_./:@%+-]*|'[A-Za-z0-9_./:@%+* -]*'))?$/.test(
        linha,
      ),
      "Linha de ambiente insegura",
    );
  }
  return conteudo;
}

function carregarEnv(conteudo) {
  const entrada = validarEnv(conteudo);
  const diretorio = mkdtempSync(join(tmpdir(), "env-validado-"));
  try {
    const arquivo = join(diretorio, "ambiente");
    writeFileSync(arquivo, entrada, { mode: 0o600, flag: "wx" });
    const fd = openSync(arquivo, "r");
    try {
      return spawnSync(
        "/bin/sh",
        [
          "-eu",
          "-c",
          '. /dev/fd/3; printf "%s\\n" "$AGENDA_HORARIO" "$BACKUP_HORARIO" "$BACKUP_PLANILHAS_HORARIO" "$ATUALIZAR_HORARIO" "$CERTBOT_RENOVAR_HORARIO"',
        ],
        {
          stdio: ["ignore", "pipe", "pipe", fd],
          cwd: tmpdir(),
          env: { PATH: "/usr/bin:/bin", HOME: tmpdir() },
          encoding: "utf8",
        },
      );
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
}

test("a validação recusa comandos, substituições e quebras de linha escapadas", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "env-inseguro-"));
  const marcador = join(diretorio, "marcador");
  try {
    const entradas = [
      `AGENDA_HORARIO='*/5 * * * *'\ntouch ${marcador}\n`,
      `AGENDA_HORARIO=$(touch ${marcador})\n`,
      `AGENDA_HORARIO=\`touch ${marcador}\`\n`,
      `AGENDA_HORARIO='*/5 * * * *'; touch ${marcador}\n`,
      `# comentário\\\ntouch ${marcador}\n`,
      `AGENDA_HORARIO='*/5 * * * *'\rtouch ${marcador}\n`,
      "AGENDA_HORARIO='*/5 * * * *'\r\n",
      "AGENDA_HORARIO='*/5 * * * *'\u0000\n",
    ];
    for (const entrada of entradas) {
      assert.throws(() => carregarEnv(entrada), /Linha de ambiente insegura/);
      assert.equal(existsSync(marcador), false);
    }
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("o shell carrega todos os horários sem executá-los como comandos", () => {
  const esperado = {
    AGENDA_HORARIO: "*/5 * * * *",
    BACKUP_HORARIO: "30 2 * * *",
    BACKUP_PLANILHAS_HORARIO: "0 3 * * *",
    ATUALIZAR_HORARIO: "30 4 * * *",
    CERTBOT_RENOVAR_HORARIO: "15 2 * * *",
  };
  const resultado = carregarEnv(ler("infra/servidor/servidor.env.example"));
  assert.ifError(resultado.error);
  assert.equal(resultado.signal, null);
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
