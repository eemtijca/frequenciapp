// Testa o aplicar do perfil simples com dublês de Docker, systemd, banco, rede, backup e saúde.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
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

function prepararDropbox(raiz) {
  const diretorio = path.join(raiz, "etc", "frequenciapp", "dropbox");
  fs.mkdirSync(diretorio, { recursive: true });
  fs.chmodSync(diretorio, 0o700);
  const token = path.join(diretorio, "token.json");
  const rclone = path.join(diretorio, "rclone.conf");
  const adocao = path.join(diretorio, "adocao.json");
  fs.writeFileSync(token, "{}\n", { mode: 0o600 });
  fs.chmodSync(token, 0o600);
  const rcloneTexto = "[dropbox]\ntype = dropbox\nroot_namespace = 123\n";
  fs.writeFileSync(rclone, rcloneTexto, { mode: 0o600 });
  fs.chmodSync(rclone, 0o600);
  const destino = "dropbox:frequenciapp/banco";
  fs.writeFileSync(
    adocao,
    `${JSON.stringify({
      versao: 1,
      adocao: "pasta-exclusiva-frequenciapp-v1",
      accountId: "dbid:conta",
      namespaceId: "123",
      folderId: "id:pasta",
      folderPath: "/frequenciapp/banco",
      destino,
      alvo: "alvo",
      banco: "frequencia",
      schema: "public",
      limiteBytes: 1024 * 1024,
      timeoutMs: 30000,
      tokenFile: token,
      rcloneConfig: rclone,
      rcloneConfigSha256: crypto.createHash("sha256").update(rcloneTexto).digest("hex"),
    })}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(adocao, 0o600);
  return { adocao, token, rclone, destino };
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
    if (script.endsWith("instalar-controlador.sh")) {
      if (resto.includes("--confirmar")) {
        const prefixo = resto[resto.indexOf("--prefixo") + 1];
        fs.mkdirSync(prefixo, { recursive: true });
        fs.writeFileSync(path.join(prefixo, "perfil.json"), JSON.stringify({ versao: 1 }), {
          mode: 0o600,
        });
        cenario.controlador = true;
      }
      return ok("");
    }
    if (script.endsWith("instalar-rotinas.sh")) return ok("");
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
      verificadoRemoto: cenario.verificadoRemoto === true,
    })}\n`,
    { mode: 0o600 },
  );
  cenario.backups = (cenario.backups ?? 0) + 1;
  return ok("Backup concluído.\n");
}

function argumentos(_raiz, senhaAdmin, extras = [], perfil = "simples") {
  return [
    "aplicar",
    "--sim",
    "--modo-teste",
    "--json",
    "--nao-interativo",
    "--perfil",
    perfil,
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
  it("propaga os seletores gerados ao Compose real sem iniciar serviços", (t) => {
    const env = { PATH: process.env.PATH, HOME: os.tmpdir() };
    const versao = spawnSync("docker", ["compose", "version"], { env, encoding: "utf8" });
    if (versao.error?.code === "ENOENT" || versao.status !== 0) {
      t.skip("Docker Compose não disponível para validar a configuração.");
      return;
    }
    assert.equal(versao.error, undefined);
    assert.equal(versao.signal, null);
    const { raiz, senhaAdmin } = prepararRaiz();
    const resultado = executar(
      argumentos(raiz, senhaAdmin, [
        "--agenda-notificacoes",
        "false",
        "--agenda-planilhas",
        "false",
        "--agenda-indicadores",
        "false",
        "--backup-planilhas-habilitado",
        "false",
      ]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    const dir = path.join(raiz, "etc/frequenciapp");
    const resolvido = spawnSync(
      "docker",
      [
        "compose",
        "--project-directory",
        RAIZ,
        "--env-file",
        path.join(dir, "app.env"),
        "--env-file",
        path.join(dir, "ops.env"),
        "-f",
        path.join(RAIZ, "compose.yml"),
        "-f",
        path.join(RAIZ, "compose.servidor.yml"),
        "-f",
        path.join(RAIZ, "compose.servidor-caddy.yml"),
        "config",
        "--format",
        "json",
      ],
      { env, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(resolvido.error, undefined);
    assert.equal(resolvido.signal, null);
    assert.equal(resolvido.status, 0, "O Compose recusou os ambientes sintéticos gerados.");
    const configuracao = JSON.parse(resolvido.stdout);
    for (const chave of ["AGENDA_NOTIFICACOES", "AGENDA_PLANILHAS", "AGENDA_INDICADORES"]) {
      assert.equal(configuracao.services.app.environment[chave], "false", chave);
    }
  });
  it("recusa aspas aninhadas que não representam um booleano literal", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const dir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(dir, { recursive: true });
    const texto = `AGENDA_PLANILHAS="'false'"\n`;
    const arquivo = path.join(dir, "app.env");
    fs.writeFileSync(arquivo, texto);
    const chamadas = [];
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas }),
    );
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(fs.readFileSync(arquivo, "utf8"), texto);
    assert.equal(chamadas.length, 0);
  });
  for (const [chave, campo, timer] of [
    ["AGENDA_HABILITADA", "agenda", "frequenciapp-agenda.timer"],
    ["BACKUP_PLANILHAS_HABILITADO", "backupPlanilhas", "frequenciapp-backup-planilhas.timer"],
  ]) {
    it(`preserva ${chave} desativada em app.env apesar de ops.env ativo`, () => {
      const { raiz, senhaAdmin } = prepararRaiz();
      const dir = path.join(raiz, "etc/frequenciapp");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "app.env"), `${chave}=false\n`);
      fs.writeFileSync(path.join(dir, "ops.env"), `${chave}=true\n`);
      const deps = criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] });
      const plano = argumentos(raiz, senhaAdmin);
      plano[0] = "planejar";
      const previsto = executar(plano, deps);
      assert.equal(previsto.codigo, 0);
      assert.equal(previsto.json.etapas[0].detalhes.rotinas[campo], false);
      const resultado = executar(argumentos(raiz, senhaAdmin), deps);
      assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
      assert.equal(valorEnv(fs.readFileSync(path.join(dir, "ops.env"), "utf8"), chave), "false");
      assert.equal(
        resultado.json.etapas
          .find((etapa) => etapa.id === "agendador")
          .detalhes.timers.includes(timer),
        false,
      );
    });
  }
  it("mostra os cinco seletores no plano e na simulação legíveis", () => {
    for (const comando of ["planejar", "aplicar"]) {
      for (const habilitar of [true, false]) {
        const { raiz, senhaAdmin } = prepararRaiz();
        const args = argumentos(raiz, senhaAdmin, [
          "--simular",
          "--agenda-habilitada",
          String(habilitar),
          "--agenda-notificacoes",
          String(!habilitar),
          "--agenda-planilhas",
          String(habilitar),
          "--agenda-indicadores",
          String(!habilitar),
          "--backup-planilhas-habilitado",
          String(!habilitar),
        ]).filter((arg) => arg !== "--json");
        args[0] = comando;
        const resultado = executar(
          args,
          criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
        );
        assert.equal(resultado.codigo, 0, resultado.stdout + resultado.stderr);
        for (const [rotulo, ligado] of [
          ["Agenda geral", habilitar],
          ["Notificações", !habilitar],
          ["Planilhas", habilitar],
          ["Indicadores", !habilitar],
          ["Backup de planilhas", !habilitar],
        ]) {
          assert.ok(
            resultado.stdout.includes(`- ${rotulo}: ${ligado ? "habilitada" : "desabilitada"}`),
            resultado.stdout,
          );
        }
      }
    }
  });

  it("preserva valores citados não gerenciados ao alterar um seletor", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const dir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(dir, { recursive: true });
    const ops = path.join(dir, "ops.env");
    const preservado =
      "BACKUP_ORIGEM='drive:pasta com espaço'\nOUTRA_CONFIGURACAO=\"literal com espaço\"\n";
    fs.writeFileSync(ops, "AGENDA_PLANILHAS=true\n" + preservado, { mode: 0o600 });
    const cenario = cenarioPadrao();
    for (const extras of [
      ["--agenda-planilhas", "false"],
      ["--retomar", "--agenda-planilhas", "false"],
    ]) {
      const resultado = executar(
        argumentos(raiz, senhaAdmin, extras),
        criarDeps({ raiz, cenario, chamadas: [] }),
      );
      assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
      assert.ok(fs.readFileSync(ops, "utf8").includes(preservado));
      const validado = spawnSync(
        process.execPath,
        [path.join(RAIZ, "scripts/servidor/ambiente-seguro.mjs"), ops],
        { encoding: "utf8" },
      );
      assert.equal(validado.error, undefined);
      assert.equal(validado.signal, null);
      assert.equal(validado.status, 0, validado.stderr);
      const consumido = spawnSync(
        "/bin/bash",
        [
          "--noprofile",
          "--norc",
          "-c",
          '. "$1"; printf "%s\\n" "$BACKUP_ORIGEM" "$OUTRA_CONFIGURACAO"',
          "consumo",
          ops,
        ],
        { encoding: "utf8", env: { PATH: process.env.PATH } },
      );
      assert.equal(consumido.error, undefined);
      assert.equal(consumido.signal, null);
      assert.equal(consumido.status, 0, consumido.stderr);
      assert.equal(consumido.stdout, "drive:pasta com espaço\nliteral com espaço\n");
    }
  });

  it("preserva seletores literais exportados pelo shell", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const dir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "app.env"), "export AGENDA_PLANILHAS='false'\n");
    fs.writeFileSync(
      path.join(dir, "ops.env"),
      "export AGENDA_HABILITADA=false\nexport BACKUP_PLANILHAS_HABILITADO='false'\n",
    );
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    for (const nome of ["app.env", "ops.env"]) {
      assert.equal(
        valorEnv(fs.readFileSync(path.join(dir, nome), "utf8"), "AGENDA_PLANILHAS"),
        "false",
      );
    }
    const ops = fs.readFileSync(path.join(dir, "ops.env"), "utf8");
    assert.equal(valorEnv(ops, "AGENDA_HABILITADA"), "false");
    assert.equal(valorEnv(ops, "BACKUP_PLANILHAS_HABILITADO"), "false");
    const timers = resultado.json.etapas.find((etapa) => etapa.id === "agendador").detalhes.timers;
    assert.equal(timers.includes("frequenciapp-agenda.timer"), false);
    assert.equal(timers.includes("frequenciapp-backup-planilhas.timer"), false);
  });
  for (const [flag, chave] of [
    ["--agenda-notificacoes", "AGENDA_NOTIFICACOES"],
    ["--agenda-planilhas", "AGENDA_PLANILHAS"],
    ["--agenda-indicadores", "AGENDA_INDICADORES"],
  ]) {
    it(`propaga a escolha ${flag} aos dois arquivos`, () => {
      const { raiz, senhaAdmin } = prepararRaiz();
      const resultado = executar(
        argumentos(raiz, senhaAdmin, [flag, "false"]),
        criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
      );
      assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
      for (const nome of ["app.env", "ops.env"]) {
        assert.equal(
          valorEnv(fs.readFileSync(path.join(raiz, "etc/frequenciapp", nome), "utf8"), chave),
          "false",
        );
      }
    });
  }
  it("recusa seletor duplicado antes de adquirir a trava", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const dir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "app.env"), "AGENDA_PLANILHAS=false\nAGENDA_PLANILHAS=true\n");
    let travou = false;
    const deps = criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] });
    deps.adquirirTrava = () => {
      travou = true;
      return { liberar() {} };
    };
    const resultado = executar(argumentos(raiz, senhaAdmin), deps);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(travou, false);
  });
  it("arquivo Google não injeta controles operacionais adicionais", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const google = path.join(raiz, "google.env");
    fs.writeFileSync(google, "AGENDA_HABILITADA=true\nBACKUP_PLANILHAS_HABILITADO=true\n", {
      mode: 0o600,
    });
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--arquivo-google", google, "--agenda-habilitada", "false"]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    const app = fs.readFileSync(path.join(raiz, "etc/frequenciapp/app.env"), "utf8");
    assert.doesNotMatch(app, /^AGENDA_HABILITADA=/m);
    assert.doesNotMatch(app, /^BACKUP_PLANILHAS_HABILITADO=/m);
  });
  it("simulação de retomada concluída não anuncia agendador pendente", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    assert.equal(
      executar(argumentos(raiz, senhaAdmin), criarDeps({ raiz, cenario, chamadas: [] })).codigo,
      0,
    );
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--retomar", "--simular"]),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0);
    const agendador = resultado.json.etapas.find((etapa) => etapa.id === "agendador");
    assert.equal(agendador.estado, "pulada");
    assert.equal(agendador.detalhes.rotinas, undefined);
  });
  it("recusa retomada que deixaria ambientes conflitantes sem reconciliar", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    assert.equal(
      executar(argumentos(raiz, senhaAdmin), criarDeps({ raiz, cenario, chamadas: [] })).codigo,
      0,
    );
    const dir = path.join(raiz, "etc/frequenciapp");
    const app = path.join(dir, "app.env");
    fs.writeFileSync(
      app,
      fs.readFileSync(app, "utf8").replace(/^AGENDA_PLANILHAS=true$/m, "AGENDA_PLANILHAS=false"),
    );
    let travou = false;
    const deps = criarDeps({ raiz, cenario, chamadas: [] });
    deps.adquirirTrava = () => {
      travou = true;
      return { liberar() {} };
    };
    const resultado = executar(argumentos(raiz, senhaAdmin, ["--desde-etapa", "agendador"]), deps);
    assert.notEqual(resultado.codigo, 0);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(travou, false);
  });
  it("recusa valor inválido no arquivo mesmo quando uma flag o sobrepõe", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const config = path.join(raiz, "invalido.json");
    fs.writeFileSync(config, JSON.stringify({ agendaPlanilhas: "talvez" }));
    const chamadas = [];
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--config", config, "--agenda-planilhas", "false"]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas }),
    );
    assert.notEqual(resultado.codigo, 0);
    assert.equal(resultado.json.codigo, "E_USO");
    assert.equal(chamadas.length, 0);
    assert.equal(fs.existsSync(estadoDaRaiz(raiz)), false);
  });
  it("persiste as escolhas explícitas na configuração da instalação", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const resultado = executar(
      argumentos(raiz, senhaAdmin, [
        "--agenda-planilhas",
        "false",
        "--backup-planilhas-habilitado",
        "true",
      ]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    const config = JSON.parse(
      fs.readFileSync(path.join(raiz, "etc/frequenciapp/instalador.json"), "utf8"),
    );
    assert.equal(config.agendaPlanilhas, "false");
    assert.equal(config.backupPlanilhasHabilitado, "true");
    assert.equal(Object.hasOwn(config, "agendaIndicadores"), false);
  });
  it("preserva a escolha explícita ao salvar configuração planejada", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const config = path.join(raiz, "escolhas.json");
    const args = argumentos(raiz, senhaAdmin, [
      "--agenda-planilhas",
      "false",
      "--salvar-config",
      config,
    ]);
    args[0] = "planejar";
    const deps = criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] });
    deps.caminhoTrava = () => path.join(raiz, "plano.lock");
    const resultado = executar(args, deps);
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    assert.equal(JSON.parse(fs.readFileSync(config, "utf8")).agendaPlanilhas, "false");
  });
  it("recusa escolhas quando a retomada exclui a etapa de ambiente", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    const primeiro = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(primeiro.codigo, 0);
    let trava = false;
    const deps = criarDeps({ raiz, cenario, chamadas: [] });
    deps.adquirirTrava = () => {
      trava = true;
      return { liberar() {} };
    };
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--desde-etapa", "agendador", "--agenda-planilhas", "false"]),
      deps,
    );
    assert.notEqual(resultado.codigo, 0);
    assert.equal(trava, false);
  });
  it("retoma a partir do ambiente quando recebe uma nova escolha", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    let resultado = executar(
      argumentos(raiz, senhaAdmin, ["--agenda-planilhas", "false"]),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    resultado = executar(
      argumentos(raiz, senhaAdmin, ["--retomar", "--agenda-planilhas", "true"]),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    assert.equal(
      valorEnv(
        fs.readFileSync(path.join(raiz, "etc/frequenciapp/app.env"), "utf8"),
        "AGENDA_PLANILHAS",
      ),
      "true",
    );
  });
  it("planejar mostra os seletores que serão aplicados", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const args = argumentos(raiz, senhaAdmin, ["--agenda-planilhas", "false"]);
    args[0] = "planejar";
    const resultado = executar(args, criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }));
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json?.erros));
    const rotinas = resultado.json.etapas.flatMap((etapa) =>
      etapa.detalhes?.rotinas ? [etapa.detalhes.rotinas] : [],
    );
    assert.equal(rotinas.length, 1);
    assert.equal(rotinas[0].planilhas, false);
    assert.equal(rotinas[0].backupPlanilhas, false);
  });
  it("recusa seletor inválido antes da trava e de qualquer mutação", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    const appEnv = path.join(configDir, "app.env");
    fs.writeFileSync(appEnv, "AGENDA_PLANILHAS=talvez\n");
    const deps = criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] });
    let trava = false;
    deps.adquirirTrava = () => {
      trava = true;
      return { liberar() {} };
    };
    const resultado = executar(argumentos(raiz, senhaAdmin), deps);
    assert.notEqual(resultado.codigo, 0);
    assert.equal(trava, false);
    assert.equal(fs.readFileSync(appEnv, "utf8"), "AGENDA_PLANILHAS=talvez\n");
    assert.deepEqual(fs.readdirSync(configDir), ["app.env"]);
  });
  it("aceita escolha explícita para alterar seletor preservado", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "app.env"), "AGENDA_PLANILHAS=false\n");
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--agenda-planilhas", "true"]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    assert.equal(
      valorEnv(fs.readFileSync(path.join(configDir, "app.env"), "utf8"), "AGENDA_PLANILHAS"),
      "true",
    );
  });
  it("não deixa credencial Google reativar seletor de agenda", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "app.env"), "AGENDA_PLANILHAS=false\n");
    const google = path.join(raiz, "google.env");
    fs.writeFileSync(google, "AGENDA_PLANILHAS=true\n", { mode: 0o600 });
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--arquivo-google", google]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    assert.equal(
      valorEnv(fs.readFileSync(path.join(configDir, "app.env"), "utf8"), "AGENDA_PLANILHAS"),
      "false",
    );
  });
  it("preserva controles desativados ao aplicar e repetir com destino do banco", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    const appEnv = path.join(configDir, "app.env");
    const opsEnv = path.join(configDir, "ops.env");
    const seletores = ["AGENDA_NOTIFICACOES", "AGENDA_PLANILHAS", "AGENDA_INDICADORES"];
    fs.writeFileSync(appEnv, seletores.map((chave) => `${chave}=false\n`).join(""));
    fs.writeFileSync(
      opsEnv,
      ["AGENDA_HABILITADA", ...seletores, "BACKUP_PLANILHAS_HABILITADO"]
        .map((chave) => `${chave}=false\n`)
        .join(""),
    );
    const cenario = cenarioPadrao();
    cenario.verificadoRemoto = true;
    for (let rodada = 0; rodada < 2; rodada += 1) {
      const chamadas = [];
      const resultado = executar(
        argumentos(raiz, senhaAdmin, ["--destino", "remoto:backup-banco"]),
        criarDeps({ raiz, cenario, chamadas }),
      );
      assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
      const app = fs.readFileSync(appEnv, "utf8");
      const ops = fs.readFileSync(opsEnv, "utf8");
      for (const chave of seletores) {
        assert.equal(valorEnv(app, chave), "false", `app ${chave} rodada ${rodada}`);
        assert.equal(valorEnv(ops, chave), "false", `ops ${chave} rodada ${rodada}`);
      }
      for (const chave of ["AGENDA_HABILITADA", "BACKUP_PLANILHAS_HABILITADO"]) {
        assert.equal(valorEnv(ops, chave), "false", `ops ${chave} rodada ${rodada}`);
      }
      assert.equal(valorEnv(ops, "BACKUP_REMOTO"), "remoto:backup-banco");
      const timers = resultado.json.etapas.find((etapa) => etapa.id === "agendador").detalhes
        .timers;
      assert.equal(timers.includes("frequenciapp-agenda.timer"), false);
      assert.equal(timers.includes("frequenciapp-backup-planilhas.timer"), false);
    }
  });

  it("não agenda backup de planilhas em instalação nova só por destino remoto do banco", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const cenario = cenarioPadrao();
    cenario.verificadoRemoto = true;
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--destino", "remoto:backup-banco"]),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    const ops = fs.readFileSync(path.join(raiz, "etc/frequenciapp/ops.env"), "utf8");
    assert.equal(valorEnv(ops, "BACKUP_REMOTO"), "remoto:backup-banco");
    assert.equal(valorEnv(ops, "BACKUP_PLANILHAS_HABILITADO"), "false");
    const timers = resultado.json.etapas.find((etapa) => etapa.id === "agendador").detalhes.timers;
    assert.equal(timers.includes("frequenciapp-backup-planilhas.timer"), false);
  });

  it("propaga seletor desativado mesmo quando só existe em um arquivo de ambiente", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    const appEnv = path.join(configDir, "app.env");
    const opsEnv = path.join(configDir, "ops.env");
    fs.writeFileSync(appEnv, "AGENDA_PLANILHAS=false\n");
    fs.writeFileSync(opsEnv, "AGENDA_NOTIFICACOES=false\n");
    const resultado = executar(
      argumentos(raiz, senhaAdmin),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    for (const caminho of [appEnv, opsEnv]) {
      const texto = fs.readFileSync(caminho, "utf8");
      assert.equal(valorEnv(texto, "AGENDA_PLANILHAS"), "false", caminho);
      assert.equal(valorEnv(texto, "AGENDA_NOTIFICACOES"), "false", caminho);
    }
  });

  it("mostra no plano de aplicar os efeitos ativos e desativados da instalação existente", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const configDir = path.join(raiz, "etc/frequenciapp");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "app.env"), "AGENDA_PLANILHAS=false\n");
    fs.writeFileSync(
      path.join(configDir, "ops.env"),
      "AGENDA_HABILITADA=true\nAGENDA_NOTIFICACOES=true\nAGENDA_INDICADORES=false\nBACKUP_PLANILHAS_HABILITADO=false\n",
    );
    const resultado = executar(
      argumentos(raiz, senhaAdmin, ["--simular"]),
      criarDeps({ raiz, cenario: cenarioPadrao(), chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    const agendador = resultado.json.etapas.find((etapa) => etapa.id === "agendador");
    assert.deepEqual(agendador.detalhes.rotinas, {
      agenda: true,
      notificacoes: true,
      planilhas: false,
      indicadores: false,
      backupPlanilhas: false,
    });
  });

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
        "agendador",
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

  it("aplica o perfil completo com Dropbox e controlador", () => {
    const { raiz, senhaAdmin } = prepararRaiz();
    const dropbox = prepararDropbox(raiz);
    const cenario = cenarioPadrao();
    cenario.verificadoRemoto = true;
    const resultado = executar(
      argumentos(
        raiz,
        senhaAdmin,
        [
          "--operador-controlador",
          "operador",
          "--config-dropbox",
          dropbox.adocao,
          "--arquivo-token-dropbox",
          dropbox.token,
          "--config-rclone",
          dropbox.rclone,
          "--destino",
          dropbox.destino,
        ],
        "completo",
      ),
      criarDeps({ raiz, cenario, chamadas: [] }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr || JSON.stringify(resultado.json?.erros));
    const estado = JSON.parse(fs.readFileSync(estadoDaRaiz(raiz), "utf8"));
    assert.equal(estado.perfil, "completo");
    assert.equal(estado.controlador.adotado, true);
    const ids = estado.etapas.map((etapa) => etapa.id);
    assert.equal(ids.length, 18);
    assert.equal(ids.indexOf("dropbox"), ids.indexOf("backup-inicial") - 1);
    assert.equal(ids.at(-1), "controlador");
    assert.equal(estado.etapas.find((etapa) => etapa.id === "agendador").estado, "pulada");
    assert.equal(estado.etapas.find((etapa) => etapa.id === "dropbox").detalhes.adotado, true);
    const ops = fs.readFileSync(path.join(raiz, "etc/frequenciapp/ops.env"), "utf8");
    assert.match(ops, /^BACKUP_DROPBOX_CONFIG=/m);
    assert.equal(fs.statSync(path.join(raiz, "etc/frequenciapp/ops.env")).mode & 0o777, 0o600);
    assert.equal(cenario.controlador, true);
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
    assert.equal(new Set(segunda.json.etapas.map((item) => item.id)).size, 16);
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
