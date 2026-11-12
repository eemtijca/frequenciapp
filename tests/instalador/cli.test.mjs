// Testa a CLI mínima, o contrato JSON, o esquema e a redação de segredos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";
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
    assert.match(resultado.stdout, /atualizar/);
    assert.match(resultado.stdout, /backup/);
    assert.match(resultado.stdout, /restaurar/);
    assert.match(resultado.stdout, /desinstalar/);
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

  it("recusa --salvar-config fora do planejamento", () => {
    const resultado = executar(["versao", "--json", "--salvar-config", "config.json"]);
    assert.equal(resultado.status, 2);
    assert.equal(JSON.parse(resultado.stdout).codigo, "E_USO");
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
      executar([
        "planejar",
        "--json",
        "--config",
        config,
        "--canal",
        "main",
        "--tag",
        "",
        "--permitir-instavel",
      ]),
    );
    assert.equal(documento.perfil, "controlador");
    assert.equal(documento.canal, "main");
    assert.equal(documento.tag, "");
  });

  it("aceita tag vazia no canal main", () => {
    const documento = lerJson(
      executar(["planejar", "--json", "--canal", "main", "--tag", "", "--permitir-instavel"]),
    );
    assert.equal(documento.canal, "main");
    assert.equal(documento.tag, "");
  });

  it("reflete ref e digest informados no contrato", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const digest = `sha256:${"a".repeat(64)}`;
    const documento = lerJson(
      executar(["planejar", "--json", "--ref", commit, "--imagem-digest", digest]),
    );
    assert.equal(documento.commit, commit);
    assert.equal(documento.digest, digest);
  });

  it("recusa o canal main sem --permitir-instavel", () => {
    const resultado = executar(["planejar", "--json", "--canal", "main"]);
    assert.equal(resultado.status, 78);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.codigo, "E_CANAL");
    assert.equal(documento.ok, false);
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

  it("recusa valor com credencial na configuração", () => {
    const diretorio = temporario();
    const config = path.join(diretorio, "instalador.json");
    fs.writeFileSync(
      config,
      JSON.stringify({ dominio: "postgresql://aluno:senha-unica-123@db:5432/frequencia" }),
      "utf8",
    );
    const resultado = executar(["planejar", "--json", "--config", config]);
    assert.equal(resultado.status, 2);
    assert.doesNotMatch(resultado.stdout, /senha-unica-123/);
    assert.doesNotMatch(resultado.stderr, /senha-unica-123/);
  });

  it("não cria trava no planejamento nem no diagnóstico", () => {
    const diretorio = temporario();
    const trava = path.join(diretorio, "trava");
    const ambiente = { ...process.env, INSTALADOR_LOCK_DIR: trava };
    const plano = executar(["planejar", "--json", "--nao-interativo"], { env: ambiente });
    assert.equal(plano.status, 0, plano.stderr);
    assert.equal(fs.existsSync(trava), false);
    const situacao = executar(["situacao", "--json", "--nao-interativo"], { env: ambiente });
    assert.equal(situacao.status, 0, situacao.stderr);
    assert.equal(fs.existsSync(trava), false);
    const diagnostico = executar(["diagnosticar", "--json", "--nao-interativo"], {
      env: ambiente,
    });
    assert.equal(JSON.parse(diagnostico.stdout).comando, "diagnosticar");
    assert.equal(fs.existsSync(trava), false);
  });

  it("grava a configuração efetiva com modo 600 e exige --forcar para sobrescrever", () => {
    const diretorio = temporario();
    const config = path.join(diretorio, "instalador.json");
    const log = path.join(diretorio, "instalador.log");
    const ambiente = { ...process.env, INSTALADOR_LOCK_DIR: path.join(diretorio, "trava") };
    const primeiro = executar(
      [
        "planejar",
        "--json",
        "--perfil",
        "simples",
        "--canal",
        "release",
        "--tag",
        "v1.0.0",
        "--salvar-config",
        config,
        "--arquivo-log",
        log,
      ],
      { env: ambiente },
    );
    const documento = lerJson(primeiro);
    assert.ok(documento.avisos.some((item) => item.codigo === "A_CONFIG_SALVA"));
    assert.equal(fs.statSync(config).mode & 0o777, 0o600);
    const gravado = JSON.parse(fs.readFileSync(config, "utf8"));
    assert.equal(gravado.perfil, "simples");
    assert.equal(gravado.canal, "release");
    assert.equal(gravado.tag, "v1.0.0");
    assert.equal("senha" in gravado, false);
    assert.equal("AUTH_SECRET" in gravado, false);

    const segundo = executar(["planejar", "--json", "--salvar-config", config], {
      env: ambiente,
    });
    assert.equal(segundo.status, 2);
    assert.equal(JSON.parse(segundo.stdout).codigo, "E_USO");

    const terceiro = executar(["planejar", "--json", "--salvar-config", config, "--forcar"], {
      env: ambiente,
    });
    assert.equal(terceiro.status, 0, terceiro.stderr);
    assert.equal(fs.statSync(config).mode & 0o777, 0o600);
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

describe("comandos de operação e uso incorreto", () => {
  it("recusa aplicar sem confirmação explícita com E_USO", () => {
    const resultado = executar(["aplicar", "--json"]);
    assert.equal(resultado.status, 2);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.comando, "aplicar");
    assert.equal(documento.codigo, "E_USO");
  });

  it("recusa os comandos de operação sem a confirmação exigida", () => {
    for (const comando of ["atualizar", "backup", "restaurar"]) {
      const resultado = executar([comando, "--json"]);
      assert.equal(resultado.status, 2, comando);
      const documento = JSON.parse(resultado.stdout);
      assert.equal(documento.codigo, "E_USO", comando);
      assert.equal(documento.ok, false, comando);
    }
    const desinstalar = executar(["desinstalar", "--json", "--remover-dados"]);
    assert.equal(desinstalar.status, 2);
    const documentoDesinstalar = JSON.parse(desinstalar.stdout);
    assert.equal(documentoDesinstalar.codigo, "E_USO");
    assert.equal(documentoDesinstalar.ok, false);
    for (const argumentos of [
      ["canal", "--json"],
      ["canal", "definir", "release", "--json"],
    ]) {
      const resultado = executar(argumentos);
      assert.equal(resultado.status, 2, argumentos.join(" "));
      const documento = JSON.parse(resultado.stdout);
      assert.equal(documento.codigo, "E_USO", argumentos.join(" "));
    }
    const mostrar = executar(["canal", "mostrar", "--json"]);
    assert.equal(mostrar.status, 7);
    const documentoMostrar = JSON.parse(mostrar.stdout);
    assert.equal(documentoMostrar.codigo, "E_VALIDACAO");
    assert.equal(documentoMostrar.ok, false);
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

describe("situacao e diagnosticar", () => {
  it("emite situação somente leitura no contrato JSON", () => {
    const resultado = executar(["situacao", "--json"]);
    assert.equal(resultado.status, 0, resultado.stderr);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.comando, "situacao");
    assert.equal(documento.dry_run, false);
    assert.ok(Array.isArray(documento.etapas));
    assert.equal(documento.etapas[0].id, "situacao");
    assert.ok(Array.isArray(documento.etapas[0].detalhes.verificacoes));
    assert.doesNotMatch(resultado.stdout, /AUTH_SECRET|POSTGRES_PASSWORD|Bearer /);
    validarDocumento(documento, JSON.parse(executar(["esquema"]).stdout));
  });

  it("emite diagnóstico somente leitura no contrato JSON", () => {
    const resultado = executar(["diagnosticar", "--json"]);
    const documento = JSON.parse(resultado.stdout);
    assert.equal(documento.comando, "diagnosticar");
    assert.equal(documento.dry_run, false);
    assert.equal(documento.etapas[0].id, "diagnostico");
    assert.ok(Array.isArray(documento.etapas[0].detalhes.verificacoes));
    assert.doesNotMatch(resultado.stdout, /AUTH_SECRET|POSTGRES_PASSWORD|Bearer /);
    validarDocumento(documento, JSON.parse(executar(["esquema"]).stdout));
  });

  it("mantém saída 0 em situação degradada e marca ok como falso", () => {
    const deteccao = {
      distro: "ubuntu",
      versaoDistro: "26.04",
      codename: "resolute",
      idLike: ["debian"],
      familia: "debian",
      tier: 1,
      motivoTier: "",
      arquitetura: "amd64",
      gerenciador: "apt",
      iniciador: "systemd",
      iniciadorOrigem: "sistema",
      container: false,
      firewall: "ufw",
      selinux: "ausente",
      apparmor: "enforcing",
      docker: {
        presente: true,
        versao: "29.8.2",
        daemon: "ativo",
        composePresente: true,
        composeVersao: "2.39.1",
        composeSuficiente: true,
        usuarioNoGrupo: true,
      },
      instalacao: { existente: true },
      avisos: [],
    };
    const estado = {
      schema: "frequenciapp.instalacao/1",
      instaladoEm: "2026-11-11T12:00:00Z",
      atualizadoEm: "2026-11-11T12:00:00Z",
      perfil: "simples",
      canal: "release",
      tag: "v1.0.0",
      commit: "0000000000000000000000000000000000000000",
      imagem: "ghcr.io/eemtijca/frequenciapp",
      digest: "",
      migradorSha256: null,
      etapas: [],
      controlador: { adotado: false, migradorSha256: null, readocaoPendente: false },
      backup: { ultimoRecibo: null, verificadoEm: null },
      origem: {
        repositorio: "https://github.com/eemtijca/frequenciapp",
        diretorioFonte: "/opt/frequenciapp",
      },
    };
    const respostas = (comando, argumentos) => {
      if (comando === "docker" && argumentos[0] === "ps") {
        return { status: 0, stdout: "frequenciapp-app\tUp\timagem", stderr: "", erro: null };
      }
      if (comando === "docker" && argumentos[0] === "inspect") {
        return { status: 0, stdout: "unhealthy", stderr: "", erro: null };
      }
      if (comando === "docker" && argumentos[0] === "exec") {
        return { status: 0, stdout: "ok", stderr: "", erro: null };
      }
      if (comando === "systemctl") {
        return { status: 0, stdout: "frequenciapp.timer", stderr: "", erro: null };
      }
      return { status: 127, stdout: "", stderr: "", erro: null };
    };
    let saida = "";
    let erros = "";
    const codigo = principal(
      ["situacao", "--json"],
      {
        stdout: { write: (texto) => (saida += texto) },
        stderr: { write: (texto) => (erros += texto) },
      },
      {
        detectar: () => deteccao,
        detectarBasico: () => deteccao,
        lerEstado: () => ({ presente: true, estado, avisos: [] }),
        executar: respostas,
        comandoExiste: () => true,
        agora: () => "2026-11-11T12:00:00Z",
      },
    );
    assert.equal(codigo, 0, erros);
    const documento = JSON.parse(saida);
    assert.equal(documento.ok, false);
    assert.equal(documento.codigo, "E_SAUDE");
  });
});

describe("redação de segredos", () => {
  it("substitui variáveis, URLs, cabeçalhos e chaves privadas", () => {
    assert.equal(redigir("AUTH_SECRET=abc123"), "AUTH_SECRET=[REDIGIDO]");
    assert.equal(redigir("CRON_SECRET=abc123"), "CRON_SECRET=[REDIGIDO]");
    assert.equal(redigir("POSTGRES_PASSWORD=abc123"), "POSTGRES_PASSWORD=[REDIGIDO]");
    assert.equal(redigir("API_KEY=abc123"), "API_KEY=[REDIGIDO]");
    assert.equal(
      redigir("DATABASE_URL=postgresql://aluno:senha@db:5432/frequencia"),
      "DATABASE_URL=postgresql://[REDIGIDO]@db:5432/frequencia",
    );
    assert.equal(
      redigir("DATABASE_URL=postgresql://aluno@db:5432/frequencia"),
      "DATABASE_URL=postgresql://[REDIGIDO]@db:5432/frequencia",
    );
    assert.equal(redigir("Authorization: Bearer abc123"), "Authorization: [REDIGIDO]");
    assert.equal(redigir("Cookie: sessao=abc123"), "Cookie: [REDIGIDO]");
    assert.equal(
      redigir("-----BEGIN PRIVATE KEY-----\nsegredo\n-----END PRIVATE KEY-----"),
      "[REDIGIDO]",
    );
    assert.equal(
      redigir("-----BEGIN OPENSSH PRIVATE KEY-----\nsegredo\n-----END OPENSSH PRIVATE KEY-----"),
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
    assert.equal(
      redigir("[dropbox]\ntoken = sl.abcdefghijklmnopqrstuvwxyz"),
      "[dropbox]\ntoken = [REDIGIDO]",
    );
  });
});
