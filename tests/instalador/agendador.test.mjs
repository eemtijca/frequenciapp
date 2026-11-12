// Testa a etapa agendador com dublês de systemd, timedatectl, cron e instalar-rotinas.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import * as agendador from "../../scripts/instalador/passos/agendador.mjs";
import { ORDEM_ETAPAS } from "../../scripts/instalador/executor.mjs";
import { caminhosOperacao } from "../../scripts/instalador/passos/contexto.mjs";
import { ErroInstalador } from "../../scripts/instalador/json.mjs";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURE = path.join(RAIZ, "tests", "instalador", "fixtures", "agendador");
const SEGREDO = "T0KEN-SINTETICO-NAO-REAL";
const DIRETORIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-agendador-"));
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

function prepararRaiz() {
  const raiz = temporario();
  const caminhos = caminhosOperacao(raiz, { diretorioFonte: "/opt/frequenciapp" }, true);
  for (const caminho of [
    caminhos.configDir,
    caminhos.estadoDir,
    caminhos.logDir,
    caminhos.backupDir,
    caminhos.backupBancoDir,
    caminhos.backupPlanilhasDir,
    caminhos.lockDir,
    caminhos.appDir,
    path.join(raiz, "etc/systemd/system"),
    path.join(raiz, "etc/cron.d"),
  ]) {
    fs.mkdirSync(caminho, { recursive: true });
  }
  escrever(caminhos.appEnv, "# Ambiente sintético do teste.\nTZ_APP=America/Fortaleza\n");
  escrever(caminhos.opsEnv, fs.readFileSync(path.join(FIXTURE, "ops.env"), "utf8"));
  escrever(
    path.join(caminhos.appDir, "scripts", "servidor", "instalar-rotinas.sh"),
    "#!/usr/bin/env bash\nexit 0\n",
    0o755,
  );
  return { raiz, caminhos };
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", erro: null };
}

function falha(stderr = "") {
  return { status: 1, stdout: "", stderr, erro: null };
}

function criarCenario(extras = {}) {
  return {
    fusoHost: "America/Fortaleza",
    iniciador: "systemd",
    temSystemctl: true,
    temAnalyze: true,
    temTimedatectl: true,
    temCron: true,
    calendarioInvalido: false,
    falhaTimer: false,
    habilitados: new Set(),
    ativos: new Set(),
    ...extras,
  };
}

function criarCtx(raiz, cenario) {
  const caminhos = caminhosOperacao(raiz, { diretorioFonte: "/opt/frequenciapp" }, true);
  const configuracao = {
    perfil: "simples",
    agendador: "systemd",
    fuso: "America/Fortaleza",
    proxy: "caddy",
    tls: "acme",
    canalAtualizacao: "release",
    refAtualizacao: "",
    habilitarAtualizacoes: false,
    ...cenario.configuracao,
  };
  const chamadas = [];
  const ctx = {
    raiz,
    modoTeste: true,
    sim: true,
    usuarioServico: "frequenciapp",
    configuracao,
    caminhos,
    deteccao: { iniciador: cenario.iniciador },
    permitirInstavel: Boolean(cenario.permitirInstavel),
    permitirFusoDivergente: Boolean(cenario.permitirFusoDivergente),
    raizRepositorio: RAIZ,
    gravarArquivoAtomico: (caminho, conteudo, opcoes = {}) => {
      escrever(caminho, conteudo, opcoes.modo ?? 0o600);
      return caminho;
    },
    comandoExiste: (nome) => {
      if (nome === "systemctl") return cenario.temSystemctl;
      if (nome === "systemd-analyze") return cenario.temAnalyze;
      if (nome === "timedatectl") return cenario.temTimedatectl;
      if (nome === "crontab" || nome === "cron" || nome === "crond") return cenario.temCron;
      return false;
    },
    executar: (comando, argumentos = [], opcoes = {}) =>
      simular({ raiz, cenario, chamadas }, comando, argumentos, opcoes),
    ambienteBase: {
      PATH: process.env.PATH ?? "",
      HOME: os.tmpdir(),
      TMPDIR: os.tmpdir(),
    },
  };
  return { ctx, chamadas };
}

function simular(contexto, comando, argumentos, opcoes) {
  const { raiz, cenario, chamadas } = contexto;
  chamadas.push({ comando, argumentos, opcoes });
  const nome = path.basename(String(comando));
  if (nome === "timedatectl") {
    if (!cenario.temTimedatectl) return falha("timedatectl ausente");
    return ok(`Timezone=${cenario.fusoHost}\n`);
  }
  if (nome === "systemd-analyze") {
    if (cenario.calendarioInvalido) return falha("expressao invalida");
    return ok("Next elapse: 2026-11-11 12:00:00 -03\n");
  }
  if (nome === "systemctl") {
    const acao = argumentos[0];
    const unidade = argumentos[1];
    if (acao === "daemon-reload") return ok("");
    if (acao === "is-enabled") {
      return cenario.habilitados.has(unidade) ? ok("enabled\n") : falha("disabled");
    }
    if (acao === "enable") {
      if (cenario.falhaTimer) return falha("falha simulada ao habilitar");
      cenario.habilitados.add(unidade);
      return ok("");
    }
    if (acao === "is-active") {
      return cenario.ativos.has(unidade) ? ok("active\n") : { ...falha("inactive"), status: 3 };
    }
    if (acao === "start" || acao === "restart") {
      if (cenario.falhaTimer) return falha("falha simulada ao iniciar");
      cenario.ativos.add(unidade);
      cenario.habilitados.add(unidade);
      return ok("");
    }
    if (acao === "disable") {
      cenario.ativos.delete(unidade);
      cenario.habilitados.delete(unidade);
      return ok("");
    }
    return ok("");
  }
  if (nome === "bash") {
    const script = String(argumentos[0] ?? "");
    if (script.endsWith("instalar-rotinas.sh")) {
      const appDir = opcoes.env?.APP_DIR ?? path.join(raiz, "opt/frequenciapp");
      const logDir = opcoes.env?.LOG_DIR ?? path.join(raiz, "var/log/frequenciapp");
      const linhas = [
        "SHELL=/bin/bash",
        `*/5 * * * * frequenciapp "${appDir}/scripts/servidor/agenda.sh" >>"${logDir}/agenda.log" 2>&1`,
        `30 2 * * * frequenciapp "${appDir}/scripts/servidor/backup-banco.sh" >>"${logDir}/backup.log" 2>&1`,
        `0 3 * * * frequenciapp "${appDir}/scripts/servidor/backup-planilhas.sh" >>"${logDir}/backup-planilhas.log" 2>&1`,
      ];
      if (opcoes.env?.ATUALIZAR_HABILITADO === "true") {
        linhas.push(
          `30 4 * * * frequenciapp "${appDir}/scripts/servidor/atualizar.sh" >>"${logDir}/atualizacao.log" 2>&1`,
        );
      }
      escrever(path.join(raiz, "etc/cron.d/frequenciapp"), `${linhas.join("\n")}\n`, 0o644);
      return ok("Cron instalado.\n");
    }
    return ok("");
  }
  return ok("");
}

function ler(caminho) {
  return fs.readFileSync(caminho, "utf8");
}

function unidade(raiz, nome) {
  return path.join(raiz, "etc/systemd/system", nome);
}

function contemSegredo(valor) {
  return JSON.stringify(valor).includes(SEGREDO);
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("agendador systemd", () => {
  it("grava units e timers com persistência, notificação e caminhos restritos", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario();
    const { ctx, chamadas } = criarCtx(raiz, cenario);
    const resultado = agendador.executar(ctx);
    assert.equal(resultado.estado, "concluida");
    assert.equal(resultado.detalhes.agendador, "systemd");
    assert.equal(resultado.detalhes.semMudancas, false);
    assert.equal(resultado.detalhes.atualizacoes, false);
    assert.equal(resultado.detalhes.certificado, false);
    assert.deepEqual(resultado.detalhes.timers.sort(), [
      "frequenciapp-agenda.timer",
      "frequenciapp-backup-banco.timer",
      "frequenciapp-backup-planilhas.timer",
    ]);
    for (const nome of [
      "frequenciapp-agenda.service",
      "frequenciapp-agenda.timer",
      "frequenciapp-backup-banco.service",
      "frequenciapp-backup-banco.timer",
      "frequenciapp-backup-planilhas.service",
      "frequenciapp-backup-planilhas.timer",
      "frequenciapp-falha@.service",
    ]) {
      assert.ok(fs.existsSync(unidade(raiz, nome)), nome);
    }
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-atualizar.timer")), false);
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-certificado.timer")), false);

    const timer = ler(unidade(raiz, "frequenciapp-agenda.timer"));
    assert.match(timer, /^Persistent=true$/m);
    assert.match(timer, /^AccuracySec=1min$/m);
    assert.match(timer, /^RandomizedDelaySec=30s$/m);
    assert.match(timer, /^OnCalendar=\*-\*-\* \*:0\/5:00$/m);

    const servico = ler(unidade(raiz, "frequenciapp-agenda.service"));
    assert.match(servico, /^OnFailure=frequenciapp-falha@%n$/m);
    assert.match(servico, /^User=frequenciapp$/m);
    assert.match(servico, /^WorkingDirectory=.*[\\/]opt[\\/]frequenciapp$/m);
    assert.match(servico, /^ReadWritePaths=.*var[\\/]lib[\\/]frequenciapp.*$/m);

    assert.equal(
      chamadas.filter(
        (item) => item.comando === "systemd-analyze" && item.argumentos[0] === "calendar",
      ).length,
      agendador.CALENDARIOS.size,
    );
    assert.ok(
      chamadas.some((item) => item.comando === "systemctl" && item.argumentos[0] === "enable"),
    );
    assert.ok(
      chamadas.some((item) => item.comando === "systemctl" && item.argumentos[0] === "start"),
    );
    assert.equal(contemSegredo(resultado), false);
  });

  it("não reinstala nem reinicia um timer saudável na segunda execução", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario();
    const primeiro = criarCtx(raiz, cenario);
    agendador.executar(primeiro.ctx);
    const antes = ler(unidade(raiz, "frequenciapp-agenda.timer"));
    const segundo = criarCtx(raiz, cenario);
    const resultado = agendador.executar(segundo.ctx);
    assert.equal(resultado.detalhes.semMudancas, true);
    assert.equal(ler(unidade(raiz, "frequenciapp-agenda.timer")), antes);
    for (const acao of ["daemon-reload", "enable", "start", "restart"]) {
      assert.equal(
        segundo.chamadas.filter(
          (item) => item.comando === "systemctl" && item.argumentos[0] === acao,
        ).length,
        0,
        acao,
      );
    }
  });

  it("recusa fuso divergente não confirmado e aceita a confirmação explícita", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({ fusoHost: "UTC" });
    const { ctx } = criarCtx(raiz, cenario);
    assert.throws(
      () => agendador.executar(ctx),
      (erro) => erro instanceof ErroInstalador && erro.codigo === "E_VALIDACAO",
    );
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-agenda.timer")), false);

    const confirmado = criarCtx(raiz, { ...cenario, permitirFusoDivergente: true });
    const resultado = agendador.executar(confirmado.ctx);
    assert.equal(resultado.estado, "concluida");
    assert.ok(resultado.avisos.some((item) => item.codigo === "A_FUSO_DIVERGENTE_CONFIRMADO"));
  });

  it("recusa uma expressão OnCalendar inválida antes de gravar unidades", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({ calendarioInvalido: true });
    const { ctx } = criarCtx(raiz, cenario);
    assert.throws(
      () => agendador.executar(ctx),
      (erro) => erro instanceof ErroInstalador && erro.codigo === "E_VALIDACAO",
    );
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-agenda.timer")), false);
  });

  it("mantém a atualização desabilitada por padrão", () => {
    const { raiz } = prepararRaiz();
    const { ctx } = criarCtx(raiz, criarCenario());
    const resultado = agendador.executar(ctx);
    assert.equal(resultado.detalhes.atualizacoes, false);
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-atualizar.service")), false);
    assert.equal(fs.existsSync(unidade(raiz, "frequenciapp-atualizar.timer")), false);
  });

  it("instala o timer de atualização quando habilitado", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({
      configuracao: { habilitarAtualizacoes: true },
    });
    const { ctx } = criarCtx(raiz, cenario);
    const resultado = agendador.executar(ctx);
    assert.equal(resultado.detalhes.atualizacoes, true);
    assert.ok(fs.existsSync(unidade(raiz, "frequenciapp-atualizar.timer")));
    const servico = ler(unidade(raiz, "frequenciapp-atualizar.service"));
    assert.match(servico, /^ExecStart=.*atualizar\.sh --modo release$/m);
  });

  it("exige --permitir-instavel para atualizar pelo canal main", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({
      configuracao: { habilitarAtualizacoes: true, canalAtualizacao: "main" },
    });
    const { ctx } = criarCtx(raiz, cenario);
    assert.throws(
      () => agendador.executar(ctx),
      (erro) => erro instanceof ErroInstalador && erro.codigo === "E_CANAL",
    );
    const permitido = criarCtx(raiz, {
      ...cenario,
      permitirInstavel: true,
    });
    const resultado = agendador.executar(permitido.ctx);
    assert.equal(resultado.estado, "concluida");
    const servico = ler(unidade(raiz, "frequenciapp-atualizar.service"));
    assert.match(servico, /^ExecStart=.*atualizar\.sh --modo main$/m);
    assert.match(servico, /^Environment=ATUALIZAR_REF=origin\/main$/m);
  });

  it("falha ao habilitar ou iniciar um timer não é silenciosa", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({ falhaTimer: true });
    const { ctx } = criarCtx(raiz, cenario);
    assert.throws(
      () => agendador.executar(ctx),
      (erro) => erro instanceof ErroInstalador && erro.codigo === "E_VALIDACAO",
    );
  });

  it("não expõe o endereço de notificação nos detalhes, nas units ou nas chamadas", () => {
    const { raiz } = prepararRaiz();
    const { ctx, chamadas } = criarCtx(raiz, criarCenario());
    const resultado = agendador.executar(ctx);
    assert.equal(contemSegredo(resultado), false);
    assert.equal(contemSegredo(chamadas), false);
    for (const nome of resultado.detalhes.arquivos) {
      assert.equal(ler(unidade(raiz, nome)).includes(SEGREDO), false, nome);
    }
    const script = ler(path.join(RAIZ, "scripts", "servidor", "notificar-falha.sh"));
    assert.match(script, /curl [^\n]*-K -/);
    assert.doesNotMatch(script, /curl[^\n]*\$\{?NOTIFICAR_URL/);
  });
});

describe("agendador cron", () => {
  it("usa instalar-rotinas.sh, ajusta o modo e não duplica a linha de atualização", () => {
    const { raiz } = prepararRaiz();
    const cenario = criarCenario({
      iniciador: "openrc",
      temSystemctl: false,
      fusoHost: "America/Fortaleza",
      permitirInstavel: true,
      configuracao: {
        agendador: "cron",
        habilitarAtualizacoes: true,
        canalAtualizacao: "main",
      },
    });
    const primeiro = criarCtx(raiz, cenario);
    const resultado = agendador.executar(primeiro.ctx);
    assert.equal(resultado.detalhes.agendador, "cron");
    assert.equal(resultado.detalhes.atualizacoes, true);
    const chamada = primeiro.chamadas.find(
      (item) =>
        item.comando === "bash" && String(item.argumentos[0]).endsWith("instalar-rotinas.sh"),
    );
    assert.ok(chamada);
    assert.equal(chamada.opcoes.env.SERVIDOR_AMBIENTE_INJETADO, "true");
    assert.equal(chamada.opcoes.env.ATUALIZAR_HABILITADO, "true");
    const caminhoCron = path.join(raiz, "etc/cron.d/frequenciapp");
    const texto = ler(caminhoCron);
    assert.equal(texto.split("\n").filter((linha) => linha.includes("atualizar.sh")).length, 1);
    assert.match(texto, /atualizar\.sh" --modo main/);

    const segundo = criarCtx(raiz, cenario);
    const repetido = agendador.executar(segundo.ctx);
    assert.equal(repetido.detalhes.semMudancas, true);
    const textoFinal = ler(caminhoCron);
    assert.equal(
      textoFinal.split("\n").filter((linha) => linha.includes("atualizar.sh")).length,
      1,
    );
    assert.match(textoFinal, /atualizar\.sh" --modo main/);
  });
});

describe("ordem do executor", () => {
  it("mantém o agendador entre o backup inicial e o firewall", () => {
    assert.equal(agendador.id, "agendador");
    assert.equal(ORDEM_ETAPAS.indexOf("agendador"), ORDEM_ETAPAS.indexOf("backup-inicial") + 1);
    assert.equal(ORDEM_ETAPAS.indexOf("agendador"), ORDEM_ETAPAS.indexOf("firewall") - 1);
  });
});

describe("notificar-falha.sh", () => {
  it(
    "envia a URL por entrada padrão e não a expõe em argv ou no journal",
    { skip: process.platform === "win32" },
    () => {
      const raiz = temporario();
      const bin = path.join(raiz, "bin");
      fs.mkdirSync(bin, { recursive: true });
      const argv = path.join(raiz, "curl-argv");
      const stdin = path.join(raiz, "curl-stdin");
      escrever(
        path.join(bin, "curl"),
        `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >"${argv}"\ncat >"${stdin}"\nexit 0\n`,
        0o755,
      );
      escrever(path.join(bin, "logger"), "#!/usr/bin/env bash\nexit 0\n", 0o755);
      const url = `https://monitor.exemplo.invalido/hook/${SEGREDO}`;
      const envFile = path.join(raiz, "ops.env");
      escrever(envFile, `NOTIFICAR_URL=${url}\n${"# linha seguinte\n".repeat(50)}`);
      const resultado = spawnSync(
        "bash",
        [
          path.join(RAIZ, "scripts", "servidor", "notificar-falha.sh"),
          "frequenciapp-agenda.service",
        ],
        {
          encoding: "utf8",
          env: {
            PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
            OPS_ENV_FILE: envFile,
          },
        },
      );
      assert.equal(resultado.status, 0, resultado.stderr);
      assert.match(resultado.stderr, /Falha em frequenciapp-agenda/);
      assert.equal(ler(argv).includes(SEGREDO), false);
      assert.equal(ler(stdin).includes(SEGREDO), true);
      assert.equal(`${resultado.stdout}\n${resultado.stderr}`.includes(SEGREDO), false);
    },
  );
});
