// Testa canal mostrar e canal definir com repositório Git sintético e dublês de script e estado.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";
import { executarPadrao } from "../../scripts/instalador/detectar.mjs";
import {
  caminhoEstado,
  caminhoEstadoAtualizador,
  gravarArquivoAtomico,
  gravarEstado,
  lerEstado,
} from "../../scripts/instalador/estado.mjs";

const RAIZ = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FIXTURE = path.join(RAIZ, "tests", "instalador", "fixtures", "canal", "repo");
const AGORA = "2026-11-11T12:00:00Z";
const INICIO = "2026-11-01T12:00:00Z";
const DIGEST = `sha256:${"a".repeat(64)}`;
const DIGEST_NOVO = `sha256:${"b".repeat(64)}`;
const DIRETORIOS = [];

function temporario() {
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-canal-"));
  DIRETORIOS.push(diretorio);
  return diretorio;
}

function git(diretorio, argumentos) {
  const resultado = spawnSync("git", ["-C", diretorio, ...argumentos], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(
    resultado.status,
    0,
    `git ${argumentos.join(" ")} falhou: ${resultado.stderr ?? ""}`,
  );
  return String(resultado.stdout ?? "").trim();
}

function hashCommit(commit) {
  return crypto.createHash("sha256").update(commit).digest("hex");
}

function hashBlob(diretorio, commit, arquivo) {
  const resultado = spawnSync("git", ["-C", diretorio, "show", `${commit}:${arquivo}`], {
    encoding: null,
    timeout: 30000,
  });
  assert.equal(resultado.status, 0, `git show ${commit}:${arquivo} falhou`);
  return crypto.createHash("sha256").update(resultado.stdout).digest("hex");
}

function prepararRepositorio() {
  const raiz = temporario();
  const appDir = path.join(raiz, "opt", "frequenciapp");
  fs.cpSync(FIXTURE, appDir, { recursive: true });
  for (const script of ["atualizar.sh", "backup-banco.sh"]) {
    fs.chmodSync(path.join(appDir, "scripts", "servidor", script), 0o755);
  }
  git(appDir, ["init", "-q", "-b", "main"]);
  git(appDir, ["config", "user.email", "teste@escola.exemplo"]);
  git(appDir, ["config", "user.name", "Teste sintético"]);
  git(appDir, ["config", "commit.gpgsign", "false"]);
  git(appDir, ["config", "tag.gpgsign", "false"]);
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "versão inicial"]);
  const commitA = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.0.0"]);

  fs.appendFileSync(
    path.join(appDir, "docker", "app", "migrar.mjs"),
    '\nprocess.stdout.write("migrar versao 2\\n");\n',
  );
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "muda o migrador"]);
  const commitB = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.1.0"]);

  fs.appendFileSync(path.join(appDir, "LEIA.md"), "\nVersão 1.1.1.\n");
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "documenta a versão"]);
  const commitC = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.1.1"]);

  git(appDir, ["checkout", "-q", "-b", "estavel", commitB]);
  fs.appendFileSync(path.join(appDir, "LEIA.md"), "\nCanal estável.\n");
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "prepara o canal estável"]);
  const commitD = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.2.0"]);

  git(appDir, ["checkout", "-q", "-b", "quebra", commitB]);
  fs.rmSync(path.join(appDir, "prisma", "migrations", "20260201000000_segunda", "migration.sql"));
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "remove uma migração"]);
  const commitE = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.2.1"]);

  git(appDir, ["checkout", "-q", "-b", "nova", commitB]);
  const terceira = path.join(appDir, "prisma", "migrations", "20260301000000_terceira");
  fs.mkdirSync(terceira, { recursive: true });
  fs.writeFileSync(path.join(terceira, "migration.sql"), "-- Terceira migração.\nSELECT 3;\n");
  git(appDir, ["add", "-A"]);
  git(appDir, ["commit", "-q", "-m", "adiciona migração"]);
  const commitF = git(appDir, ["rev-parse", "HEAD"]);
  git(appDir, ["tag", "v1.3.0"]);

  git(appDir, ["checkout", "-q", "main"]);
  return {
    raiz,
    appDir,
    commits: { A: commitA, B: commitB, C: commitC, D: commitD, E: commitE, F: commitF },
    hashes: {
      A: hashBlob(appDir, commitA, "docker/app/migrar.mjs"),
      B: hashBlob(appDir, commitB, "docker/app/migrar.mjs"),
    },
  };
}

function estadoBase({ commit, tag, canal = "release", controller = {} }) {
  return {
    schema: "frequenciapp.instalacao/1",
    instaladoEm: INICIO,
    atualizadoEm: INICIO,
    perfil: "simples",
    canal,
    tag,
    commit,
    imagem: "ghcr.io/eemtijca/frequenciapp",
    digest: DIGEST,
    migradorSha256: hashCommit(commit),
    etapas: [],
    controlador: {
      adotado: false,
      migradorSha256: null,
      readocaoPendente: false,
      ...controller,
    },
    backup: { ultimoRecibo: null, verificadoEm: null },
    origem: {
      repositorio: "https://github.com/eemtijca/frequenciapp",
      diretorioFonte: "/opt/frequenciapp",
    },
  };
}

function prepararInstalacao({
  raiz,
  commit,
  tag,
  canal = "release",
  controller = {},
  migradorSha256,
}) {
  const caminho = caminhoEstado(raiz);
  const estado = estadoBase({ commit, tag, canal, controller });
  if (migradorSha256) estado.migradorSha256 = migradorSha256;
  gravarEstado(estado, { caminho });
  const configuracao = path.join(raiz, "etc/frequenciapp");
  fs.mkdirSync(configuracao, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(configuracao, "app.env"),
    "POSTGRES_USER=frequencia\nPOSTGRES_DB=frequencia\nTZ_APP=America/Fortaleza\nAUTH_SECRET=segredo-sintetico-do-teste-canal-1234567890\n",
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(configuracao, "ops.env"),
    "ATUALIZAR_MODO=release\nATUALIZAR_REF=origin/main\nAPP_IMAGEM=ghcr.io/eemtijca/frequenciapp:1.0.0\n",
    { mode: 0o600 },
  );
  fs.chmodSync(path.join(configuracao, "app.env"), 0o600);
  fs.chmodSync(path.join(configuracao, "ops.env"), 0o600);
  return { caminho };
}

function escreverEstadoAtualizador(raiz, dados) {
  const caminho = caminhoEstadoAtualizador(raiz);
  fs.mkdirSync(path.dirname(caminho), { recursive: true, mode: 0o700 });
  fs.writeFileSync(caminho, `${JSON.stringify(dados)}\n`, { mode: 0o600 });
  fs.chmodSync(caminho, 0o600);
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

function criarDeps({ raiz, chamadas = [], digest = DIGEST_NOVO, falharDigest = false }) {
  return {
    raiz,
    agora: () => AGORA,
    detectar: deteccaoFalsa,
    detectarBasico: deteccaoFalsa,
    lerEstado,
    gravarEstado,
    gravarArquivoAtomico,
    adquirirTrava: () => ({ liberar() {} }),
    consultarDigest: () => {
      if (falharDigest) return "";
      return digest;
    },
    usuarioServico: "frequenciapp",
    executar: (comando, argumentos = [], opcoes = {}) => {
      chamadas.push({ comando, argumentos, opcoes });
      return executarPadrao(comando, argumentos, opcoes);
    },
  };
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

function chamadasDeScript(chamadas, sufixo) {
  return chamadas.filter(
    (item) => item.comando === "bash" && String(item.argumentos[0]).endsWith(sufixo),
  );
}

function indiceChamada(chamadas, sufixo) {
  return chamadas.findIndex(
    (item) => item.comando === "bash" && String(item.argumentos[0]).endsWith(sufixo),
  );
}

function valorEnv(texto, chave) {
  const combinacao = new RegExp(`^${chave}=(.*)$`, "m").exec(texto);
  return combinacao ? combinacao[1] : "";
}

after(() => {
  for (const diretorio of DIRETORIOS) fs.rmSync(diretorio, { recursive: true, force: true });
});

describe("canal mostrar", () => {
  it("mostra preferência, instalação, schema, migrador e pendência sem alterar o estado", () => {
    const { raiz, commits, hashes } = prepararRepositorio();
    prepararInstalacao({
      raiz,
      commit: commits.A,
      tag: "v1.1.0",
      migradorSha256: hashes.A,
    });
    escreverEstadoAtualizador(raiz, {
      modo: "release",
      ref: "v1.0.0",
      commit: commits.A,
      imagem: "ghcr.io/eemtijca/frequenciapp:1.0.0",
      imagemBackup: "ghcr.io/eemtijca/frequenciapp-backup:1.0.0",
      atualizadoEm: INICIO,
    });
    const estadoAntes = fs.readFileSync(caminhoEstado(raiz), "utf8");
    const chamadas = [];
    const resultado = executar(["canal", "mostrar", "--json"], criarDeps({ raiz, chamadas }));
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.comando, "canal mostrar");
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.canal, "release");
    assert.equal(resultado.json.tag, "v1.1.0");
    const detalhes = resultado.json.etapas[0].detalhes;
    assert.equal(detalhes.schema, "frequenciapp.instalacao/1");
    assert.equal(detalhes.migradorSha256, hashes.A);
    assert.equal(detalhes.instaladoEm, INICIO);
    assert.equal(detalhes.atualizadoEm, INICIO);
    assert.equal(detalhes.preferencia.tag, "v1.1.0");
    assert.equal(detalhes.instalacao.tag, "v1.0.0");
    assert.equal(detalhes.divergente, true);
    assert.equal(detalhes.controlador.adotado, false);
    assert.ok(resultado.json.avisos.some((item) => item.codigo === "A_CANAL_DIVERGENTE"));
    assert.equal(fs.readFileSync(caminhoEstado(raiz), "utf8"), estadoAntes);
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
  });

  it("recusa estado corrompido sem sobrescrever o arquivo", () => {
    const { raiz } = prepararRepositorio();
    const caminho = caminhoEstado(raiz);
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(caminho, "{ estado invalido", { mode: 0o600 });
    const resultado = executar(["canal", "mostrar", "--json"], criarDeps({ raiz }));
    assert.equal(resultado.codigo, 7);
    assert.equal(resultado.json.ok, false);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
    assert.equal(fs.readFileSync(caminho, "utf8"), "{ estado invalido");
  });

  it("recusa mostrar sem instalação registrada", () => {
    const { raiz } = prepararRepositorio();
    const resultado = executar(["canal", "mostrar", "--json"], criarDeps({ raiz }));
    assert.equal(resultado.codigo, 7);
    assert.equal(resultado.json.codigo, "E_VALIDACAO");
  });
});

describe("canal definir sem aplicar", () => {
  it("grava apenas a preferência e mantém o commit instalado", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--planejar", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.dry_run, true);
    const estado = lerEstado({ caminho: caminhoEstado(raiz) }).estado;
    assert.equal(estado.canal, "release");
    assert.equal(estado.tag, "v1.1.0");
    assert.equal(estado.commit, commits.A);
    assert.equal(estado.digest, DIGEST);
    assert.ok(resultado.json.avisos.some((item) => item.codigo === "A_PREFERENCIA"));
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
    assert.equal(chamadasDeScript(chamadas, "atualizar.sh").length, 0);
    assert.equal(fs.existsSync(caminhoEstadoAtualizador(raiz)), false);
  });

  it("não reescreve a preferência quando ela já está registrada", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const primeira = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--json"],
      criarDeps({ raiz }),
    );
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const segunda = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--json"],
      criarDeps({ raiz }),
    );
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.ok(segunda.json.avisos.some((item) => item.codigo === "A_PREFERENCIA"));
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.commit, commits.A);
  });
});

describe("canal definir release com aplicação", () => {
  it("faz backup, delega ao atualizar.sh e atualiza estado, ops.env e digest", () => {
    const { raiz, commits, hashes } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.equal(resultado.json.ok, true);
    assert.equal(resultado.json.dry_run, false);
    const backup = indiceChamada(chamadas, "backup-banco.sh");
    const atualizar = indiceChamada(chamadas, "atualizar.sh");
    assert.ok(backup >= 0, "backup não executado");
    assert.ok(atualizar > backup, "ordem backup e atualização inválida");
    const chamadaAtualizar = chamadasDeScript(chamadas, "atualizar.sh")[0];
    assert.deepEqual(chamadaAtualizar.argumentos.slice(1, 3), ["--modo", "release"]);

    const estado = lerEstado({ caminho: caminhoEstado(raiz) }).estado;
    assert.equal(estado.canal, "release");
    assert.equal(estado.tag, "v1.1.0");
    assert.equal(estado.commit, commits.B);
    assert.equal(estado.digest, DIGEST_NOVO);
    assert.equal(estado.migradorSha256, hashes.B);
    assert.equal(estado.atualizadoEm, AGORA);
    assert.equal(fs.statSync(caminhoEstado(raiz)).mode & 0o777, 0o600);

    const estadoAtualizador = JSON.parse(fs.readFileSync(caminhoEstadoAtualizador(raiz), "utf8"));
    assert.equal(estadoAtualizador.modo, "release");
    assert.equal(estadoAtualizador.commit, commits.B);

    const ops = fs.readFileSync(path.join(raiz, "etc/frequenciapp/ops.env"), "utf8");
    assert.equal(valorEnv(ops, "ATUALIZAR_MODO"), "release");
    assert.equal(valorEnv(ops, "APP_IMAGEM"), `ghcr.io/eemtijca/frequenciapp:1.1.0@${DIGEST_NOVO}`);
    assert.equal(fs.statSync(path.join(raiz, "etc/frequenciapp/ops.env")).mode & 0o777, 0o600);
    assert.equal(resultado.json.etapas[0].detalhes.backup.recibo.endsWith(".json"), true);
    for (const caminho of [caminhoEstado(raiz), path.join(raiz, "etc/frequenciapp/ops.env")]) {
      assert.equal(
        fs.readFileSync(caminho, "utf8").includes("segredo-sintetico-do-teste-canal-1234567890"),
        false,
        `segredo em ${caminho}`,
      );
    }
    assert.equal(
      resultado.stdout.includes("segredo-sintetico-do-teste-canal-1234567890"),
      false,
      "segredo no stdout",
    );
  });

  it("é idempotente na segunda execução e não repete backup nem atualização", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const primeira = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz }),
    );
    assert.equal(primeira.codigo, 0, primeira.stderr);
    const chamadas = [];
    const segunda = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(segunda.codigo, 0, segunda.stderr);
    assert.equal(segunda.json.ok, true);
    assert.ok(segunda.json.avisos.some((item) => item.codigo === "A_SEM_MUDANCAS"));
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
    assert.equal(chamadasDeScript(chamadas, "atualizar.sh").length, 0);
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.commit, commits.B);
  });

  it("aceita migrações novas apenas com --permitir-migracoes", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.B, tag: "v1.1.0" });
    const recusado = executar(
      ["canal", "definir", "release", "--tag", "v1.3.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz }),
    );
    assert.equal(recusado.codigo, 78);
    assert.equal(recusado.json.codigo, "E_CANAL");
    const chamadas = [];
    const aceito = executar(
      [
        "canal",
        "definir",
        "release",
        "--tag",
        "v1.3.0",
        "--aplicar",
        "--sim",
        "--permitir-migracoes",
        "--json",
      ],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(aceito.codigo, 0, aceito.stderr);
    const chamada = chamadasDeScript(chamadas, "atualizar.sh")[0];
    assert.ok(chamada.argumentos.includes("--permitir-migracoes"));
  });
});

describe("canal definir main", () => {
  it("recusa main sem --permitir-instavel e não altera o estado", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "main", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.canal, "release");
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.tag, "v1.0.0");
  });

  it("aplica main com a flag explícita e registra tag vazia", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "main", "--permitir-instavel", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    const chamada = chamadasDeScript(chamadas, "atualizar.sh")[0];
    assert.deepEqual(chamada.argumentos.slice(1, 3), ["--modo", "main"]);
    const estado = lerEstado({ caminho: caminhoEstado(raiz) }).estado;
    assert.equal(estado.canal, "main");
    assert.equal(estado.tag, "");
    assert.equal(estado.commit, commits.C);
    assert.equal(
      valorEnv(
        fs.readFileSync(path.join(raiz, "etc/frequenciapp/ops.env"), "utf8"),
        "ATUALIZAR_MODO",
      ),
      "main",
    );
  });
});

describe("canal definir com downgrade", () => {
  it("recusa alvo ancestral sem --permitir-downgrade", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.C, tag: "v1.1.1" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.0.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.tag, "v1.1.1");
  });

  it("recusa alvo sem ancestralidade comprovada", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.C, tag: "v1.1.1" });
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.2.1", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
  });

  it("aplica downgrade autorizado com backup e confirmação", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.D, tag: "v1.2.0" });
    const chamadas = [];
    const resultado = executar(
      [
        "canal",
        "definir",
        "release",
        "--tag",
        "v1.1.0",
        "--aplicar",
        "--sim",
        "--permitir-downgrade",
        "--json",
      ],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.ok(chamadasDeScript(chamadas, "backup-banco.sh").length > 0);
    const estado = lerEstado({ caminho: caminhoEstado(raiz) }).estado;
    assert.equal(estado.tag, "v1.1.0");
    assert.equal(estado.commit, commits.B);
  });

  it("recusa downgrade autorizado com estado incerto", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.D, tag: "v1.2.0" });
    const falha = path.join(raiz, "var/lib/frequenciapp/falha.json");
    fs.writeFileSync(
      falha,
      '{"motivo":"falha anterior","migracoesPossivelmenteAplicadas":true}\n',
      { mode: 0o600 },
    );
    const chamadas = [];
    const resultado = executar(
      [
        "canal",
        "definir",
        "release",
        "--tag",
        "v1.1.0",
        "--aplicar",
        "--sim",
        "--permitir-downgrade",
        "--json",
      ],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
  });

  it("recusa downgrade autorizado com journal incerto", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.D, tag: "v1.2.0" });
    const andamento = path.join(raiz, "var/lib/frequenciapp/atualizacao-em-andamento.json");
    fs.writeFileSync(andamento, '{"estado":"executando"}\n', { mode: 0o600 });
    const resultado = executar(
      [
        "canal",
        "definir",
        "release",
        "--tag",
        "v1.1.0",
        "--aplicar",
        "--sim",
        "--permitir-downgrade",
        "--json",
      ],
      criarDeps({ raiz }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
  });
});

describe("canal definir com migrações incompatíveis", () => {
  it("recusa alvo que remove migração instalada", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.B, tag: "v1.1.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.2.1", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
  });
});

describe("canal definir e controlador", () => {
  it("marca readoção pendente e retorna E_CONTROLADOR quando o migrador muda", () => {
    const { raiz, commits, hashes } = prepararRepositorio();
    prepararInstalacao({
      raiz,
      commit: commits.A,
      tag: "v1.0.0",
      controller: {
        adotado: true,
        migradorSha256: hashes.A,
        readocaoPendente: false,
      },
    });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CONTROLADOR");
    assert.ok(chamadasDeScript(chamadas, "backup-banco.sh").length > 0);
    const estado = lerEstado({ caminho: caminhoEstado(raiz) }).estado;
    assert.equal(estado.commit, commits.B);
    assert.equal(estado.controlador.readocaoPendente, true);
    assert.equal(estado.controlador.migradorSha256, hashes.A);
  });
});

describe("canal definir com falhas", () => {
  it("propaga E_BACKUP e não atualiza o estado quando o backup falha", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const deps = criarDeps({ raiz });
    const original = deps.executar;
    deps.executar = (comando, argumentos = [], opcoes = {}) => {
      if (comando === "bash" && String(argumentos[0]).endsWith("backup-banco.sh")) {
        return original(comando, argumentos, {
          ...opcoes,
          env: { ...(opcoes.env ?? {}), CANAL_TESTE_BACKUP_FALHA: "1" },
        });
      }
      return original(comando, argumentos, opcoes);
    };
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      deps,
    );
    assert.equal(resultado.codigo, 10);
    assert.equal(resultado.json.codigo, "E_BACKUP");
    assert.equal(lerEstado({ caminho: caminhoEstado(raiz) }).estado.commit, commits.A);
  });

  it("exige --sim quando a troca é aplicada", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const chamadas = [];
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--json"],
      criarDeps({ raiz, chamadas }),
    );
    assert.equal(resultado.codigo, 2);
    assert.equal(resultado.json.codigo, "E_USO");
    assert.equal(chamadasDeScript(chamadas, "backup-banco.sh").length, 0);
  });

  it("recusa digest ausente ou inválido", () => {
    const { raiz, commits } = prepararRepositorio();
    prepararInstalacao({ raiz, commit: commits.A, tag: "v1.0.0" });
    const resultado = executar(
      ["canal", "definir", "release", "--tag", "v1.1.0", "--aplicar", "--sim", "--json"],
      criarDeps({ raiz, falharDigest: true }),
    );
    assert.equal(resultado.codigo, 78);
    assert.equal(resultado.json.codigo, "E_CANAL");
  });
});
