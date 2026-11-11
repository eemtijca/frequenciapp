// Testa o aplicar do perfil simples com dublês de Docker, systemd, banco, rede, backup e saúde.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";
import { gravarArquivoAtomico, gravarEstado, lerEstado } from "../../scripts/instalador/estado.mjs";
import { ErroInstalador } from "../../scripts/instalador/json.mjs";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURE = path.join(RAIZ, "tests", "instalador", "fixtures", "aplicar", "repo");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RECIBO = "frequenciapp-20261111T120000Z-abcdef12.confirmado.json";
const DUMP = "frequenciapp-20261111T120000Z-abcdef12.dump.gpg";
const DIRETORIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-aplicar-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function prepararRaiz() {
  const raiz = temporario();
  const appDir = path.join(raiz, "opt", "frequenciapp");
  fs.cpSync(FIXTURE, appDir, { recursive: true });
  const senhaAdmin = path.join(raiz, "senha-admin");
  fs.writeFileSync(senhaAdmin, "SenhaAdmin123\n", { mode: 0o600 });
  fs.chmodSync(senhaAdmin, 0o600);
  return { raiz, appDir, senhaAdmin };
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
    instalacao: { existente: false },
    avisos: [],
  };
}

function pacote(idNome, nome, extra = {}) {
  return {
    pacote: idNome,
    nome,
    presente: true,
    comandoPresente: true,
    versao: "1.0.0",
    versaoMinima: "",
    acao: "nenhuma",
    grupo: "base",
    origem: "distro",
    ...extra,
  };
}

function auditoriaFalsa(cenario) {
  const pacotes = [
    pacote("bash", "bash"),
    pacote("curl", "curl"),
    pacote("ca-certificates", "ca-certificates"),
    pacote("git", "git"),
    pacote("jq", "jq", cenario.instalouPacotes ? {} : { presente: false, acao: "instalar" }),
    pacote("openssl", "openssl"),
    pacote("gpg", "gnupg"),
    pacote("tar", "tar"),
    pacote("gzip", "gzip"),
    pacote("flock", "util-linux"),
    pacote("sha256sum", "coreutils"),
    pacote("docker", "docker-ce", { grupo: "docker" }),
    pacote("compose", "docker-compose-plugin", { grupo: "docker", versao: "2.39.1" }),
  ];
  return {
    gerenciador: "apt",
    familia: "debian",
    pacotes,
    resumo: {
      total: pacotes.length,
      presentes: pacotes.filter((item) => item.presente).length,
      faltantes: pacotes.filter((item) => item.acao === "instalar").length,
      desatualizados: 0,
    },
    avisos: [],
  };
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", erro: null };
}

function falha(stderr = "") {
  return { status: 1, stdout: "", stderr, erro: null };
}

function criarDeps({ raiz, cenario, chamadas }) {
  const deps = {
    raiz,
    uid: () => 0,
    usuarioServico: "frequenciapp",
    agora: () => "2026-11-11T12:00:00Z",
    esperar: () => {},
    lerDisco: () => ({ livreBytes: 50 * 1024 ** 3, livreGiB: 50, totalGiB: 100 }),
    memoriaTotal: () => 8 * 1024 ** 3,
    raizRepositorio: FIXTURE,
    detectar: deteccaoFalsa,
    detectarBasico: deteccaoFalsa,
    auditarPacotes: () => auditoriaFalsa(cenario),
    lerEstado,
    gravarEstado,
    gravarArquivoAtomico,
    comandoExiste: (nome) => ["ss", "ufw", "systemctl", "timedatectl"].includes(nome),
    adquirirTrava: () => {
      if (cenario.travaOcupada) {
        throw new ErroInstalador("E_VALIDACAO", "A trava do instalador está ocupada.", {
          documentacao: "docs/instalador.md#trava",
        });
      }
      return { liberar() {} };
    },
    executar: (comando, argumentos = [], opcoes = {}) =>
      simular({ raiz, cenario, chamadas }, comando, argumentos, opcoes),
  };
  return deps;
}

function simular(contexto, comando, argumentos, opcoes) {
  const { raiz, cenario, chamadas } = contexto;
  chamadas.push({ comando, argumentos, opcoes });
  const nome = path.basename(String(comando));
  if (nome === "id") {
    if (argumentos[0] === "-u") return ok("1000");
    if (argumentos[0] === "-nG") return ok("frequenciapp docker");
    return ok("");
  }
  if (nome === "apt-get") {
    if (argumentos[0] === "install") cenario.instalouPacotes = true;
    return ok("");
  }
  if (nome === "docker") {
    if (argumentos[0] === "--version") return ok("Docker version 29.8.2, build teste");
    if (argumentos[0] === "info") return ok("29.8.2");
    if (argumentos[0] === "compose" && argumentos[1] === "version") return ok("2.39.1");
    if (argumentos[0] === "exec" && argumentos[2] === "pg_isready") return ok("accepting");
    if (argumentos[0] === "exec" && argumentos[2] === "postgres") {
      return ok("postgres (PostgreSQL) 17.4");
    }
    return ok("");
  }
  if (nome === "ss") {
    return ok(
      cenario.portaOcupada
        ? "State Recv-Q Send-Q Local Address:Port\nLISTEN 0 4096 0.0.0.0:80 0.0.0.0:*\n"
        : "State Recv-Q Send-Q Local Address:Port\n",
    );
  }
  if (nome === "bash") {
    const script = String(argumentos[0] ?? "");
    const resto = argumentos.slice(1);
    if (script.endsWith("compose.sh")) return simularCompose(contexto, resto);
    if (script.endsWith("identidade.sh")) {
      if (resto.includes("--adotar")) {
        const identidade = path.join(raiz, "etc/frequenciapp/identidade.json");
        fs.mkdirSync(path.dirname(identidade), { recursive: true });
        fs.writeFileSync(identidade, "{}\n", { mode: 0o600 });
        cenario.identidade = true;
      }
      return ok("");
    }
    if (script.endsWith("backup-banco.sh")) return simularBackup(contexto, opcoes);
    return ok("");
  }
  if (nome === "node" && argumentos.some((item) => String(item).endsWith("recibos.mjs"))) {
    return ok("");
  }
  if (nome === "git") {
    if (argumentos.includes("--is-inside-work-tree")) return ok("true");
    if (argumentos.includes("HEAD")) return ok(`${COMMIT}\n`);
    return ok("");
  }
  if (nome === "useradd" || nome === "usermod" || nome === "chown" || nome === "chmod") {
    return ok("");
  }
  if (nome === "systemctl") return ok("active");
  if (nome === "ufw") {
    if (argumentos[0] === "status") return ok("Status: active\n22/tcp ALLOW Anywhere\n");
    return ok("");
  }
  if (nome === "sleep") return ok("");
  return ok("");
}

function simularCompose(contexto, argumentos) {
  const { cenario } = contexto;
  if (argumentos[0] === "config") return ok("");
  if (argumentos[0] === "ps") {
    if (argumentos.includes("-q")) return ok("dbid\n");
    if (argumentos.includes("json")) {
      if (!cenario.pilhaSaudavel) return ok("[]");
      return ok(
        JSON.stringify([
          { Service: "app", State: "running", Health: "healthy" },
          { Service: "db", State: "running", Health: "healthy" },
          { Service: "caddy", State: "running", Health: "healthy" },
        ]),
      );
    }
    return ok("");
  }
  if (argumentos[0] === "up") {
    cenario.pilhaSaudavel = true;
    cenario.up = (cenario.up ?? 0) + 1;
    return ok("");
  }
  if (argumentos[0] === "exec") {
    if (argumentos.includes("./docker/app/migrar.mjs")) {
      if (cenario.migracaoFalha) return falha("falha simulada na migração");
      cenario.migracoes = (cenario.migracoes ?? 0) + 1;
      return ok("[migrar] Banco já está na última revisão.\n");
    }
    if (argumentos.includes("psql")) {
      if (argumentos.some((item) => String(item).includes("select 1 from usuarios"))) {
        return ok(cenario.contaExistente ? "1\n" : "\n");
      }
      return ok("");
    }
    if (
      argumentos.some(
        (item) =>
          String(item).endsWith("criar-admin.mjs") ||
          String(item).endsWith("criar-coordenacao.mjs"),
      )
    ) {
      cenario.contaExistente = true;
      cenario.contas = (cenario.contas ?? 0) + 1;
      return ok("");
    }
    if (argumentos.includes("-e") && argumentos.includes("app")) {
      if (cenario.saudeFalha) return falha("health check falhou");
      return ok(JSON.stringify({ ok: true, versao: "1.0.0", commit: COMMIT }));
    }
    return ok("");
  }
  return ok("");
}

function simularBackup(contexto, opcoes) {
  const { raiz, cenario } = contexto;
  if (cenario.backupFalha) return falha("falha simulada no backup");
  const estadoDir = opcoes.env?.ESTADO_DIR ?? path.join(raiz, "var/lib/frequenciapp");
  const backupDir =
    opcoes.env?.BACKUP_BANCO_DIR ?? path.join(raiz, "var/backups/frequenciapp/banco");
  const conteudo = `dump sintetico ${(cenario.backups ?? 0) + 1}`;
  const sha256 = crypto.createHash("sha256").update(conteudo).digest("hex");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, DUMP), conteudo);
  const recibos = path.join(estadoDir, "recibos");
  fs.mkdirSync(recibos, { recursive: true });
  fs.writeFileSync(path.join(recibos, RECIBO), "{}\n", { mode: 0o600 });
  fs.writeFileSync(path.join(backupDir, RECIBO), "{}\n", { mode: 0o600 });
  fs.writeFileSync(
    path.join(estadoDir, "ultimo-backup.json"),
    `${JSON.stringify({
      em: "2026-11-11T12:00:00Z",
      modo: "compose",
      criptografia: "gpg",
      arquivo: DUMP,
      sha256,
      recibo: RECIBO,
      verificadoRemoto: false,
    })}\n`,
    { mode: 0o600 },
  );
  cenario.backups = (cenario.backups ?? 0) + 1;
  return ok("Backup concluído.\n");
}

function argumentos(_raiz, senhaAdmin, extras = []) {
  return [
    "aplicar",
    "--sim",
    "--modo-teste",
    "--json",
    "--nao-interativo",
    "--perfil",
    "simples",
    "--canal",
    "release",
    "--tag",
    "v1.0.0",
    "--dominio",
    "frequencia.teste",
    "--email-acme",
    "admin@escola.teste",
    "--email-admin",
    "direcao@escola.teste",
    "--arquivo-senha-admin",
    senhaAdmin,
    "--destinatario-gpg",
    "A".repeat(40),
    "--proxy",
    "caddy",
    "--tls",
    "acme",
    "--diretorio-fonte",
    "/opt/frequenciapp",
    ...extras,
  ];
}

function executar(argumentosCli, deps) {
  let stdout = "";
  let stderr = "";
  const codigo = principal(
    argumentosCli,
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

function cenarioPadrao() {
  return {
    portaOcupada: false,
    pilhaSaudavel: false,
    migracaoFalha: false,
    saudeFalha: false,
    backupFalha: false,
    contaExistente: false,
    travaOcupada: false,
    instalouPacotes: false,
  };
}

function estadoDaRaiz(raiz) {
  return path.join(raiz, "var/lib/frequenciapp/instalacao.json");
}

function valorEnv(texto, chave) {
  const combinacao = new RegExp(`^${chave}=(.*)$`, "m").exec(texto);
  return combinacao ? combinacao[1] : "";
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("aplicar do perfil simples", () => {
  it("percorre as etapas, grava estado, ambiente e primeiro backup sem vazar segredo", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const chamadas = [];
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.codigo, null);
    assert.deepEqual(
      resultado.json.etapas.map((etapa) => etapa.id),
      [
        "preflight",
        "pacotes",
        "docker",
        "usuario",
        "diretorios",
        "fonte",
        "ambiente",
        "proxy",
        "compose",
        "banco",
        "migracoes",
        "contas",
        "saude",
        "backup-inicial",
        "firewall",
      ],
    );
    const estadoCaminho = estadoDaRaiz(raiz);
    const estadoLido = lerEstado({ caminho: estadoCaminho });
    assert.equal(estadoLido.estado.perfil, "simples");
    assert.equal(estadoLido.estado.canal, "release");
    assert.equal(estadoLido.estado.tag, "v1.0.0");
    assert.equal(estadoLido.estado.commit, COMMIT);
    assert.equal(estadoLido.estado.migradorSha256.length, 64);
    assert.ok(estadoLido.estado.backup.ultimoRecibo);
    assert.equal(fs.statSync(estadoCaminho).mode & 0o777, 0o600);

    const appEnv = path.join(raiz, "etc/frequenciapp/app.env");
    const opsEnv = path.join(raiz, "etc/frequenciapp/ops.env");
    const configEfetiva = path.join(raiz, "etc/frequenciapp/instalador.json");
    assert.equal(fs.statSync(appEnv).mode & 0o777, 0o600);
    assert.equal(fs.statSync(opsEnv).mode & 0o777, 0o600);
    assert.equal(fs.statSync(configEfetiva).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(configEfetiva, "utf8")).perfil, "simples");
    const appTexto = fs.readFileSync(appEnv, "utf8");
    const auth = valorEnv(appTexto, "AUTH_SECRET");
    const senhaBanco = valorEnv(appTexto, "POSTGRES_PASSWORD");
    const cron = valorEnv(appTexto, "CRON_SECRET");
    const senhaAdminTexto = fs.readFileSync(senhaAdmin, "utf8").trim();
    for (const segredo of [auth, senhaBanco, cron, senhaAdminTexto]) {
      assert.ok(segredo.length >= 8);
      assert.equal(resultado.stdout.includes(segredo), false, "segredo no stdout");
      assert.equal(
        fs.readFileSync(estadoCaminho, "utf8").includes(segredo),
        false,
        "segredo no estado",
      );
    }
    const log = path.join(raiz, "var/log/frequenciapp/instalador.log");
    if (fs.existsSync(log)) {
      const logTexto = fs.readFileSync(log, "utf8");
      assert.equal(logTexto.includes(auth), false, "segredo no log");
      assert.equal(logTexto.includes(senhaBanco), false, "segredo no log");
    }
    assert.equal(cenario.up, 1);
    assert.equal(cenario.backups, 1);
  });

  it("na segunda execução não reinstala, não recria container, não reescreve ambiente e não refaz backup", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const primeira = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const appEnv = path.join(raiz, "etc/frequenciapp/app.env");
    const opsEnv = path.join(raiz, "etc/frequenciapp/ops.env");
    const appAntes = fs.readFileSync(appEnv, "utf8");
    const opsAntes = fs.readFileSync(opsEnv, "utf8");
    const chamadas = [];
    const segunda = executar(argumentos(raiz, senhaAdmin), criarDeps({ raiz, cenario, chamadas }));
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(segunda.json.ok, true);
    assert.ok(segunda.json.avisos.some((item) => item.codigo === "A_SEM_MUDANCAS"));
    assert.equal(fs.readFileSync(appEnv, "utf8"), appAntes);
    assert.equal(fs.readFileSync(opsEnv, "utf8"), opsAntes);
    assert.equal(
      chamadas.filter((item) => item.comando === "apt-get" && item.argumentos.includes("install"))
        .length,
      0,
    );
    assert.equal(
      chamadas.filter(
        (item) =>
          item.comando === "bash" &&
          String(item.argumentos[0]).endsWith("compose.sh") &&
          item.argumentos.includes("up"),
      ).length,
      0,
    );
    assert.equal(
      chamadas.filter(
        (item) => item.comando === "bash" && String(item.argumentos[0]).endsWith("backup-banco.sh"),
      ).length,
      0,
    );
    const etapaCompose = segunda.json.etapas.find((item) => item.id === "compose");
    assert.equal(etapaCompose.detalhes.semMudancas, true);
    const etapaMigracoes = segunda.json.etapas.find((item) => item.id === "migracoes");
    assert.equal(etapaMigracoes.detalhes.semMudancas, true);
  });

  it("falha na migração, preserva o estado e retoma da etapa exata", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.migracaoFalha = true;
    const primeira = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(primeira.codigo, 9);
    assert.equal(primeira.json.codigo, "E_SAUDE");
    const estadoCaminho = estadoDaRaiz(raiz);
    const estadoFalha = lerEstado({ caminho: estadoCaminho }).estado;
    const etapaFalha = estadoFalha.etapas.find((item) => item.id === "migracoes");
    assert.equal(etapaFalha.estado, "falhou");
    assert.equal(etapaFalha.codigo, "E_SAUDE");
    assert.ok(fs.existsSync(estadoCaminho));
    cenario.migracaoFalha = false;
    const chamadas = [];
    const segunda = executar(
      argumentos(raiz, senhaAdmin, ["--retomar"]),
      criarDeps({ raiz, cenario, chamadas }),
    );
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(segunda.json.ok, true);
    const etapaMigracoes = segunda.json.etapas.find((item) => item.id === "migracoes");
    assert.equal(etapaMigracoes.estado, "concluida");
    assert.equal(new Set(segunda.json.etapas.map((item) => item.id)).size, 15);
    assert.equal(
      chamadas.filter((item) => item.comando === "apt-get" && item.argumentos.includes("install"))
        .length,
      0,
    );
    assert.equal(
      chamadas.filter(
        (item) =>
          item.comando === "bash" &&
          String(item.argumentos[0]).endsWith("compose.sh") &&
          item.argumentos.includes("up"),
      ).length,
      0,
    );
  });

  it("falha de backup impede declarar sucesso e preserva o estado", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.backupFalha = true;
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 10);
    assert.equal(resultado.json.codigo, "E_BACKUP");
    assert.equal(resultado.json.ok, false);
    const estado = lerEstado({ caminho: estadoDaRaiz(raiz) }).estado;
    assert.equal(estado.etapas.find((item) => item.id === "backup-inicial").estado, "falhou");
    assert.equal(estado.backup.ultimoRecibo, null);
  });

  it("falha de saúde interrompe antes do backup e --pular-saude permite seguir com aviso", () => {
    const primeiro = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.saudeFalha = true;
    const falhou = executar(
      argumentos(primeiro.raiz, primeiro.senhaAdmin),
      criarDeps({ raiz: primeiro.raiz, cenario, chamadas: [] }),
    );
    assert.equal(falhou.codigo, 9, JSON.stringify(falhou.json?.erros ?? falhou.stderr));
    assert.equal(falhou.json.codigo, "E_SAUDE");
    assert.equal(cenario.backups, undefined);

    const segundo = prepararRaiz();
    const cenarioPulado = cenarioPadrao();
    cenarioPulado.saudeFalha = true;
    const pulado = executar(
      argumentos(segundo.raiz, segundo.senhaAdmin, ["--pular-saude"]),
      criarDeps({ raiz: segundo.raiz, cenario: cenarioPulado, chamadas: [] }),
    );
    assert.equal(pulado.codigo, 0, pulado.stderr);
    assert.equal(pulado.json.ok, true);
    assert.equal(pulado.json.etapas.find((item) => item.id === "saude").estado, "pulada");
    assert.equal(cenarioPulado.backups, 1);
  });

  it("recusa porta ocupada antes de criar estado", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.portaOcupada = true;
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 6);
    assert.equal(resultado.json.codigo, "E_REDE");
    assert.equal(fs.existsSync(estadoDaRaiz(raiz)), false);
  });

  it("recusa estado corrompido sem sobrescrever o arquivo", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const estadoCaminho = estadoDaRaiz(raiz);
    fs.mkdirSync(path.dirname(estadoCaminho), { recursive: true });
    fs.writeFileSync(estadoCaminho, "{ estado invalido", { mode: 0o600 });
    const cenario = cenarioPadrao();
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 7);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(fs.readFileSync(estadoCaminho, "utf8"), "{ estado invalido");
  });

  it("com --nao-iniciar valida a configuração e não sobe a pilha", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const chamadas = [];
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--nao-iniciar"]),
      criarDeps({ raiz, cenario, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.ok, true);
    for (const id of ["banco", "migracoes", "contas", "saude", "backup-inicial"]) {
      assert.equal(resultado.json.etapas.find((item) => item.id === id).estado, "pulada", id);
    }
    assert.equal(
      chamadas.filter(
        (item) =>
          item.comando === "bash" &&
          String(item.argumentos[0]).endsWith("compose.sh") &&
          item.argumentos.includes("up"),
      ).length,
      0,
    );
    assert.equal(
      chamadas.filter(
        (item) => item.comando === "bash" && String(item.argumentos[0]).endsWith("backup-banco.sh"),
      ).length,
      0,
    );
  });

  it("recusa a trava ocupada antes de qualquer mutação", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.travaOcupada = true;
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 7);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(fs.existsSync(estadoDaRaiz(raiz)), false);
  });

  it("retoma com --desde-etapa sem reexecutar as etapas anteriores", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const primeira = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const chamadas = [];
    const segunda = executar(
      argumentos(raiz, senhaAdmin, ["--desde-etapa", "saude"]),
      criarDeps({ raiz, cenario, chamadas }),
    );
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(
      chamadas.filter(
        (item) =>
          item.comando === "bash" &&
          String(item.argumentos[0]).endsWith("compose.sh") &&
          item.argumentos.includes("up"),
      ).length,
      0,
    );
    assert.equal(
      chamadas.filter((item) => item.comando === "apt-get" && item.argumentos.includes("install"))
        .length,
      0,
    );
    assert.ok(
      chamadas.some(
        (item) =>
          item.comando === "bash" &&
          String(item.argumentos[0]).endsWith("compose.sh") &&
          item.argumentos.includes("-e") &&
          item.argumentos.includes("app"),
      ),
    );
  });

  it("--forcar repete a etapa selecionada", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const primeira = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const chamadas = [];
    const segunda = executar(
      argumentos(raiz, senhaAdmin, ["--forcar", "--desde-etapa", "backup-inicial"]),
      criarDeps({ raiz, cenario, chamadas }),
    );
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(cenario.backups, 2);
    assert.ok(
      chamadas.some(
        (item) => item.comando === "bash" && String(item.argumentos[0]).endsWith("backup-banco.sh"),
      ),
    );
  });

  it("--autoteste valida o contrato sem criar estado", () => {
    const { raiz } = prepararRaiz();
    const cenario = cenarioPadrao();
    const resultado = executar(
      ["aplicar", "--autoteste", "--modo-teste", "--json", "--nao-interativo"],
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.etapas[0].id, "autoteste");
    assert.equal(fs.existsSync(estadoDaRaiz(raiz)), false);
    assert.equal(fs.existsSync(path.join(raiz, "var/log/frequenciapp/instalador.log")), false);
  });
});
