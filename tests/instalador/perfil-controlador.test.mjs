// Testa a etapa controlador com dublês de instalação, perfil, hash do migrador e cron.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import * as controlador from "../../scripts/instalador/passos/controlador.mjs";
import { ErroInstalador } from "../../scripts/instalador/json.mjs";

const DIRETORIOS = [];
const OPERADOR = "operador-manutencao";

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-controlador-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function escrever(caminho, conteudo, modo = 0o600) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, conteudo);
  try {
    fs.chmodSync(caminho, modo);
  } catch {
    // O modo não é aplicado em todos os sistemas de arquivos de teste.
  }
}

function hashArquivo(caminho) {
  return crypto.createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

function valorDaOpcao(argumentos, opcao) {
  const indice = argumentos.indexOf(opcao);
  return indice >= 0 ? String(argumentos[indice + 1] ?? "") : "";
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", erro: null };
}

function falha(stderr = "") {
  return { status: 1, stdout: "", stderr, erro: null };
}

function criarContexto(opcoes = {}) {
  const raiz = temporario();
  const appDir = path.join(raiz, "opt", "frequenciapp");
  const configDir = path.join(raiz, "etc", "frequenciapp");
  const prefixo = path.join(raiz, "opt", "frequenciapp-controlador");
  const caminhos = {
    appDir,
    configDir,
    opsEnv: path.join(configDir, "ops.env"),
    controladorPrefixo: prefixo,
    controladorPerfil: path.join(prefixo, "perfil.json"),
    controladorExecutar: path.join(prefixo, "executar"),
  };
  const migrador = path.join(appDir, "docker", "app", "migrar.mjs");
  escrever(migrador, "// Migrador sintético do teste.\n");
  escrever(caminhos.opsEnv, "TZ_APP=America/Fortaleza\n");

  const chamadas = [];
  const logs = [];
  const cenario = {
    criarPerfil: true,
    falharConfirmacao: false,
    falharPlano: false,
    falharRotinas: false,
    hashPerfil: null,
    incluirHash: true,
    perfilLink: false,
    ...opcoes.cenario,
  };

  const ctx = {
    raiz,
    agora: () => "2026-11-12T12:00:00Z",
    registrarLog: (linha) => logs.push(linha),
    naoIniciar: Boolean(opcoes.naoIniciar),
    estado: opcoes.estado ?? null,
    configuracao: {
      operadorControlador: opcoes.operador ?? OPERADOR,
      ...opcoes.configuracao,
    },
    caminhos,
    ambienteBase: {
      PATH: process.env.PATH ?? "",
      HOME: os.tmpdir(),
      TMPDIR: os.tmpdir(),
    },
    executar: (comando, argumentos = [], opcoesExecucao = {}) =>
      simular({ cenario, chamadas, caminhos, migrador }, comando, argumentos, opcoesExecucao),
  };
  return { ctx, chamadas, cenario, caminhos, logs, migrador, raiz };
}

function simular(contexto, comando, argumentos, opcoes) {
  const { cenario, chamadas, caminhos, migrador } = contexto;
  chamadas.push({ comando, argumentos, opcoes });
  if (path.basename(String(comando)) !== "bash") return ok("");

  const script = String(argumentos[0] ?? "");
  if (script.endsWith("instalar-controlador.sh")) {
    const confirmar = argumentos.includes("--confirmar");
    if (!confirmar && cenario.falharPlano) return falha("falha sintética no plano");
    if (confirmar && cenario.falharConfirmacao) {
      return falha("falha sintética na confirmação");
    }
    if (confirmar && cenario.criarPerfil) {
      const dados = {
        versao: 1,
        tipo: "compose-host",
        prefixo: caminhos.controladorPrefixo,
        operador: valorDaOpcao(argumentos, "--operador"),
      };
      if (cenario.incluirHash) {
        dados.migradorSha256 = cenario.hashPerfil ?? hashArquivo(migrador);
      }
      escrever(caminhos.controladorPerfil, `${JSON.stringify(dados)}\n`);
      escrever(caminhos.controladorExecutar, "#!/bin/sh\nexit 0\n", 0o700);
      if (cenario.perfilLink) {
        const alvo = `${caminhos.controladorPerfil}.real`;
        fs.renameSync(caminhos.controladorPerfil, alvo);
        fs.symlinkSync(alvo, caminhos.controladorPerfil);
      }
    }
    return ok(confirmar ? '{"instalado":true}\n' : '{"plano":true}\n');
  }

  if (script.endsWith("instalar-rotinas.sh")) {
    if (argumentos.includes("--confirmar") && cenario.falharRotinas) {
      return falha("falha sintética nas rotinas");
    }
    return ok(
      argumentos.includes("--plano")
        ? "*/5 * * * * root /opt/frequenciapp-controlador/executar agenda\n"
        : "Cron instalado.\n",
    );
  }

  return ok("");
}

function adotarPerfil(caminhos, hash, extras = {}) {
  escrever(
    caminhos.controladorPerfil,
    `${JSON.stringify({
      versao: 1,
      tipo: "compose-host",
      prefixo: caminhos.controladorPrefixo,
      operador: OPERADOR,
      migradorSha256: hash,
      ...extras,
    })}\n`,
  );
  escrever(caminhos.controladorExecutar, "#!/bin/sh\nexit 0\n", 0o700);
}

function erroControlador(validacao) {
  return (erro) => {
    assert.ok(erro instanceof ErroInstalador);
    assert.equal(erro.codigo, "E_CONTROLADOR");
    validacao(erro);
    return true;
  };
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("perfil controlador", () => {
  it("adota o controlador, confere o migrador e instala as rotinas estáveis", () => {
    const { ctx, chamadas, caminhos, logs, migrador } = criarContexto();
    const resultado = controlador.executar(ctx);

    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.adotado, true);
    assert.equal(resultado.detalhes.prefixo, caminhos.controladorPrefixo);
    assert.equal(resultado.detalhes.perfil, caminhos.controladorPerfil);
    assert.equal(resultado.detalhes.operador, OPERADOR);
    assert.equal(resultado.detalhes.migradorSha256, hashArquivo(migrador));
    assert.equal(resultado.detalhes.rotinas, "cron");
    assert.equal(resultado.detalhes.semMudancas, false);
    assert.equal(resultado.avisos.length, 0);
    assert.equal(resultado.acoes.length, 4);
    assert.equal(chamadas.length, 4);

    const argumentos = (indice) => chamadas[indice].argumentos;
    assert.equal(chamadas[0].comando, "bash");
    assert.equal(
      argumentos(0)[0],
      path.join(caminhos.appDir, "scripts", "servidor", "instalar-controlador.sh"),
    );
    for (const [opcao, valor] of [
      ["--fonte", caminhos.appDir],
      ["--app", caminhos.appDir],
      ["--config", caminhos.configDir],
      ["--prefixo", caminhos.controladorPrefixo],
      ["--operador", OPERADOR],
    ]) {
      assert.equal(valorDaOpcao(argumentos(0), opcao), valor, opcao);
    }
    assert.ok(argumentos(0).includes("--plano"));
    assert.equal(argumentos(0).includes("--confirmar"), false);
    assert.ok(argumentos(1).includes("--confirmar"));
    assert.equal(argumentos(1).includes("--plano"), false);

    assert.equal(
      argumentos(2)[0],
      path.join(caminhos.appDir, "scripts", "servidor", "instalar-rotinas.sh"),
    );
    assert.deepEqual(argumentos(2).slice(1), [
      "--controlador",
      "--perfil",
      caminhos.controladorPerfil,
      "--plano",
    ]);
    assert.deepEqual(argumentos(3).slice(1), [
      "--controlador",
      "--perfil",
      caminhos.controladorPerfil,
      "--confirmar",
    ]);

    for (const chamada of chamadas) assert.ok(chamada.opcoes.timeout >= 600000);
    assert.equal(fs.existsSync(caminhos.controladorPerfil), true);
    assert.equal(fs.existsSync(caminhos.controladorExecutar), true);
    assert.ok(logs.some((linha) => linha.includes("fase=controlador-confirmar")));
  });

  it("revalida as rotinas quando o controlador já está adotado sem readoção pendente", () => {
    const { ctx, chamadas, caminhos, migrador } = criarContexto();
    const hash = hashArquivo(migrador);
    ctx.estado = {
      controlador: { adotado: true, migradorSha256: hash, readocaoPendente: false },
    };
    adotarPerfil(caminhos, hash);

    const resultado = controlador.executar(ctx);

    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.semMudancas, true);
    assert.equal(resultado.detalhes.adotado, true);
    assert.equal(resultado.detalhes.migradorSha256, hash);
    assert.equal(resultado.detalhes.rotinas, "cron");
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0].argumentos.includes("--plano"));
  });

  it("preserva prefixo e trava quando o estado exige readoção administrativa", () => {
    const { ctx, chamadas, caminhos, migrador } = criarContexto();
    const hash = hashArquivo(migrador);
    ctx.estado = {
      controlador: { adotado: true, migradorSha256: hash, readocaoPendente: true },
    };
    adotarPerfil(caminhos, hash);
    const antes = fs.readFileSync(caminhos.controladorPerfil);
    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => assert.match(erro.message, /readoção|administrativa/i)),
    );
    assert.deepEqual(fs.readFileSync(caminhos.controladorPerfil), antes);
    assert.equal(chamadas.length, 0);
  });

  it("recusa o perfil controlador sem operador de manutenção", () => {
    const { ctx, chamadas } = criarContexto({ operador: "   " });

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /operador/i);
        assert.match(erro.dica, /--operador-controlador/);
        assert.equal(erro.documentacao, "docs/controlador-manutencao.md");
      }),
    );
    assert.equal(chamadas.length, 0);
  });

  it("interrompe na falha do plano sem confirmar a adoção", () => {
    const { ctx, chamadas, cenario, caminhos } = criarContexto();
    cenario.falharPlano = true;

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /plano/i);
        assert.equal(erro.message.includes("falha sintética"), false);
      }),
    );
    assert.equal(chamadas.length, 1);
    assert.equal(fs.existsSync(caminhos.controladorPerfil), false);
  });

  it("interrompe na falha da confirmação sem declarar adoção", () => {
    const { ctx, chamadas, cenario, caminhos } = criarContexto();
    cenario.falharConfirmacao = true;

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /adoção/i);
        assert.equal(erro.message.includes("falha sintética"), false);
      }),
    );
    assert.equal(chamadas.length, 2);
    assert.equal(fs.existsSync(caminhos.controladorPerfil), false);
  });

  it("interrompe na falha da confirmação das rotinas estáveis", () => {
    const { ctx, chamadas, cenario } = criarContexto();
    cenario.falharRotinas = true;

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /rotinas estáveis/i);
        assert.equal(erro.message.includes("falha sintética"), false);
      }),
    );
    assert.equal(chamadas.length, 4);
  });

  it("recusa a confirmação que termina sem criar o perfil", () => {
    const { ctx, chamadas, cenario, caminhos } = criarContexto();
    cenario.criarPerfil = false;

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /perfil/i);
      }),
    );
    assert.equal(chamadas.length, 2);
    assert.equal(fs.existsSync(caminhos.controladorPerfil), false);
  });

  it("recusa o perfil que não é arquivo regular", () => {
    const { ctx, chamadas, cenario } = criarContexto();
    cenario.perfilLink = true;

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /arquivo regular/i);
      }),
    );
    assert.equal(chamadas.length, 2);
  });

  it("recusa a divergência entre o hash do perfil e o migrador do checkout", () => {
    const { ctx, chamadas, cenario } = criarContexto();
    cenario.hashPerfil = "0".repeat(64);

    assert.throws(
      () => controlador.executar(ctx),
      erroControlador((erro) => {
        assert.match(erro.message, /hash do migrador/i);
      }),
    );
    assert.equal(chamadas.length, 2);
  });

  it("aceita o perfil sem hash declarado e registra o hash calculado", () => {
    const { ctx, chamadas, cenario, migrador } = criarContexto();
    cenario.incluirHash = false;

    const resultado = controlador.executar(ctx);

    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.migradorSha256, hashArquivo(migrador));
    assert.equal(chamadas.length, 4);
  });

  it("pula a adoção com --nao-iniciar sem executar comandos", () => {
    const { ctx, chamadas } = criarContexto({ naoIniciar: true });

    const resultado = controlador.executar(ctx);

    assert.equal(resultado.estado, "pulada");
    assert.equal(resultado.detalhes.semMudancas, true);
    assert.ok(resultado.avisos.some((aviso) => aviso.codigo === "A_NAO_INICIAR"));
    assert.equal(chamadas.length, 0);
  });
});
