// Exercita a CLI administrativa com Git e proprietários reais, sem daemon Docker ou rede.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { principal } from "../../../scripts/instalador/cli.mjs";

const REPO = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const FIXTURE = path.join(REPO, "tests/instalador/fixtures/aplicar/repo");
const OPERADOR = { uid: 1000, gid: 1000 };
const SERVICO = { uid: 1, gid: 1 };
const ENV = {
  PATH: process.env.PATH,
  HOME: "/scratch",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};

function real(comando, argumentos, opcoes = {}) {
  const resultado = spawnSync(comando, argumentos, {
    encoding: "utf8",
    env: ENV,
    timeout: 30000,
    ...opcoes,
  });
  return { ...resultado, erro: resultado.error ?? null };
}

function exigir(comando, argumentos, opcoes = {}) {
  const resultado = real(comando, argumentos, opcoes);
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.signal, null);
  assert.equal(resultado.status, 0, resultado.stderr);
  return resultado.stdout.trim();
}

function arvore(diretorio, uid, gid) {
  for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
    const arquivo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) arvore(arquivo, uid, gid);
    fs.chmodSync(arquivo, entrada.isDirectory() ? 0o755 : 0o644);
    fs.chownSync(arquivo, uid, gid);
  }
  fs.chmodSync(diretorio, 0o755);
  fs.chownSync(diretorio, uid, gid);
}

function metadados(diretorio) {
  const resultado = [];
  function visitar(atual) {
    for (const nome of fs.readdirSync(atual).sort()) {
      const arquivo = path.join(atual, nome);
      const info = fs.lstatSync(arquivo);
      resultado.push({
        caminho: path.relative(diretorio, arquivo),
        uid: info.uid,
        gid: info.gid,
        modo: info.mode,
        conteudo: info.isFile()
          ? crypto.createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex")
          : null,
      });
      if (info.isDirectory()) visitar(arquivo);
    }
  }
  visitar(diretorio);
  return resultado;
}

function preparar() {
  assert.equal(process.getuid(), 0, "Esta suíte exige root interno ao contêiner administrativo.");
  assert.equal(process.geteuid(), 0);
  assert.match(fs.readFileSync("/proc/self/status", "utf8"), /NoNewPrivs:\s+1/);
  assert.equal(exigir("id", ["-u", "daemon"]), String(SERVICO.uid));
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "fonte-cli-"));
  fs.chmodSync(raiz, 0o755);
  const origem = path.join(raiz, "operador");
  fs.cpSync(FIXTURE, origem, { recursive: true });
  arvore(origem, OPERADOR.uid, OPERADOR.gid);
  const git = (...args) => exigir("git", ["-C", origem, ...args], OPERADOR);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Operador sintético");
  git("config", "user.email", "operador@example.invalid");
  git("add", ".");
  git(
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "test: cria fonte pública",
  );
  const commit = git("rev-parse", "HEAD");
  const appDir = path.join(raiz, "opt/frequenciapp");
  return { raiz, origem, appDir, git, commit, chamadas: [] };
}

function ok(stdout = "") {
  return { status: 0, stdout, stderr: "", erro: null };
}

function deps(caso) {
  const detectar = () => ({
    distro: "ubuntu",
    versaoDistro: "26.04",
    familia: "debian",
    tier: 1,
    arquitetura: "amd64",
    gerenciador: "apt",
    iniciador: "systemd",
    firewall: "ausente",
    avisos: [],
    docker: {
      presente: true,
      daemon: "ativo",
      composePresente: true,
      composeSuficiente: true,
      usuarioNoGrupo: true,
    },
    instalacao: { existente: false },
  });
  return {
    raiz: caso.raiz,
    raizRepositorio: caso.origem,
    usuarioServico: "daemon",
    detectar,
    detectarBasico: detectar,
    auditarPacotes: () => ({
      pacotes: [],
      avisos: [],
      gerenciador: "apt",
      resumo: { total: 0, faltantes: 0 },
    }),
    lerDisco: () => ({ livreBytes: 10 * 1024 ** 3, livreGiB: 10 }),
    memoriaTotal: () => 4 * 1024 ** 3,
    esperar: () => {},
    comandoExiste: (nome) => ["systemctl", "timedatectl"].includes(nome),
    executar(comando, argumentos = [], opcoes = {}) {
      caso.chamadas.push({ comando, argumentos, opcoes });
      // Sem DAC_OVERRIDE, a posse dos diretórios privados de outras etapas é simulada.
      // O chown do checkout operacional permanece real e é verificado no teste.
      if (comando === "chown" && !argumentos.includes(caso.appDir)) return ok();
      if (["git", "cp", "chown", "chmod", "openssl"].includes(comando)) {
        const opcoesReais =
          comando === "git" && caso.gitAusente
            ? { ...opcoes, env: { ...opcoes.env, PATH: path.join(caso.raiz, "ausente") } }
            : opcoes;
        const resultado = real(comando, argumentos, opcoesReais);
        caso.chamadas.at(-1).resultado = resultado;
        return resultado;
      }
      if (comando === "id") {
        if (argumentos[0] === "-nG") return ok("daemon docker");
        return real(comando, argumentos, opcoes);
      }
      if (comando === "docker") {
        if (argumentos.includes("postgres")) return ok("postgres (PostgreSQL) 17.4");
        return ok(argumentos[0] === "info" ? "29.0.0" : "2.39.1");
      }
      if (comando === "systemctl") return ok("active");
      if (comando === "timedatectl") return ok("America/Fortaleza");
      if (comando === "bash" && argumentos[0]?.endsWith("compose.sh")) {
        if (caso.falhaCompose) return { status: 1, stdout: "", stderr: "compose sintético falhou" };
        if (argumentos[1] === "ps" && argumentos.includes("-q")) return ok("db-sintetico");
        if (argumentos[1] === "ps") return ok("[]");
        if (argumentos[1] === "up") {
          caso.argumentoBuild = /^COMMIT_SHA=(.*)$/m.exec(
            fs.readFileSync(path.join(caso.raiz, "etc/frequenciapp/app.env"), "utf8"),
          )?.[1];
        }
        if (argumentos.includes("-e") && argumentos.includes("app")) {
          return ok(
            JSON.stringify(
              caso.saude ?? { ok: true, versao: "1.0.0", commit: caso.argumentoBuild },
            ),
          );
        }
        return ok();
      }
      if (comando === "bash" && argumentos[0]?.endsWith("identidade.sh")) {
        const arquivo = path.join(caso.raiz, "etc/frequenciapp/identidade.json");
        fs.writeFileSync(arquivo, "{}\n", { mode: 0o600 });
        return ok();
      }
      if (comando === "bash" && argumentos[0]?.endsWith("backup-banco.sh")) {
        return { status: 1, stdout: "", stderr: "Backup não exercitado nesta fatia." };
      }
      assert.fail(`Transporte não previsto: ${comando} ${argumentos.join(" ")}`);
    },
  };
}

function aplicar(caso, extras = []) {
  let stdout = "";
  let stderr = "";
  const anterior = process.env.SUDO_UID;
  process.env.SUDO_UID = String(OPERADOR.uid);
  let codigo;
  try {
    codigo = principal(
      [
        "aplicar",
        "--sim",
        "--json",
        "--nao-interativo",
        ...(caso.iniciar ? [] : ["--nao-iniciar"]),
        "--pular-contas",
        "--canal",
        caso.canal ?? "main",
        ...(caso.canal === "release" ? ["--tag", "v1.2.3"] : ["--permitir-instavel"]),
        "--dominio",
        "frequencia.teste",
        "--email-acme",
        "tls@example.invalid",
        "--destinatario-gpg",
        "A".repeat(40),
        "--diretorio-fonte",
        "/opt/frequenciapp",
        ...extras,
      ],
      {
        stdout: {
          write: (texto) => {
            stdout += texto;
          },
        },
        stderr: {
          write: (texto) => {
            stderr += texto;
          },
        },
      },
      deps(caso),
    );
  } finally {
    if (anterior === undefined) delete process.env.SUDO_UID;
    else process.env.SUDO_UID = anterior;
  }
  return { codigo, json: JSON.parse(stdout), stderr };
}

function estado(caso) {
  return JSON.parse(
    fs.readFileSync(path.join(caso.raiz, "var/lib/frequenciapp/instalacao.json"), "utf8"),
  );
}
function commitAmbiente(caso) {
  const arquivo = path.join(caso.raiz, "etc/frequenciapp/app.env");
  fs.chmodSync(path.join(caso.raiz, "etc"), 0o755);
  fs.chmodSync(path.dirname(arquivo), 0o755);
  fs.chmodSync(arquivo, 0o644);
  const texto = fs.readFileSync(arquivo, "utf8");
  return /^COMMIT_SHA=(.*)$/m.exec(texto)?.[1];
}

it("recusa SHA de referência sem objeto de commit no checkout", () => {
  const caso = preparar();
  assert.equal(aplicar(caso).codigo, 0);
  const objetos = path.join(caso.appDir, ".git/objects");
  for (const nome of fs.readdirSync(objetos))
    exigir("rm", ["-r", path.join(objetos, nome)], SERVICO);
  const resultado = aplicar(caso);
  assert.equal(resultado.json.codigo, "E_VALIDACAO", JSON.stringify(resultado.json.erros));
  assert.notEqual(resultado.codigo, 0);
  assert.equal(estado(caso).commit, caso.commit);
});

it("não aceita SHA autodeclarado em distribuição sem metadados Git", () => {
  const caso = preparar();
  const distribuicao = path.join(caso.raiz, "distribuicao");
  fs.cpSync(FIXTURE, distribuicao, { recursive: true });
  caso.origem = distribuicao;
  const resultado = aplicar(caso, ["--ref", "a".repeat(40)]);
  assert.notEqual(resultado.codigo, 0);
  assert.match(resultado.json.erros[0].mensagem, /commit|revisão/i);
  assert.equal(estado(caso).commit, "");
});

it("propaga SHA ao ambiente lido pelo transporte Compose e à saúde simulada", () => {
  const caso = preparar();
  caso.iniciar = true;
  const resultado = aplicar(caso);
  assert.equal(
    resultado.json.codigo,
    "E_BACKUP",
    JSON.stringify({
      erros: resultado.json.erros,
      etapas: resultado.json.etapas.map((x) => [x.id, x.estado]),
      chamadas: caso.chamadas.map((x) => [x.comando, x.argumentos]),
    }),
  );
  assert.equal(caso.argumentoBuild, caso.commit);
  assert.equal(estado(caso).commit, caso.commit);
  const saude = resultado.json.etapas.find((etapa) => etapa.id === "saude");
  assert.equal(saude.estado, "concluida");
  assert.equal(saude.detalhes.commit, caso.commit);
});

it("retoma a fonte após Git ausente e destino vazio", () => {
  const caso = preparar();
  caso.gitAusente = true;
  assert.notEqual(aplicar(caso).codigo, 0);
  assert.deepEqual(fs.readdirSync(caso.appDir), []);
  caso.gitAusente = false;
  const retomada = aplicar(caso, ["--retomar"]);
  assert.equal(retomada.codigo, 0, JSON.stringify(retomada.json.erros));
  assert.equal(estado(caso).commit, caso.commit);
});

it("recusa metadados Git sem permissão de leitura", () => {
  const caso = preparar();
  const gitDir = path.join(caso.origem, ".git");
  fs.chmodSync(gitDir, 0o000);
  try {
    const resultado = aplicar(caso);
    assert.notEqual(resultado.codigo, 0);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.match(resultado.json.erros[0].mensagem, /metadados Git/);
    assert.equal(
      caso.chamadas.some((item) => item.comando === "cp"),
      false,
    );
  } finally {
    fs.chmodSync(gitDir, 0o755);
  }
});

it("retoma depois de falha do Compose sem perder o SHA verificado", () => {
  const caso = preparar();
  caso.falhaCompose = true;
  const primeira = aplicar(caso);
  assert.notEqual(primeira.codigo, 0);
  assert.equal(
    primeira.json.etapas.find((etapa) => etapa.id === "fonte").detalhes.commit,
    caso.commit,
  );
  assert.equal(estado(caso).commit, caso.commit);
  caso.falhaCompose = false;
  const segunda = aplicar(caso, ["--retomar"]);
  assert.equal(segunda.codigo, 0, JSON.stringify(segunda.json.erros));
  assert.equal(estado(caso).commit, caso.commit);
  assert.equal(commitAmbiente(caso), caso.commit);
});

it("não executa hook nem filtro configurados fora do checkout isolado", () => {
  const caso = preparar();
  const marcador = path.join(caso.raiz, "executou");
  const casa = path.join(caso.raiz, "casa");
  const template = path.join(casa, "modelo");
  fs.mkdirSync(path.join(template, "hooks"), { recursive: true, mode: 0o755 });
  fs.writeFileSync(
    path.join(template, "hooks/post-checkout"),
    `#!/bin/sh\nprintf executou > '${marcador}'\n`,
    { mode: 0o755 },
  );
  fs.chmodSync(path.join(template, "hooks/post-checkout"), 0o755);
  fs.writeFileSync(
    path.join(casa, ".gitconfig"),
    `[init]\n  templateDir = ${template}\n[filter "malicioso"]\n  smudge = touch ${marcador}\n`,
  );
  exigir("sh", ["-c", "printf 'package.json filter=malicioso\\n' > .gitattributes"], {
    ...OPERADOR,
    cwd: caso.origem,
  });
  caso.git("add", ".gitattributes");
  caso.git("-c", "core.hooksPath=/dev/null", "commit", "-m", "test: adiciona atributos");
  caso.commit = caso.git("rev-parse", "HEAD");
  caso.git("config", "core.fsmonitor", `touch ${marcador}`);
  caso.git("config", "filter.malicioso.smudge", `touch ${marcador}`);
  const home = process.env.HOME;
  process.env.HOME = casa;
  try {
    const resultado = aplicar(caso);
    assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json.erros));
    assert.equal(
      resultado.json.etapas.find((etapa) => etapa.id === "fonte").detalhes.commit,
      caso.commit,
    );
    assert.equal(fs.existsSync(marcador), false);
  } finally {
    process.env.HOME = home;
  }
});

it("informa Git indisponível sem copiar a origem versionada", () => {
  const caso = preparar();
  caso.gitAusente = true;
  const resultado = aplicar(caso);
  assert.notEqual(resultado.codigo, 0);
  assert.match(resultado.json.erros[0].mensagem, /Git.*não.*encontrado/i);
  assert.equal(
    caso.chamadas.some((item) => item.comando === "cp"),
    false,
  );
});

it("recusa divergência real do HEAD operacional em relação ao estado", () => {
  const caso = preparar();
  assert.equal(aplicar(caso).codigo, 0);
  exigir(
    "git",
    [
      "-C",
      caso.appDir,
      "-c",
      "user.name=Teste",
      "-c",
      "user.email=teste@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-m",
      "test: diverge",
    ],
    SERVICO,
  );
  const diferente = exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD"], SERVICO);
  assert.notEqual(diferente, caso.commit);
  const resultado = aplicar(caso);
  assert.equal(resultado.json.codigo, "E_CANAL", JSON.stringify(resultado.json.erros));
  assert.notEqual(resultado.codigo, 0);
  assert.equal(
    estado(caso).commit,
    caso.commit,
    "O erro não pode promover o HEAD divergente ao estado.",
  );
});

it("seleciona a tag estável pelo Git real", () => {
  const caso = preparar();
  caso.git("tag", "v1.2.3");
  caso.canal = "release";
  const resultado = aplicar(caso);
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json.erros));
  assert.equal(
    resultado.json.etapas.find((etapa) => etapa.id === "fonte").detalhes.commit,
    caso.commit,
  );
  assert.equal(estado(caso).commit, caso.commit);
  assert.equal(commitAmbiente(caso), caso.commit);
});

it("clona worktree do operador com Git real", () => {
  const caso = preparar();
  const worktree = path.join(caso.raiz, "worktree");
  fs.mkdirSync(worktree, { mode: 0o755 });
  fs.chownSync(worktree, OPERADOR.uid, OPERADOR.gid);
  caso.git("worktree", "add", "-b", "auxiliar", worktree, "main");
  caso.origem = worktree;
  const resultado = aplicar(caso);
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json.erros));
  assert.equal(
    resultado.json.etapas.find((etapa) => etapa.id === "fonte").detalhes.commit,
    caso.commit,
  );
});

it("recusa checkout operacional Git cuja revisão não pode ser lida", () => {
  const caso = preparar();
  assert.equal(aplicar(caso).codigo, 0);
  const gitDir = path.join(caso.appDir, ".git");
  fs.chmodSync(gitDir, 0o777);
  fs.unlinkSync(path.join(gitDir, "HEAD"));
  const resultado = aplicar(caso);
  assert.notEqual(resultado.codigo, 0);
  assert.equal(resultado.json.codigo, "E_VALIDACAO");
});

it("copia origem sem Git aninhada sem adotar o repositório ancestral", () => {
  const caso = preparar();
  const distribuicao = path.join(caso.origem, "distribuicao");
  fs.chmodSync(caso.origem, 0o777);
  fs.cpSync(FIXTURE, distribuicao, { recursive: true });
  fs.chmodSync(caso.origem, 0o755);
  caso.origem = distribuicao;
  const resultado = aplicar(caso);
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.json.erros));
  const fonte = resultado.json.etapas.find((etapa) => etapa.id === "fonte");
  assert.ok(fonte.acoes.some((acao) => acao.comando?.startsWith("cp ")));
  assert.equal(fonte.detalhes.commit, "");
  assert.equal(fs.existsSync(path.join(caso.appDir, ".git")), false);
});

it("recusa origem Git de terceiro sem copiá-la como distribuição local", () => {
  const caso = preparar();
  arvore(caso.origem, 2, 2);
  const antes = metadados(caso.origem);
  const resultado = aplicar(caso);
  assert.notEqual(resultado.codigo, 0);
  assert.equal(resultado.json.codigo, "E_VALIDACAO");
  assert.equal(
    caso.chamadas.some((item) => item.comando === "cp"),
    false,
  );
  assert.deepEqual(metadados(caso.origem), antes);
});

it("repete a instalação com checkout pertencente ao serviço e preserva o SHA", () => {
  const caso = preparar();
  const primeira = aplicar(caso);
  assert.equal(primeira.codigo, 0, JSON.stringify(primeira.json.erros));
  assert.equal(fs.statSync(caso.appDir).uid, SERVICO.uid);
  const segunda = aplicar(caso);
  assert.equal(segunda.codigo, 0, JSON.stringify(segunda.json.erros));
  assert.equal(
    segunda.json.etapas.find((etapa) => etapa.id === "fonte").detalhes.commit,
    caso.commit,
  );
  assert.equal(estado(caso).commit, caso.commit);
});

it("instala main do operador com SHA comprovado e entrega o checkout ao serviço", () => {
  const caso = preparar();
  const antes = metadados(caso.origem);
  const resultado = aplicar(caso);
  assert.equal(
    resultado.codigo,
    0,
    JSON.stringify({
      erros: resultado.json.erros,
      chamadas: caso.chamadas.filter((item) => ["git", "cp"].includes(item.comando)),
    }),
  );
  const fonte = resultado.json.etapas.find((etapa) => etapa.id === "fonte");
  assert.equal(
    fonte.detalhes.commit,
    caso.commit,
    "Git rejeitado não pode se tornar commit local.",
  );
  assert.ok(fonte.acoes.some((acao) => acao.comando?.includes("git clone")));
  assert.equal(estado(caso).commit, caso.commit);
  assert.equal(commitAmbiente(caso), caso.commit);
  assert.equal(fs.statSync(caso.appDir).uid, SERVICO.uid);
  assert.equal(exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD"], SERVICO), caso.commit);
  assert.deepEqual(
    metadados(caso.origem),
    antes,
    "A origem do operador precisa permanecer intacta.",
  );
});

it("exige SHA Git exato na saúde e retoma somente com a revisão comprovada", () => {
  for (const resposta of [{ commit: "local" }, { commit: "" }, {}, { commit: "a".repeat(40) }]) {
    const caso = preparar();
    const antes = metadados(caso.origem);
    caso.iniciar = true;
    caso.saude = { ok: true, versao: "1.0.0", ...resposta };
    assert.notEqual(resposta.commit, caso.commit);
    const resultado = aplicar(caso);
    assert.equal(resultado.json.codigo, "E_SAUDE", JSON.stringify(resultado.json.erros));
    assert.notEqual(resultado.codigo, 0);
    assert.equal(caso.argumentoBuild, caso.commit);
    const persistido = estado(caso);
    assert.equal(persistido.commit, caso.commit);
    const saude = persistido.etapas.find((etapa) => etapa.id === "saude");
    assert.equal(saude.estado, "falhou");
    assert.notEqual(saude.detalhes.verificado, true);
    assert.equal(
      caso.chamadas.some((item) => item.argumentos[0]?.endsWith("backup-banco.sh")),
      false,
    );
    // A autoridade vem do Git da fixture, nunca do ambiente observado pelo dublê de Compose.
    caso.saude = { ok: true, versao: "1.0.0", commit: caso.git("rev-parse", "HEAD^{commit}") };
    const retomada = aplicar(caso, ["--retomar"]);
    assert.equal(retomada.json.codigo, "E_BACKUP", JSON.stringify(retomada.json.erros));
    const verificada = estado(caso).etapas.find((etapa) => etapa.id === "saude");
    assert.equal(verificada.estado, "concluida");
    assert.equal(verificada.detalhes.verificado, true);
    assert.equal(verificada.detalhes.commit, caso.commit);
    assert.equal(estado(caso).commit, caso.commit);
    assert.deepEqual(metadados(caso.origem), antes);
  }
});

it("preserva saúde verificada da distribuição legítima sem Git e sem SHA esperado", () => {
  for (const resposta of [{ commit: "local" }, { commit: "" }, {}]) {
    const caso = preparar();
    const distribuicao = path.join(caso.raiz, "distribuicao");
    fs.cpSync(FIXTURE, distribuicao, { recursive: true });
    caso.origem = distribuicao;
    caso.iniciar = true;
    caso.saude = { ok: true, versao: "1.0.0", ...resposta };
    const resultado = aplicar(caso);
    assert.equal(resultado.json.codigo, "E_BACKUP", JSON.stringify(resultado.json.erros));
    assert.equal(caso.argumentoBuild, "local");
    assert.equal(estado(caso).commit, "");
    assert.equal(fs.existsSync(path.join(caso.appDir, ".git")), false);
    const saude = estado(caso).etapas.find((etapa) => etapa.id === "saude");
    assert.equal(saude.estado, "concluida");
    assert.equal(saude.detalhes.verificado, true);
    assert.equal(saude.detalhes.commit, resposta.commit ?? "");
  }
});

it("seleciona --ref SHA real anterior ao HEAD e retoma sem mudar a origem", () => {
  const caso = preparar();
  exigir("sh", ["-c", "printf exclusivo > somente-no-head.txt"], { ...OPERADOR, cwd: caso.origem });
  caso.git("add", "somente-no-head.txt");
  caso.git("-c", "core.hooksPath=/dev/null", "commit", "-m", "test: avança main");
  const head = caso.git("rev-parse", "HEAD^{commit}");
  assert.notEqual(head, caso.commit);
  const antes = metadados(caso.origem);
  caso.falhaCompose = true;
  const primeira = aplicar(caso, ["--ref", caso.commit]);
  assert.equal(primeira.json.codigo, "E_COMPOSE", JSON.stringify(primeira.json.erros));
  const fonte = primeira.json.etapas.find((etapa) => etapa.id === "fonte");
  assert.equal(fonte.estado, "concluida");
  assert.equal(fonte.detalhes.commit, caso.commit);
  assert.equal(estado(caso).commit, caso.commit);
  assert.equal(
    exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO),
    caso.commit,
  );
  assert.equal(fs.existsSync(path.join(caso.appDir, "somente-no-head.txt")), false);
  caso.falhaCompose = false;
  const retomada = aplicar(caso, ["--retomar", "--ref", caso.commit]);
  assert.equal(retomada.codigo, 0, JSON.stringify(retomada.json.erros));
  assert.equal(estado(caso).commit, caso.commit);
  assert.equal(commitAmbiente(caso), caso.commit);
  assert.equal(caso.git("rev-parse", "HEAD^{commit}"), head);
  assert.deepEqual(metadados(caso.origem), antes);
});

it("recusa --ref SHA divergente do checkout também na retomada e preserva o estado", () => {
  const caso = preparar();
  const antes = metadados(caso.origem);
  assert.equal(aplicar(caso, ["--ref", caso.commit]).codigo, 0);
  exigir(
    "git",
    [
      "-C",
      caso.appDir,
      "-c",
      "user.name=Teste",
      "-c",
      "user.email=teste@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--allow-empty",
      "-m",
      "test: diverge do ref",
    ],
    SERVICO,
  );
  const divergente = exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO);
  assert.notEqual(divergente, caso.commit);
  for (const extras of [
    ["--ref", caso.commit],
    ["--retomar", "--ref", caso.commit],
  ]) {
    const resultado = aplicar(caso, extras);
    assert.equal(resultado.json.codigo, "E_CANAL", JSON.stringify(resultado.json.erros));
    assert.notEqual(resultado.codigo, 0);
    assert.equal(estado(caso).commit, caso.commit);
    assert.equal(estado(caso).etapas.find((etapa) => etapa.id === "fonte").estado, "falhou");
    assert.equal(
      exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO),
      divergente,
    );
  }
  assert.deepEqual(metadados(caso.origem), antes);
});

it("recusa --ref SHA sem objeto na origem Git sem promover a declaração ao estado", () => {
  const caso = preparar();
  const antes = metadados(caso.origem);
  const inexistente = "b".repeat(40);
  assert.notEqual(inexistente, caso.commit);
  const resultado = aplicar(caso, ["--ref", inexistente]);
  assert.equal(resultado.json.codigo, "E_CANAL", JSON.stringify(resultado.json.erros));
  assert.notEqual(resultado.codigo, 0);
  assert.equal(estado(caso).commit, "");
  assert.equal(estado(caso).etapas.find((etapa) => etapa.id === "fonte").estado, "falhou");
  assert.deepEqual(metadados(caso.origem), antes);
});

it("recusa HEAD divergente na retomada direta posterior à fonte, sem tentativa intermediária", () => {
  for (const falhaCompose of [true, false]) {
    const caso = preparar();
    const origemAntes = metadados(caso.origem);
    caso.falhaCompose = falhaCompose;
    const primeira = aplicar(caso, ["--ref", caso.commit]);
    assert.equal(primeira.json.codigo, falhaCompose ? "E_COMPOSE" : null);
    assert.equal(estado(caso).commit, caso.commit);
    exigir(
      "git",
      [
        "-C",
        caso.appDir,
        "-c",
        "user.name=Teste",
        "-c",
        "user.email=teste@example.invalid",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--allow-empty",
        "-m",
        "test: diverge antes da retomada",
      ],
      SERVICO,
    );
    const divergente = exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO);
    assert.notEqual(divergente, caso.commit);
    caso.falhaCompose = false;
    const antes = caso.chamadas.length;
    const retomada = aplicar(caso, ["--retomar", "--ref", caso.commit]);
    assert.equal(retomada.json.codigo, "E_CANAL", JSON.stringify(retomada.json.erros));
    assert.notEqual(retomada.codigo, 0);
    assert.equal(estado(caso).commit, caso.commit);
    assert.equal(estado(caso).etapas.find((etapa) => etapa.id === "fonte").estado, "falhou");
    assert.equal(
      caso.chamadas
        .slice(antes)
        .some(
          (item) => item.argumentos[1] === "up" || item.argumentos[0]?.endsWith("backup-banco.sh"),
        ),
      false,
    );
    assert.equal(
      exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO),
      divergente,
    );
    assert.deepEqual(metadados(caso.origem), origemAntes);
    exigir(
      "git",
      ["-C", caso.appDir, "-c", "core.hooksPath=/dev/null", "checkout", "--detach", caso.commit],
      SERVICO,
    );
    const recuperada = aplicar(caso, ["--retomar", "--ref", caso.commit]);
    assert.equal(recuperada.codigo, 0, JSON.stringify(recuperada.json.erros));
    assert.equal(estado(caso).commit, caso.commit);
    assert.equal(commitAmbiente(caso), caso.commit);
  }
});

it("resolve --ref SHA abreviado pelo Git e preserva o SHA completo na repetição e retomada", () => {
  const caso = preparar();
  caso.git(
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--allow-empty",
    "-m",
    "test: avança a referência",
  );
  assert.notEqual(caso.git("rev-parse", "HEAD"), caso.commit);
  const abreviado = caso.commit.slice(0, 12);
  assert.equal(caso.git("rev-parse", "--verify", `${abreviado}^{commit}`), caso.commit);
  const antes = metadados(caso.origem);
  caso.iniciar = true;
  caso.saude = { ok: true, versao: "1.0.0", commit: caso.commit };
  for (const extras of [
    ["--ref", abreviado],
    ["--ref", abreviado],
    ["--retomar", "--ref", abreviado],
  ]) {
    const resultado = aplicar(caso, extras);
    assert.equal(resultado.json.codigo, "E_BACKUP", JSON.stringify(resultado.json.erros));
    assert.equal(estado(caso).commit, caso.commit);
    assert.equal(caso.argumentoBuild, caso.commit);
    assert.equal(
      exigir("git", ["-C", caso.appDir, "rev-parse", "HEAD^{commit}"], SERVICO),
      caso.commit,
    );
    const saude = estado(caso).etapas.find((etapa) => etapa.id === "saude");
    assert.equal(saude.estado, "concluida");
    assert.equal(saude.detalhes.commit, caso.commit);
    assert.equal(saude.detalhes.verificado, true);
  }
  assert.deepEqual(metadados(caso.origem), antes);
});
