// Smoke root mínimo: instala o controlador, delega a atualização e volta ao simples.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const raiz = fs.mkdtempSync("/tmp/frequenciapp-controlador-minimo-");
const fonte = `${raiz}/fonte`;
const app = `${raiz}/app`;
const conf = `${raiz}/config`;
const prefixo = `${raiz}/controlador`;
const bin = `${raiz}/bin`;
const estadoSimples = `${raiz}/estado-simples`;
const estadoLegado = `${raiz}/estado-legado`;
const caminhoSistema = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function gravar(nome, conteudo, modo = 0o600) {
  fs.mkdirSync(path.dirname(nome), { recursive: true, mode: 0o700 });
  fs.writeFileSync(nome, conteudo, { mode: modo });
}

function copiar(origem, destino) {
  fs.cpSync(origem, destino, {
    recursive: true,
    force: true,
    dereference: false,
    preserveTimestamps: false,
  });
  const visitar = (nome) => {
    const s = fs.lstatSync(nome);
    if (s.isDirectory()) {
      fs.chmodSync(nome, 0o700);
      for (const filho of fs.readdirSync(nome)) visitar(`${nome}/${filho}`);
    } else {
      fs.chmodSync(nome, nome.endsWith(".sh") ? 0o700 : 0o600);
    }
  };
  visitar(destino);
}

function executar(comando, args, env = {}) {
  return spawnSync(comando, args, {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${caminhoSistema}`,
      HOME: raiz,
      TMPDIR: raiz,
      ...env,
    },
  });
}

function ok(resultado, mensagem) {
  assert.equal(resultado.status, 0, `${mensagem}\n${resultado.stdout}\n${resultado.stderr}`);
}

function preparar() {
  fs.mkdirSync(fonte, { recursive: true, mode: 0o700 });
  copiar(`${repo}/scripts/servidor`, `${fonte}/scripts/servidor`);
  gravar(`${fonte}/docker/app/migrar.mjs`, fs.readFileSync(`${repo}/docker/app/migrar.mjs`));
  fs.mkdirSync(app, { mode: 0o700 });
  copiar(`${fonte}/docker`, `${app}/docker`);
  gravar(`${app}/compose.yml`, "# Configuração sintética sem clientes reais.\nservices: {}\n");
  gravar(`${app}/README.md`, "revisão 1\n");
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "Teste"],
    ["config", "user.email", "teste@escola.exemplo"],
    ["add", "."],
    ["commit", "-qm", "base"],
  ]) {
    ok(executar("git", ["-C", app, ...args]), "git sintético falhou.");
  }
  const commit = executar("git", ["-C", app, "rev-parse", "HEAD"]).stdout.trim();
  ok(
    executar("git", ["-C", app, "update-ref", "refs/remotes/origin/main", commit]),
    "ref remota sintética falhou.",
  );
  fs.mkdirSync(conf, { mode: 0o700 });
  gravar(`${conf}/app.env`, "POSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\n");
  gravar(
    `${conf}/ops.env`,
    [
      "COMPOSE_PROJECT_NAME=sintetico",
      "COMPOSE_ARQUIVOS=compose.yml",
      "PROXY_TIPO=caddy",
      "BACKUP_MODO=compose",
      "BACKUP_PLANILHAS_HABILITADO=false",
      `ESTADO_DIR=${estadoLegado}`,
      "TZ_APP=UTC",
      "CRON_FUSO_SISTEMA=UTC",
      "ATUALIZAR_MODO=main",
      "ATUALIZAR_REF=origin/main",
      "ATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false",
      "ATUALIZAR_PERMITIR_BACKUP_LOCAL=true",
      "ATUALIZAR_ESPACO_MINIMO_MB=0",
      "",
    ].join("\n"),
  );
  for (const nome of [
    estadoSimples,
    estadoLegado,
    `${raiz}/locks`,
    `${raiz}/logs`,
    `${raiz}/backups`,
  ]) {
    fs.mkdirSync(nome, { recursive: true, mode: 0o700 });
  }
  fs.mkdirSync(bin, { mode: 0o700 });
  gravar(
    `${bin}/docker`,
    `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\n' "$*" >>"${raiz}/docker.log"
if [ "$1" = "info" ]; then printf '{"ID":"daemon-sintetico"}\\n'; exit 0; fi
if [ "$1" = "inspect" ]; then
  printf '%s\\n' '[{"Id":"container-app","Image":"sha256:app","State":{"Running":true,"Health":{"Status":"healthy"}},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Image":"sha256:db","State":{"Running":true},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"sintetico-dados","Source":"/var/lib/docker/volumes/sintetico-dados/_data","Destination":"/var/lib/postgresql/data"}]}]'
  exit 0
fi
if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then printf '%s\\n' "\${COMMIT_SHA:-}"; exit 0; fi
if [ "$1" = "tag" ]; then exit 0; fi
if [ "$1" = "run" ]; then cat "${fonte}/docker/app/migrar.mjs"; exit 0; fi
[ "$1" = "compose" ] || { echo "docker inesperado: $*" >&2; exit 1; }
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-name | --project-directory | --env-file | -f | --profile) shift 2 ;;
    *) break ;;
  esac
done
comando="$1"
shift
case "$comando" in
  config)
    if [[ " $* " == *" --format json "* ]]; then
      printf '%s\\n' '{"name":"sintetico","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{}},"volumes":{"dados":{"name":"sintetico-dados"}}}'
    elif [[ " $* " == *" --services "* ]]; then
      printf 'app\\ndb\\ncaddy\\n'
    fi
    exit 0
    ;;
  ps)
    if [[ " $* " == *" -aq "* ]]; then printf 'container-app\\ncontainer-db\\n'; else printf 'container-app\\n'; fi
    exit 0
    ;;
  up | build | pull | stop | exec) exit 0 ;;
  *) echo "compose inesperado: $comando $*" >&2; exit 1 ;;
esac
`,
    0o700,
  );
  gravar(
    `${bin}/git`,
    `#!/usr/bin/env bash
if [[ " $* " == *" fetch "* ]]; then exit 0; fi
exec /usr/bin/git "$@"
`,
    0o700,
  );
}

test.after(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
});

const ambienteBase = () => ({
  APP_DIR: app,
  APP_ENV_FILE: `${conf}/app.env`,
  OPS_ENV_FILE: `${conf}/ops.env`,
  SERVIDOR_CONFIG_DIR: conf,
  SERVIDOR_IDENTIDADE_ARQUIVO: `${conf}/identidade.json`,
  SERVIDOR_LOCK_DIR: `${raiz}/locks`,
  ESTADO_DIR: estadoSimples,
  LOG_DIR: `${raiz}/logs`,
  BACKUP_DIR: `${raiz}/backups`,
  BACKUP_BANCO_DIR: `${raiz}/backups/banco`,
  COMPOSE_PROJECT_NAME: "sintetico",
  COMPOSE_ARQUIVOS: "compose.yml",
  PROXY_TIPO: "caddy",
  SERVIDOR_AMBIENTE_INJETADO: "true",
  BACKUP_MODO: "compose",
  BACKUP_PLANILHAS_HABILITADO: "false",
  ATUALIZAR_MODO: "main",
  ATUALIZAR_REF: "origin/main",
  ATUALIZAR_VERIFICAR_SAUDE_PUBLICA: "false",
  ATUALIZAR_VERIFICAR_IMAGEM: "true",
  ATUALIZAR_PERMITIR_BACKUP_LOCAL: "true",
  ATUALIZAR_ESPACO_MINIMO_MB: "0",
  ATUALIZAR_TIMEOUT_SAUDE: "1",
  TZ_APP: "UTC",
});

test(
  "smoke root do controlador",
  { skip: typeof process.getuid !== "function" || process.getuid() !== 0 },
  () => {
    assert.equal(
      fs.existsSync("/var/run/docker.sock"),
      false,
      "executar o smoke sem socket Docker, com clientes falsos.",
    );
    preparar();
    const ambiente = ambienteBase();
    ok(
      executar(
        "/bin/bash",
        [`${fonte}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"],
        ambiente,
      ),
      "adoção da identidade sintética falhou.",
    );
    const atualizar = `${fonte}/scripts/servidor/atualizar.sh`;
    ok(executar("/bin/bash", [atualizar, "--simular"], ambiente), "simples inicial falhou.");

    gravar(`${estadoSimples}/atualizacao-em-andamento.json`, '{"emAndamento":true}\n');
    ok(
      executar("/bin/bash", [atualizar, "--simular"], ambiente),
      "o marcador bloqueou o caminho simples sem perfil.",
    );

    const argsInstalar = [
      "--fonte",
      fonte,
      "--app",
      app,
      "--config",
      conf,
      "--prefixo",
      prefixo,
      "--operador",
      "nobody",
      "--bin-dir",
      bin,
    ];
    ok(
      executar(
        "/bin/bash",
        [`${repo}/scripts/servidor/instalar-controlador.sh`, ...argsInstalar, "--plano"],
        ambiente,
      ),
      "o plano do controlador falhou.",
    );
    assert.equal(fs.existsSync(prefixo), false, "o plano criou o prefixo.");
    ok(
      executar(
        "/bin/bash",
        [`${repo}/scripts/servidor/instalar-controlador.sh`, ...argsInstalar, "--confirmar"],
        ambiente,
      ),
      "a instalação do controlador falhou.",
    );
    const entrada = `${prefixo}/executar`;
    ok(executar(entrada, ["estado"], ambiente), "o estado do controlador falhou.");

    ok(
      executar(
        "/bin/bash",
        [`${fonte}/scripts/servidor/compose.sh`, "config", "--quiet"],
        ambiente,
      ),
      "o compose simples falhou.",
    );
    const mutacao = executar("/bin/bash", [`${fonte}/scripts/servidor/compose.sh`, "up", "-d"], {
      ...ambiente,
      SERVIDOR_CONTROLADOR_PERFIL: `${prefixo}/perfil.json`,
    });
    assert.equal(mutacao.status, 78, "o compose do controlador aceitou mutação arbitrária.");

    gravar(`${estadoLegado}/atualizacao-em-andamento.json`, '{"emAndamento":true}\n');
    const bloqueado = executar(entrada, ["estado"], ambiente);
    assert.notEqual(bloqueado.status, 0, "o controlador aceitou marcador de estado incerto.");
    fs.rmSync(`${estadoLegado}/atualizacao-em-andamento.json`);

    const simulado = executar("/bin/bash", [atualizar, "--simular"], {
      ...ambiente,
      SERVIDOR_CONTROLADOR_PERFIL: `${prefixo}/perfil.json`,
    });
    ok(simulado, "a atualização delegada ao controlador falhou.");
    assert.match(simulado.stdout, /Simulação/);
    assert.ok(
      fs.readdirSync(`${prefixo}/dados/locks`).some((nome) => nome.startsWith("operacoes-")),
      "o controlador não usou a trava do perfil.",
    );

    const cronAntes = fs.existsSync("/etc/cron.d/frequenciapp")
      ? fs.readFileSync("/etc/cron.d/frequenciapp")
      : null;
    const cron = executar(
      "/bin/bash",
      [
        `${repo}/scripts/servidor/instalar-rotinas.sh`,
        "--controlador",
        "--perfil",
        `${prefixo}/perfil.json`,
        "--plano",
      ],
      ambiente,
    );
    ok(cron, "o plano de cron do controlador falhou.");
    assert.match(cron.stdout, new RegExp(`${prefixo}/executar backup-banco`));
    assert.deepEqual(
      fs.existsSync("/etc/cron.d/frequenciapp")
        ? fs.readFileSync("/etc/cron.d/frequenciapp")
        : null,
      cronAntes,
      "o plano escreveu cron no sistema.",
    );

    fs.rmSync(`${prefixo}/perfil.json`);
    ok(
      executar("/bin/bash", [atualizar, "--simular"], ambiente),
      "a volta ao caminho simples falhou.",
    );
    const faltante = executar("/bin/bash", [atualizar, "--simular"], {
      ...ambiente,
      SERVIDOR_CONTROLADOR_PERFIL: `${prefixo}/perfil.json`,
    });
    assert.equal(faltante.status, 78, "perfil ausente não recusou a operação.");
  },
);
