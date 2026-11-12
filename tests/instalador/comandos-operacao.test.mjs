// Testa os comandos de operação do instalador com dublês de execução e raízes temporárias.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";
import { lerEstado } from "../../scripts/instalador/estado.mjs";

const AGORA = "2026-11-12T12:00:00Z";
const RECIBO = "frequenciapp-20261112T120000Z-abcdef12.confirmado.json";
const DUMP = "frequenciapp-20261112T120000Z-abcdef12.dump.gpg";
const CONTEUDO_DUMP = "dump sintetico da operacao";
const SHA256_DUMP = crypto.createHash("sha256").update(CONTEUDO_DUMP).digest("hex");
const DIRETORIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-operacao-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function prepararRaiz() {
  const raiz = temporario();
  for (const relativo of [
    "etc/frequenciapp",
    "etc/cron.d",
    "etc/logrotate.d",
    "etc/systemd/system",
    "opt/frequenciapp/scripts/servidor",
    "opt/frequenciapp-controlador",
    "var/backups/frequenciapp/banco",
    "var/lib/frequenciapp",
    "var/log/frequenciapp",
  ]) {
    fs.mkdirSync(path.join(raiz, relativo), { recursive: true });
  }
  return raiz;
}

function escrever(caminho, conteudo, modo = 0o644) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, conteudo, { mode: modo });
  fs.chmodSync(caminho, modo);
}

function prepararRecibo(raiz, extra = {}) {
  const backupDir = path.join(raiz, "var", "backups", "frequenciapp", "banco");
  escrever(path.join(backupDir, DUMP), CONTEUDO_DUMP);
  escrever(
    path.join(raiz, "var", "lib", "frequenciapp", "ultimo-backup.json"),
    `${JSON.stringify({
      em: AGORA,
      modo: "compose",
      criptografia: "gpg",
      arquivo: DUMP,
      sha256: SHA256_DUMP,
      recibo: RECIBO,
      verificadoRemoto: true,
      ...extra,
    })}\n`,
    0o600,
  );
}

function prepararInstalacao(raiz) {
  for (const relativo of [
    "etc/systemd/system/frequenciapp-agenda.timer",
    "etc/systemd/system/frequenciapp-agenda.service",
    "etc/systemd/system/frequenciapp-falha@.service",
    "etc/cron.d/frequenciapp",
    "etc/logrotate.d/frequenciapp",
    "etc/frequenciapp/app.env",
    "opt/frequenciapp/compose.yml",
    "opt/frequenciapp-controlador/perfil.json",
    "var/backups/frequenciapp/banco/dump.gpg",
    "var/lib/frequenciapp/instalacao.json",
  ]) {
    escrever(path.join(raiz, relativo), "conteudo sintetico\n");
  }
}

function deteccaoFalsa() {
  return {
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
}

function cenarioPadrao() {
  return {
    backupFalha: false,
    atualizarFalha: "",
    restaurarFalha: false,
    dockerStatus: 0,
    systemctlStatus: 0,
  };
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", erro: null };
}

function falha(stderr = "") {
  return { status: 1, stdout: "", stderr, erro: null };
}

function responder(cenario, comando, argumentos) {
  const nome = path.basename(String(comando));
  if (nome === "bash") {
    const script = path.basename(String(argumentos[0] ?? ""));
    if (script === "backup-banco.sh") {
      return cenario.backupFalha ? falha("falha simulada no backup") : ok("backup concluido\n");
    }
    if (script === "atualizar.sh") {
      if (cenario.atualizarFalha === "saude") return falha("health check falhou");
      if (cenario.atualizarFalha === "canal") return falha("tag de release ausente");
      return ok("atualizacao simulada\n");
    }
    if (script === "restaurar.sh" || script === "baixar-backup.sh") {
      return cenario.restaurarFalha ? falha("checksum divergente") : ok("restauracao concluida\n");
    }
    return ok();
  }
  if (nome === "docker")
    return { status: cenario.dockerStatus, stdout: "", stderr: "", erro: null };
  if (nome === "systemctl") {
    return { status: cenario.systemctlStatus, stdout: "", stderr: "", erro: null };
  }
  return ok();
}

function criarDeps({ raiz, cenario = cenarioPadrao(), uid = 0, ambiente = null }) {
  const chamadas = [];
  return {
    chamadas,
    deps: {
      raiz,
      uid: () => uid,
      agora: () => AGORA,
      usuarioServico: "frequenciapp",
      detectar: deteccaoFalsa,
      detectarBasico: deteccaoFalsa,
      lerEstado,
      ambiente,
      executar: (comando, argumentos = [], opcoes = {}) => {
        chamadas.push({ comando, argumentos, opcoes });
        return responder(cenario, comando, argumentos);
      },
    },
  };
}

function executar(argumentos, deps) {
  let stdout = "";
  let stderr = "";
  const codigo = principal(
    argumentos,
    {
      stdout: { write: (texto) => (stdout += texto) },
      stderr: { write: (texto) => (stderr += texto) },
    },
    deps,
  );
  let json = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { codigo, stdout, stderr, json };
}

function chamadaPorScript(chamadas, nome) {
  return chamadas.find(
    (chamada) =>
      path.basename(String(chamada.comando)) === "bash" &&
      path.basename(String(chamada.argumentos[0] ?? "")) === nome,
  );
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("backup", () => {
  it("executa a rotina, lê o recibo e devolve os caminhos operacionais esperados", () => {
    const raiz = prepararRaiz();
    prepararRecibo(raiz);
    const { deps, chamadas } = criarDeps({ raiz, uid: 1000 });
    const resultado = executar(["backup", "--json", "--modo-teste", "--sim"], deps);
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.comando, "backup");
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.codigo, null);
    assert.equal(resultado.json.dry_run, false);
    const etapa = resultado.json.etapas[0];
    assert.equal(etapa.id, "backup");
    assert.equal(etapa.estado, "concluida");
    assert.equal(etapa.detalhes.recibo, RECIBO);
    assert.equal(etapa.detalhes.arquivo, DUMP);
    assert.equal(etapa.detalhes.sha256, SHA256_DUMP);
    assert.equal(etapa.detalhes.verificadoRemoto, true);
    assert.doesNotMatch(resultado.stdout, /etc\/frequenciapp|app\.env|ops\.env/);
    const chamada = chamadaPorScript(chamadas, "backup-banco.sh");
    assert.ok(chamada, "backup-banco.sh não foi chamado");
    assert.equal(
      chamada.opcoes.env.APP_ENV_FILE,
      path.join(raiz, "etc", "frequenciapp", "app.env"),
    );
    assert.equal(
      chamada.opcoes.env.OPS_ENV_FILE,
      path.join(raiz, "etc", "frequenciapp", "ops.env"),
    );
    assert.equal(chamada.opcoes.env.APP_DIR, path.join(raiz, "opt", "frequenciapp"));
    assert.equal(chamada.opcoes.env.ESTADO_DIR, path.join(raiz, "var", "lib", "frequenciapp"));
    assert.equal(
      chamada.opcoes.env.BACKUP_BANCO_DIR,
      path.join(raiz, "var", "backups", "frequenciapp", "banco"),
    );
    assert.equal(chamada.opcoes.env.SERVIDOR_CONFIG_DIR, path.join(raiz, "etc", "frequenciapp"));
  });

  it("devolve E_BACKUP quando a rotina falha", () => {
    const raiz = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.backupFalha = true;
    const { deps } = criarDeps({ raiz, cenario });
    const resultado = executar(["backup", "--json", "--modo-teste"], deps);
    assert.equal(resultado.codigo, 10);
    assert.equal(resultado.json.comando, "backup");
    assert.equal(resultado.json.codigo, "E_BACKUP");
    assert.equal(resultado.json.ok, false);
    assert.equal(resultado.json.etapas[0].estado, "falhou");
    assert.doesNotMatch(resultado.stdout, /Error|at .*\.mjs/);
  });

  it("exige --sim em instalação real e root fora do modo de teste", () => {
    const raiz = prepararRaiz();
    const semSim = criarDeps({ raiz, uid: 1000 });
    const resultadoSemSim = executar(["backup", "--json"], semSim.deps);
    assert.equal(resultadoSemSim.codigo, 2);
    assert.equal(resultadoSemSim.json.codigo, "E_USO");

    const semRoot = criarDeps({ raiz, uid: 1000 });
    const resultadoSemRoot = executar(["backup", "--json", "--sim"], semRoot.deps);
    assert.equal(resultadoSemRoot.codigo, 7);
    assert.equal(resultadoSemRoot.json.codigo, "E_VALIDACAO");
  });
});

describe("atualizar", () => {
  it("delega o canal release com a tag e as variáveis de atualização", () => {
    const raiz = prepararRaiz();
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      [
        "atualizar",
        "--json",
        "--modo-teste",
        "--sim",
        "--canal",
        "release",
        "--tag",
        "v1.2.3",
        "--permitir-migracoes",
      ],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.comando, "atualizar");
    assert.equal(resultado.json.dry_run, false);
    assert.equal(resultado.json.etapas[0].id, "atualizar");
    assert.equal(resultado.json.etapas[0].detalhes.modo, "release");
    assert.equal(resultado.json.etapas[0].detalhes.ref, "v1.2.3");
    assert.equal(resultado.json.etapas[0].detalhes.permitirMigracoes, true);
    const chamada = chamadaPorScript(chamadas, "atualizar.sh");
    assert.ok(chamada, "atualizar.sh não foi chamado");
    assert.deepEqual(chamada.argumentos.slice(1), [
      "--modo",
      "release",
      "--tag",
      "v1.2.3",
      "--permitir-migracoes",
    ]);
    assert.equal(chamada.opcoes.env.ATUALIZAR_MODO, "release");
    assert.equal(chamada.opcoes.env.ATUALIZAR_REF, "v1.2.3");
    assert.equal(chamada.opcoes.env.ATUALIZAR_BACKUP_ANTES, "true");
    assert.equal(chamada.opcoes.env.ATUALIZAR_PERMITIR_MIGRACOES, "true");
  });

  it("delega o canal main com a referência e avisa sobre a instabilidade", () => {
    const raiz = prepararRaiz();
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      [
        "atualizar",
        "--json",
        "--modo-teste",
        "--sim",
        "--canal",
        "main",
        "--permitir-instavel",
        "--ref",
        "0123456789abcdef0123456789abcdef01234567",
      ],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.etapas[0].detalhes.modo, "main");
    assert.equal(resultado.json.etapas[0].detalhes.ref, "0123456789abcdef0123456789abcdef01234567");
    assert.ok(resultado.json.avisos.some((item) => item.codigo === "A_CANAL_MAIN"));
    const chamada = chamadaPorScript(chamadas, "atualizar.sh");
    assert.equal(chamada.opcoes.env.ATUALIZAR_MODO, "main");
    assert.equal(chamada.opcoes.env.ATUALIZAR_REF, "0123456789abcdef0123456789abcdef01234567");
    assert.deepEqual(chamada.argumentos.slice(1), [
      "--modo",
      "main",
      "--ref",
      "0123456789abcdef0123456789abcdef01234567",
    ]);
  });

  it("recusa release sem tag e main sem confirmação de instabilidade", () => {
    const raiz = prepararRaiz();
    const { deps } = criarDeps({ raiz });
    const semTag = executar(
      ["atualizar", "--json", "--modo-teste", "--sim", "--canal", "release"],
      deps,
    );
    assert.equal(semTag.codigo, 2);
    assert.equal(semTag.json.codigo, "E_USO");
    const mainSemFlag = executar(
      ["atualizar", "--json", "--modo-teste", "--sim", "--canal", "main"],
      deps,
    );
    assert.equal(mainSemFlag.codigo, 78);
    assert.equal(mainSemFlag.json.codigo, "E_CANAL");
  });

  it("exige --sim em instalação real antes de qualquer outro requisito", () => {
    const raiz = prepararRaiz();
    const { deps } = criarDeps({ raiz, uid: 1000 });
    const resultado = executar(["atualizar", "--json"], deps);
    assert.equal(resultado.codigo, 2);
    assert.equal(resultado.json.codigo, "E_USO");
    assert.notEqual(resultado.json.codigo, "E_VALIDACAO");
  });

  it("executa a simulação com --simular e devolve dry_run verdadeiro", () => {
    const raiz = prepararRaiz();
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      ["atualizar", "--json", "--modo-teste", "--canal", "release", "--tag", "v1.2.3", "--simular"],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.dry_run, true);
    assert.equal(resultado.json.etapas[0].detalhes.simulado, true);
    const chamada = chamadaPorScript(chamadas, "atualizar.sh");
    assert.deepEqual(chamada.argumentos.slice(1), [
      "--modo",
      "release",
      "--tag",
      "v1.2.3",
      "--simular",
    ]);
  });

  it("classifica a falha de saúde e a falha de canal sem expor a saída bruta", () => {
    const raizSaude = prepararRaiz();
    const cenarioSaude = cenarioPadrao();
    cenarioSaude.atualizarFalha = "saude";
    const saude = executar(
      ["atualizar", "--json", "--modo-teste", "--sim", "--canal", "release", "--tag", "v1.2.3"],
      criarDeps({ raiz: raizSaude, cenario: cenarioSaude }).deps,
    );
    assert.equal(saude.codigo, 9);
    assert.equal(saude.json.codigo, "E_SAUDE");
    assert.doesNotMatch(saude.stdout, /health check falhou/);

    const raizCanal = prepararRaiz();
    const cenarioCanal = cenarioPadrao();
    cenarioCanal.atualizarFalha = "canal";
    const canal = executar(
      ["atualizar", "--json", "--modo-teste", "--sim", "--canal", "release", "--tag", "v1.2.3"],
      criarDeps({ raiz: raizCanal, cenario: cenarioCanal }).deps,
    );
    assert.equal(canal.codigo, 78);
    assert.equal(canal.json.codigo, "E_CANAL");
    assert.doesNotMatch(canal.stdout, /tag de release ausente/);
  });
});

describe("restaurar", () => {
  it("restaura um arquivo local com confirmação e sem revelar o caminho completo", () => {
    const raiz = prepararRaiz();
    const arquivo = path.join(raiz, "backups", "dump.gpg");
    escrever(arquivo, CONTEUDO_DUMP);
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      ["restaurar", "--json", "--modo-teste", "--sim", "--arquivo", arquivo],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.comando, "restaurar");
    assert.equal(resultado.json.etapas[0].id, "restaurar");
    assert.equal(resultado.json.etapas[0].detalhes.origem, "arquivo");
    assert.equal(resultado.json.etapas[0].detalhes.arquivo, "dump.gpg");
    assert.equal(resultado.stdout.includes(arquivo), false);
    const chamada = chamadaPorScript(chamadas, "restaurar.sh");
    assert.ok(chamada, "restaurar.sh não foi chamado");
    assert.deepEqual(chamada.argumentos.slice(1), ["--arquivo", arquivo, "--confirmar"]);
  });

  it("baixa do remoto e encaminha a confirmação para a restauração", () => {
    const raiz = prepararRaiz();
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      ["restaurar", "--json", "--modo-teste", "--sim", "--do-remoto"],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.etapas[0].detalhes.origem, "remoto");
    const chamada = chamadaPorScript(chamadas, "baixar-backup.sh");
    assert.ok(chamada, "baixar-backup.sh não foi chamado");
    assert.deepEqual(chamada.argumentos.slice(1), ["--restaurar", "--", "--confirmar"]);
    assert.ok(chamada.opcoes.env.PATH);
    assert.equal(
      chamada.opcoes.env.APP_ENV_FILE,
      path.join(raiz, "etc", "frequenciapp", "app.env"),
    );
  });

  it("recusa origem ausente, origem dupla e falta de --sim", () => {
    const raiz = prepararRaiz();
    const arquivo = path.join(raiz, "dump.gpg");
    escrever(arquivo, CONTEUDO_DUMP);
    const semOrigem = executar(
      ["restaurar", "--json", "--modo-teste", "--sim"],
      criarDeps({ raiz }).deps,
    );
    assert.equal(semOrigem.codigo, 2);
    assert.equal(semOrigem.json.codigo, "E_USO");

    const origemDupla = executar(
      ["restaurar", "--json", "--modo-teste", "--sim", "--arquivo", arquivo, "--do-remoto"],
      criarDeps({ raiz }).deps,
    );
    assert.equal(origemDupla.codigo, 2);
    assert.equal(origemDupla.json.codigo, "E_USO");

    const semSim = executar(
      ["restaurar", "--json", "--arquivo", arquivo],
      criarDeps({ raiz }).deps,
    );
    assert.equal(semSim.codigo, 2);
    assert.equal(semSim.json.codigo, "E_USO");
  });

  it("devolve E_RESTAURACAO quando o script falha", () => {
    const raiz = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.restaurarFalha = true;
    const resultado = executar(
      ["restaurar", "--json", "--modo-teste", "--sim", "--do-remoto"],
      criarDeps({ raiz, cenario }).deps,
    );
    assert.equal(resultado.codigo, 10);
    assert.equal(resultado.json.codigo, "E_RESTAURACAO");
    assert.equal(resultado.json.etapas[0].estado, "falhou");
    assert.doesNotMatch(resultado.stdout, /checksum divergente/);
  });
});

describe("desinstalar", () => {
  it("remove serviços e preserva os dados por padrão", () => {
    const raiz = prepararRaiz();
    prepararInstalacao(raiz);
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(["desinstalar", "--json", "--modo-teste"], deps);
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.comando, "desinstalar");
    assert.equal(resultado.json.etapas[0].id, "desinstalar");
    assert.equal(resultado.json.etapas[0].detalhes.removerDados, false);
    assert.ok(resultado.json.avisos.some((item) => item.codigo === "A_DADOS_PRESERVADOS"));
    for (const relativo of [
      "etc/systemd/system/frequenciapp-agenda.timer",
      "etc/systemd/system/frequenciapp-agenda.service",
      "etc/systemd/system/frequenciapp-falha@.service",
      "etc/cron.d/frequenciapp",
      "etc/logrotate.d/frequenciapp",
    ]) {
      assert.equal(fs.existsSync(path.join(raiz, relativo)), false, relativo);
    }
    for (const relativo of [
      "etc/frequenciapp/app.env",
      "opt/frequenciapp/compose.yml",
      "opt/frequenciapp-controlador/perfil.json",
      "var/backups/frequenciapp/banco/dump.gpg",
      "var/lib/frequenciapp/instalacao.json",
    ]) {
      assert.equal(fs.existsSync(path.join(raiz, relativo)), true, relativo);
    }
    const paradas = chamadas.filter(
      (chamada) =>
        path.basename(String(chamada.comando)) === "systemctl" &&
        ["stop", "disable"].includes(chamada.argumentos[0]),
    );
    assert.equal(paradas.length, 6);
    const recarga = chamadas.find(
      (chamada) =>
        path.basename(String(chamada.comando)) === "systemctl" &&
        chamada.argumentos[0] === "daemon-reload",
    );
    assert.ok(recarga, "daemon-reload não foi chamado");
    const docker = chamadas.find((chamada) => path.basename(String(chamada.comando)) === "docker");
    assert.ok(docker, "docker compose down não foi chamado");
    assert.deepEqual(docker.argumentos, [
      "compose",
      "-p",
      process.env.COMPOSE_PROJECT_NAME || "frequenciapp-teste",
      "down",
      "--remove-orphans",
    ]);
  });

  it("remove volumes e diretórios com --remover-dados e --sim", () => {
    const raiz = prepararRaiz();
    prepararInstalacao(raiz);
    const { deps, chamadas } = criarDeps({ raiz });
    const resultado = executar(
      ["desinstalar", "--json", "--modo-teste", "--sim", "--remover-dados"],
      deps,
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.etapas[0].detalhes.removerDados, true);
    assert.ok(resultado.json.avisos.some((item) => item.codigo === "A_DADOS_REMOVIDOS"));
    for (const relativo of [
      "etc/frequenciapp",
      "opt/frequenciapp",
      "opt/frequenciapp-controlador",
      "var/backups/frequenciapp",
      "var/lib/frequenciapp",
    ]) {
      assert.equal(fs.existsSync(path.join(raiz, relativo)), false, relativo);
    }
    assert.equal(fs.existsSync(raiz), true);
    const docker = chamadas.find((chamada) => path.basename(String(chamada.comando)) === "docker");
    assert.deepEqual(docker.argumentos, [
      "compose",
      "-p",
      process.env.COMPOSE_PROJECT_NAME || "frequenciapp-teste",
      "down",
      "--remove-orphans",
      "-v",
    ]);
  });

  it("exige --sim com --remover-dados mesmo no modo de teste", () => {
    const raiz = prepararRaiz();
    prepararInstalacao(raiz);
    const { deps } = criarDeps({ raiz });
    const resultado = executar(["desinstalar", "--json", "--modo-teste", "--remover-dados"], deps);
    assert.equal(resultado.codigo, 2);
    assert.equal(resultado.json.codigo, "E_USO");
    assert.equal(fs.existsSync(path.join(raiz, "etc", "frequenciapp")), true);
  });

  it("é idempotente na segunda execução", () => {
    const raiz = prepararRaiz();
    prepararInstalacao(raiz);
    const primeira = executar(["desinstalar", "--json", "--modo-teste"], criarDeps({ raiz }).deps);
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const segunda = executar(["desinstalar", "--json", "--modo-teste"], criarDeps({ raiz }).deps);
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(segunda.json.ok, true);
    assert.equal(segunda.json.etapas[0].estado, "concluida");
  });

  it("recusa caminho inválido antes de remover qualquer recurso", () => {
    const raiz = prepararRaiz();
    prepararInstalacao(raiz);
    const unidade = path.join(raiz, "etc", "systemd", "system", "frequenciapp-agenda.timer");
    const { deps } = criarDeps({ raiz });
    const resultado = executar(
      [
        "desinstalar",
        "--json",
        "--modo-teste",
        "--sim",
        "--remover-dados",
        "--diretorio-fonte",
        "/",
      ],
      deps,
    );
    assert.equal(resultado.codigo, 7);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(fs.existsSync(raiz), true);
    assert.equal(fs.existsSync(unidade), true);
    assert.equal(fs.existsSync(path.join(raiz, "etc", "frequenciapp")), true);
  });

  it("não expõe segredo de ambiente no JSON nem no log", () => {
    const raiz = prepararRaiz();
    prepararRecibo(raiz);
    const segredo = "sentinela-secreta-da-operacao";
    const { deps } = criarDeps({
      raiz,
      ambiente: { AUTH_SECRET: segredo, POSTGRES_PASSWORD: segredo },
    });
    const resultado = executar(["backup", "--json", "--modo-teste", "--sim"], deps);
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.stdout.includes(segredo), false);
    assert.equal(resultado.stderr.includes(segredo), false);
  });
});
