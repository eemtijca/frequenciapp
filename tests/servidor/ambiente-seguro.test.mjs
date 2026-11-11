// Testa a validação segura de app.env e ops.env antes de qualquer source no shell.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ErroAmbiente, validarConteudoAmbiente } from "../../scripts/servidor/ambiente-seguro.mjs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const validador = join(raiz, "scripts/servidor/ambiente-seguro.mjs");
const ler = (caminho) => readFileSync(join(raiz, caminho), "utf8");
const SEGREDO = "SEGREDO_SINTETICO_NAO_DEVE_APARECER";

function criarArquivo(diretorio, nome, conteudo) {
  const caminho = join(diretorio, nome);
  writeFileSync(caminho, conteudo, { mode: 0o600, flag: "wx" });
  chmodSync(caminho, 0o600);
  return caminho;
}

function capturarErro(conteudo, arquivo = "ambiente.env") {
  try {
    validarConteudoAmbiente(conteudo, arquivo);
  } catch (erro) {
    return erro;
  }
  assert.fail("A validação deveria recusar o conteúdo.");
}

function executarCarregamento(diretorio) {
  return spawnSync(
    "/bin/bash",
    [
      "-c",
      'source "$APP_DIR/scripts/servidor/comum.sh"; carregar_ambiente; printf "%s\\n" "$AGENDA_HORARIO"',
    ],
    {
      cwd: diretorio,
      env: {
        ...process.env,
        APP_DIR: raiz,
        APP_ENV_FILE: join(diretorio, "app.env"),
        OPS_ENV_FILE: join(diretorio, "ops.env"),
        SERVIDOR_AMBIENTE_INJETADO: "false",
      },
      encoding: "utf8",
    },
  );
}

test("os exemplos de ambiente reais passam", () => {
  for (const caminho of [".env.example", "infra/servidor/servidor.env.example"]) {
    const resultado = validarConteudoAmbiente(ler(caminho), caminho);
    assert.ok(resultado.atribuicoes > 5, caminho);
  }
});

test("comentários, valores vazios, aspas e base64 são aceitos", () => {
  const conteudo = [
    "# Comentário com `crase`, $ cifrão e ponto e vírgula;",
    "  # Comentário com espaço inicial",
    "",
    "AUTH_SECRET=YWJjZGVmZ2hpamtsbW5vcA==",
    "BACKUP_GPG_DESTINATARIO=",
    "AGENDA_HORARIO='*/5 * * * *'",
    'ADMIN_NOME="Direção da Escola"',
    "TZ_APP=America/Fortaleza",
  ].join("\n");
  assert.deepEqual(validarConteudoAmbiente(conteudo, "ambiente"), { atribuicoes: 5 });
});

test("o ops.env antigo com horário sem aspas é recusado", () => {
  const linhas = ler("infra/servidor/servidor.env.example").split("\n");
  const indice = linhas.findIndex((linha) => linha.startsWith("AGENDA_HORARIO="));
  assert.ok(indice >= 0);
  linhas[indice] = "AGENDA_HORARIO=*/5 * * * *";
  const erro = capturarErro(linhas.join("\n"), "/etc/frequenciapp/ops.env");
  assert.ok(erro instanceof ErroAmbiente);
  assert.equal(erro.arquivo, "/etc/frequenciapp/ops.env");
  assert.equal(erro.linha, indice + 1);
  assert.match(erro.message, /aspas simples/);
  assert.ok(!erro.message.includes("*/5"));
});

test("linhas maliciosas são recusadas com arquivo e linha, sem revelar o valor", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-inseguro-"));
  const marcador = join(diretorio, "marcador");
  const casos = [
    {
      nome: "substituição de comando",
      linha: `AUTH_SECRET=${SEGREDO}$(touch ${marcador})`,
      motivo: /substituição/,
    },
    {
      nome: "substituição por crase",
      linha: `AUTH_SECRET=${SEGREDO}\`touch ${marcador}\``,
      motivo: /crase/,
    },
    {
      nome: "ponto e vírgula",
      linha: `AGENDA_HORARIO='*/5 * * * *'; touch ${marcador}`,
      motivo: /ponto e vírgula/,
    },
    {
      nome: "valor sem aspas com espaço",
      linha: "AGENDA_HORARIO=*/5 * * * *",
      motivo: /aspas simples/,
    },
    {
      nome: "retorno de carro",
      linha: "AGENDA_HORARIO='*/5 * * * *'\r",
      motivo: /retorno de carro/,
    },
    {
      nome: "caractere NUL",
      linha: `AUTH_SECRET=${SEGREDO}\u0000`,
      motivo: /NUL/,
    },
    {
      nome: "continuação de linha em atribuição",
      linha: `AUTH_SECRET=${SEGREDO}\\\ntouch ${marcador}`,
      motivo: /barra invertida/,
    },
    {
      nome: "continuação de linha em comentário",
      linha: `# comentário\\\ntouch ${marcador}`,
      motivo: /barra invertida/,
    },
    {
      nome: "aspas simples não fechadas",
      linha: `AUTH_SECRET='${SEGREDO}`,
      motivo: /aspas simples/,
    },
    {
      nome: "caracteres após o valor citado",
      linha: "AGENDA_HORARIO='*/5 * * * *' extra",
      motivo: /após o valor citado/,
    },
    {
      nome: "operador de controle fora de aspas",
      linha: `AUTH_SECRET=${SEGREDO}&touch`,
      motivo: /caractere não aceito/,
    },
  ];

  try {
    for (const caso of casos) {
      const erro = capturarErro(`PROXY_TIPO=caddy\n${caso.linha}\n`, "ops.env");
      assert.ok(erro instanceof ErroAmbiente, caso.nome);
      assert.equal(erro.arquivo, "ops.env", caso.nome);
      assert.equal(erro.linha, 2, caso.nome);
      assert.match(erro.message, /^ops\.env: linha 2: /, caso.nome);
      assert.match(erro.message, caso.motivo, caso.nome);
      assert.ok(!erro.message.includes(SEGREDO), `${caso.nome}: a mensagem revelou o valor`);
      assert.ok(!erro.message.includes(marcador), `${caso.nome}: a mensagem revelou o caminho`);
      assert.equal(existsSync(marcador), false, caso.nome);
    }
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("recusa nomes inválidos e espaços em volta do sinal de igual", () => {
  const casos = [
    ["auth_secret=valor", /nome de variável/],
    ["AUTH_SECRET =valor", /sinal de igual/],
    ["AUTH_SECRET= valor", /sinal de igual/],
    [" AUTH_SECRET=valor", /começar com espaço/],
    ["AUTH_SECRET=valor   ", /fim da linha/],
    ["AUTH_SECRET=valor#comentario", /caractere não aceito/],
  ];
  for (const [linha, motivo] of casos) {
    const erro = capturarErro(linha, "ops.env");
    assert.ok(erro instanceof ErroAmbiente);
    assert.equal(erro.linha, 1);
    assert.match(erro.message, motivo);
  }
});

test("comum.sh valida e carrega os dois exemplos", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-valido-"));
  try {
    criarArquivo(diretorio, "app.env", ler(".env.example"));
    criarArquivo(diretorio, "ops.env", ler("infra/servidor/servidor.env.example"));
    const resultado = executarCarregamento(diretorio);
    assert.ifError(resultado.error);
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.equal(resultado.stdout.trim(), "*/5 * * * *");
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("comum.sh recusa o ops.env antigo antes de executar o shell", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-antigo-"));
  const marcador = join(diretorio, "marcador");
  try {
    criarArquivo(diretorio, "app.env", "AUTH_SECRET=segredo-sintetico-de-32-bytes-0000\n");
    criarArquivo(
      diretorio,
      "ops.env",
      `PROXY_TIPO=caddy\nAGENDA_HORARIO=*/5 * * * *\ntouch ${marcador}\n`,
    );
    const resultado = executarCarregamento(diretorio);
    assert.ifError(resultado.error);
    assert.equal(resultado.signal, null);
    assert.notEqual(resultado.status, 0);
    assert.equal(resultado.stdout, "");
    assert.ok(resultado.stderr.includes("ops.env: linha 2:"), resultado.stderr);
    assert.ok(resultado.stderr.includes("aspas simples"), resultado.stderr);
    assert.equal(existsSync(marcador), false);
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("comum.sh recusa ponto e vírgula no ops.env antes de executar o shell", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-virgula-"));
  const marcador = join(diretorio, "marcador");
  try {
    criarArquivo(diretorio, "app.env", "AUTH_SECRET=segredo-sintetico-de-32-bytes-0000\n");
    criarArquivo(
      diretorio,
      "ops.env",
      `PROXY_TIPO=caddy\nAGENDA_HORARIO='*/5 * * * *'; touch ${marcador}\n`,
    );
    const resultado = executarCarregamento(diretorio);
    assert.ifError(resultado.error);
    assert.notEqual(resultado.status, 0);
    assert.equal(resultado.stdout, "");
    assert.ok(resultado.stderr.includes("ops.env: linha 2:"), resultado.stderr);
    assert.ok(resultado.stderr.includes("ponto e vírgula"), resultado.stderr);
    assert.equal(existsSync(marcador), false);
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("comum.sh recusa substituição no app.env antes de qualquer source", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-app-"));
  const marcador = join(diretorio, "marcador");
  try {
    criarArquivo(diretorio, "app.env", `AUTH_SECRET=$(touch ${marcador})\n`);
    criarArquivo(diretorio, "ops.env", "PROXY_TIPO=caddy\n");
    const resultado = executarCarregamento(diretorio);
    assert.ifError(resultado.error);
    assert.notEqual(resultado.status, 0);
    assert.equal(resultado.stdout, "");
    assert.ok(resultado.stderr.includes("app.env: linha 1:"), resultado.stderr);
    assert.ok(resultado.stderr.includes("substituição"), resultado.stderr);
    assert.equal(existsSync(marcador), false);
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});

test("o executor recusa arquivo malicioso sem repetir o valor", () => {
  const diretorio = mkdtempSync(join(tmpdir(), "ambiente-seguro-executor-"));
  try {
    const arquivo = criarArquivo(diretorio, "ops.env", `AUTH_SECRET=${SEGREDO}$(id)\n`);
    const resultado = spawnSync(process.execPath, [validador, arquivo], {
      encoding: "utf8",
    });
    assert.ifError(resultado.error);
    assert.equal(resultado.status, 1);
    assert.ok(resultado.stderr.includes("linha 1"), resultado.stderr);
    assert.ok(!resultado.stderr.includes(SEGREDO), resultado.stderr);
  } finally {
    rmSync(diretorio, { recursive: true, force: true });
  }
});
