// Testa a CLI mínima, o contrato JSON, o esquema e a redação de segredos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { redigir } from "../../scripts/instalador/redigir.mjs";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLI = path.join(RAIZ, "scripts", "instalador", "cli.mjs");
const DIRETORIOS_TEMPORARIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-cli-"));
  DIRETORIOS_TEMPORARIOS.push(diretorio);
  return diretorio;
}

function executar(argumentos, opcoes = {}) {
  const resultado = spawnSync(process.execPath, [CLI, ...argumentos], {
    encoding: "utf8",
    cwd: opcoes.cwd ?? RAIZ,
    env: { ...process.env, ...opcoes.env },
    timeout: 30000,
  });
  return {
    status: resultado.status,
    stdout: resultado.stdout,
    stderr: resultado.stderr,
  };
}

function lerJson(resultado) {
  assert.equal(resultado.status, 0, resultado.stderr);
  return JSON.parse(resultado.stdout);
}

function validarDocumento(documento, esquema) {
  const chaves = new Set(Object.keys(esquema.properties));
  for (const chave of esquema.required) assert.ok(chave in documento, `campo ausente: ${chave}`);
  for (const chave of Object.keys(documento)) assert.ok(chaves.has(chave), `campo extra: ${chave}`);
  assert.equal(documento.schema, "frequenciapp.instalador/1");
  assert.ok(
    documento.codigo === null || esquema.properties.codigo.anyOf[0].enum.includes(documento.codigo),
  );
  assert.deepEqual(Object.keys(documento.versao).sort(), ["instalador", "projeto"]);
  for (const etapa of documento.etapas) {
    const chavesEtapa = new Set(Object.keys(esquema.$defs.etapa.properties));
    for (const chave of esquema.$defs.etapa.required) {
      assert.ok(chave in etapa, `campo de etapa ausente: ${chave}`);
    }
    for (const chave of Object.keys(etapa)) {
      assert.ok(chavesEtapa.has(chave), `campo extra na etapa: ${chave}`);
    }
    for (const acao of etapa.acoes) {
      assert.deepEqual(Object.keys(acao).sort(), Object.keys(esquema.$defs.acao.properties).sort());
    }
  }
  for (const erro of documento.erros) {
    assert.deepEqual(Object.keys(erro).sort(), Object.keys(esquema.$defs.erro.properties).sort());
  }
  for (const aviso of documento.avisos) {
    const permitidos = new Set(Object.keys(esquema.$defs.aviso.properties));
    for (const chave of Object.keys(aviso))
      assert.ok(permitidos.has(chave), `aviso extra: ${chave}`);
  }
}

after(() => {
  for (const diretorio of DIRETORIOS_TEMPORARIOS) {
    fs.rmSync(diretorio, { recursive: true, force: true });
  }
});

describe("ajuda e versão", () => {
  it("mostra a ajuda em português", () => {
    const resultado = executar(["--ajuda"]);
    assert.equal(resultado.status, 0);
    assert.match(resultado.stdout, /planejar/);
    assert.match(resultado.stdout, /esquema/);
    assert.match(resultado.stdout, /--nao-interativo/);
    assert.doesNotMatch(resultado.stdout, /[\u2026\u2014\u2013\u201C\u201D\u2192]/);
  });

  it("mostra a versão em JSON com detecção básica", () => {
    const documento = lerJson(executar(["versao", "--json"]));
    assert.equal(documento.comando, "versao");
    assert.equal(documento.dry_run, false);
    assert.equal(documento.ok, true);
    assert.equal(documento.codigo, null);
    assert.ok(documento.versao.instalador);
    assert.ok(documento.versao.projeto);
    assert.ok(documento.distro);
    assert.ok(documento.familia);
    assert.equal(documento.etapas[0].detalhes.schemaEstado, "frequenciapp.instalacao/1");
    assert.equal("docker" in documento.etapas[0].detalhes, false);
  });

  it("aceita o alias --versao", () => {
    const documento = lerJson(executar(["--versao", "--json"]));
    assert.equal(documento.comando, "versao");
  });
});

describe("esquema", () => {
  it("imprime um JSON Schema estático draft 2020-12", () => {
    const resultado = executar(["esquema"]);
    assert.equal(resultado.status, 0);
    const esquema = JSON.parse(resultado.stdout);
    assert.equal(esquema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(esquema.additionalProperties, false);
    for (const chave of [
      "schema",
      "comando",
      "ok",
      "codigo",
      "dry_run",
      "distro",
      "versao",
      "codename",
      "familia",
      "tier",
      "arquitetura",
      "gerenciador",
      "iniciador",
      "firewall",
      "selinux",
      "apparmor",
      "canal",
      "perfil",
      "tag",
      "commit",
      "imagem",
      "digest",
      "etapas",
      "avisos",
      "erros",
      "proximos",
      "relatorio",
    ]) {
      assert.ok(esquema.required.includes(chave), `campo não exigido: ${chave}`);
    }
    for (const definicao of ["versao", "etapa", "acao", "erro", "aviso"]) {
      assert.equal(esquema.$defs[definicao].additionalProperties, false, definicao);
    }
    assert.ok(esquema.properties.comando.enum.includes("canal mostrar"));
    assert.ok(esquema.properties.comando.enum.includes("esquema"));
  });
});

describe("planejar", () => {
  it("produz o JSON do contrato com detecção e auditoria", () => {
    const resultado = executar(["planejar", "--json", "--nao-interativo"]);
    const documento = lerJson(resultado);
    assert.equal(documento.comando, "planejar");
    assert.equal(documento.dry_run, true);
    assert.equal(documento.codigo, null);
    assert.equal(documento.perfil, "simples");
    assert.equal(documento.canal, "release");
    assert.ok(documento.tier === 1 || documento.tier === 2);
    assert.ok(documento.etapas.some((etapa) => etapa.id === "preflight"));
    assert.ok(documento.etapas.some((etapa) => etapa.id === "pacotes"));
    assert.ok(documento.etapas.some((etapa) => etapa.id === "docker"));
    assert.ok(Array.isArray(documento.avisos));
    assert.ok(Array.isArray(documento.erros));
    assert.ok(Array.isArray(documento.proximos));
    assert.doesNotMatch(resultado.stdout, /AUTH_SECRET|POSTGRES_PASSWORD|Bearer /);
    const esquema = JSON.parse(executar(["esquema"]).stdout);
    validarDocumento(documento, esquema);
  });

  it("aceita aliases em inglês", () => {
    const documento = lerJson(
      executar([
        "planejar",
        "--json",
        "--dry-run",
        "--non-interactive",
        "--profile",
        "simples",
        "--channel",
        "release",
        "--yes",
      ]),
    );
    assert.equal(documento.comando, "planejar");
    assert.equal(documento.dry_run, true);
    assert.equal(documento.perfil, "simples");
    assert.equal(documento.canal, "release");
  });

  it("produz relatório humano com a tabela de pacotes", () => {
    const resultado = executar(["planejar", "--nao-interativo"]);
    assert.equal(resultado.status, 0, resultado.stderr);
    assert.match(resultado.stdout, /Pacotes:/);
    assert.match(resultado.stdout, /pacote\s+presente\s+versao\s+acao/);
    assert.match(resultado.stdout, /Resultado: ok/);
  });

  it("grava relatório e log com modo 600", () => {
    const diretorio = temporario();
    const relatorio = path.join(diretorio, "plano.json");
    const log = path.join(diretorio, "instalador.log");
    const resultado = executar([
      "planejar",
      "--json",
      "--relatorio",
      relatorio,
      "--arquivo-log",
      log,
    ]);
    const documento = lerJson(resultado);
    assert.equal(documento.relatorio, path.resolve(relatorio));
    assert.equal(fs.statSync(relatorio).mode & 0o777, 0o600);
    assert.equal(fs.statSync(log).mode & 0o777, 0o600);
    const gravado = JSON.parse(fs.readFileSync(relatorio, "utf8"));
    assert.equal(gravado.comando, "planejar");
    assert.equal(gravado.relatorio, path.resolve(relatorio));
    assert.match(fs.readFileSync(log, "utf8"), /comando=planejar/);
  });

  it("aceita --config e dá precedência às flags", () => {
    const diretorio = temporario();
    const config = path.join(diretorio, "instalador.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ perfil: "controlador", canal: "release", tag: "v1.0.0" }),
      "utf8",
    );
    const documento = lerJson(
      executar(["planejar", "--json", "--config", config, "--canal", "main"]),
    );
    assert.equal(documento.perfil, "controlador");
    assert.equal(documento.canal, "main");
    assert.equal(documento.tag, "v1.0.0");
  });

  it("aceita tag vazia no canal main", () => {
    const documento = lerJson(executar(["planejar", "--json", "--canal", "main", "--tag", ""]));
    assert.equal(documento.canal, "main");
    assert.equal(documento.tag, "");
  });

  it("recusa chave desconhecida na configuração", () => {
    const diretorio = temporario();
    const config = path.join(diretorio, "instalador.json");
    fs.writeFileSync(config, JSON.stringify({ desconhecida: true }), "utf8");
    const resultado = executar(["planejar", "--json", "--config", config]);
    assert.equal(resultado.status, 2);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.codigo, "E_USO");
    assert.equal(documento.ok, false);
  });

  it("recusa flag desconhecida sem ecoar o valor", () => {
    const resultado = executar([
      "planejar",
      "--json",
      "--opcao-inexistente",
      "segredo-que-nao-pode-vazar",
    ]);
    assert.equal(resultado.status, 2);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.codigo, "E_USO");
    assert.doesNotMatch(resultado.stdout, /segredo-que-nao-pode-vazar/);
    assert.doesNotMatch(resultado.stderr, /segredo-que-nao-pode-vazar/);
  });
});

describe("comandos indisponíveis e uso incorreto", () => {
  it("recusa aplicar nesta versão com E_USO", () => {
    const resultado = executar(["aplicar", "--json"]);
    assert.equal(resultado.status, 2);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.comando, "aplicar");
    assert.equal(documento.codigo, "E_USO");
  });

  it("recusa comando desconhecido", () => {
    const resultado = executar(["comando-inexistente"]);
    assert.equal(resultado.status, 2);
    assert.match(resultado.stderr, /E_USO/);
  });

  it("mostra ajuda quando não recebe argumentos", () => {
    const resultado = executar([]);
    assert.equal(resultado.status, 0);
    assert.match(resultado.stdout, /Uso:/);
  });
});

describe("redação de segredos", () => {
  it("substitui variáveis, URLs, cabeçalhos e chaves privadas", () => {
    assert.equal(redigir("AUTH_SECRET=abc123"), "AUTH_SECRET=[REDIGIDO]");
    assert.equal(
      redigir("DATABASE_URL=postgresql://aluno:senha@db:5432/frequencia"),
      "DATABASE_URL=postgresql://[REDIGIDO]@db:5432/frequencia",
    );
    assert.equal(redigir("Authorization: Bearer abc123"), "Authorization: [REDIGIDO]");
    assert.equal(
      redigir("-----BEGIN PRIVATE KEY-----\nsegredo\n-----END PRIVATE KEY-----"),
      "[REDIGIDO]",
    );
    assert.equal(
      redigir(
        "-----BEGIN PGP PRIVATE KEY BLOCK-----\nsegredo\n-----END PGP PRIVATE KEY BLOCK-----",
      ),
      "[REDIGIDO]",
    );
    assert.equal(redigir("AGE-SECRET-KEY-1ABC234"), "[REDIGIDO]");
    assert.equal(redigir('"token": "valor"'), '"token": [REDIGIDO]');
    assert.equal(redigir("--senha valor-secreto"), "--senha [REDIGIDO]");
  });
});
