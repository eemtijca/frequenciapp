// Cobre o snapshot do controlador com overlay, configurações e política de recusa.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const caminhoSistema = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const semAmbienteReal = () =>
  typeof process.getuid !== "function" ||
  process.getuid() !== 0 ||
  fs.existsSync("/var/run/docker.sock");

const composeBase = [
  "name: sintetico",
  "services:",
  "  app:",
  "    image: exemplo.invalid/app:1",
  "",
].join("\n");
const composeServidor = [
  "services:",
  "  db:",
  "    image: exemplo.invalid/db:1",
  "    volumes:",
  "      - dados:/var/lib/postgresql/data",
  "volumes:",
  "  dados:",
  "",
].join("\n");
const composeCaddy = [
  "services:",
  "  caddy:",
  "    image: exemplo.invalid/caddy:1",
  "    volumes:",
  "      - ./infra/servidor/Caddyfile:/etc/caddy/Caddyfile:ro",
  "",
].join("\n");
const composeNginx = [
  "services:",
  "  nginx:",
  "    image: exemplo.invalid/nginx:1",
  "    build:",
  "      context: ./infra/servidor/nginx",
  "    volumes:",
  "      - ./infra/servidor/nginx/certificados:/etc/letsencrypt:ro",
  "",
].join("\n");
const composeObservabilidade = [
  "services:",
  "  prometheus:",
  "    image: exemplo.invalid/prometheus:1",
  "    volumes:",
  "      - ./infra/observabilidade/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
  "",
].join("\n");

function gravar(nome, conteudo, modo = 0o600) {
  fs.mkdirSync(path.dirname(nome), { recursive: true, mode: 0o700 });
  fs.writeFileSync(nome, conteudo, { mode: modo });
  fs.chmodSync(nome, modo);
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
    assert.equal(s.isSymbolicLink(), false, "A árvore sintética não contém links.");
    if (s.isDirectory()) {
      fs.chmodSync(nome, 0o700);
      for (const filho of fs.readdirSync(nome)) visitar(`${nome}/${filho}`);
    } else {
      fs.chmodSync(nome, nome.endsWith(".sh") ? 0o700 : 0o600);
    }
  };
  visitar(destino);
}

function preparar({
  proxy = "caddy",
  observabilidade = true,
  explicita = null,
  overlay = true,
} = {}) {
  assert.equal(process.getuid(), 0, "Executar a suíte administrativa com root interno isolado.");
  assert.equal(fs.existsSync("/var/run/docker.sock"), false, "Executar sem socket Docker.");
  const raiz = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/snapshot-observabilidade-`);
  const app = `${raiz}/app`;
  const config = `${raiz}/config`;
  const prefixo = `${raiz}/controlador`;
  const bin = `${raiz}/bin`;
  const destino = `${raiz}/etc`;
  fs.mkdirSync(app, { mode: 0o700 });
  fs.mkdirSync(config, { mode: 0o700 });
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.mkdirSync(destino, { mode: 0o700 });
  copiar(`${repo}/scripts/servidor`, `${app}/scripts/servidor`);
  fs.chmodSync(`${app}/scripts`, 0o700);
  gravar(`${app}/docker/app/migrar.mjs`, fs.readFileSync(`${repo}/docker/app/migrar.mjs`));
  gravar(`${app}/compose.yml`, composeBase);
  gravar(`${app}/compose.servidor.yml`, composeServidor);
  if (proxy === "caddy") {
    gravar(`${app}/compose.servidor-caddy.yml`, composeCaddy);
    gravar(`${app}/infra/servidor/Caddyfile`, "{\n}\n");
  } else {
    gravar(`${app}/compose.servidor-nginx.yml`, composeNginx);
    gravar(`${app}/infra/servidor/nginx/Dockerfile`, "FROM scratch\n");
    gravar(`${app}/infra/servidor/nginx/frequenciapp-https.conf`, "server {}\n");
    gravar(`${app}/infra/servidor/nginx/docker-entrypoint.d/50-frequenciapp.sh`, "#!/bin/sh\n");
    gravar(`${app}/infra/servidor/nginx/certificados/chave.pem`, "sintetico\n");
  }
  if (overlay) gravar(`${app}/compose.observabilidade.yml`, composeObservabilidade);
  if (observabilidade) {
    gravar(
      `${app}/infra/observabilidade/prometheus/prometheus.yml`,
      "global:\n  scrape_interval: 30s\n",
    );
  }
  const executar = (comando, args, opcoes = {}) =>
    spawnSync(comando, args, {
      encoding: "utf8",
      env: { PATH: `${bin}:${caminhoSistema}`, HOME: raiz, TMPDIR: raiz },
      ...opcoes,
    });
  const ok = (r, mensagem = "comando sintético falhou") => {
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, `${mensagem}\n${r.stdout}\n${r.stderr}`);
    return r;
  };
  ok(executar("/usr/bin/git", ["-C", app, "init", "-q"]));
  gravar(
    `${config}/app.env`,
    "POSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\nAUTH_SECRET=0123456789abcdef0123456789abcdef\n",
  );
  const linhas = [
    "COMPOSE_PROJECT_NAME=sintetico",
    `PROXY_TIPO=${proxy}`,
    "BACKUP_MODO=compose",
    "BACKUP_PLANILHAS_HABILITADO=false",
    `ESTADO_DIR=${raiz}/legado`,
    "TZ_APP=UTC",
    "CRON_FUSO_SISTEMA=UTC",
    "PROMETHEUS_PORTA=19090",
    "METRICAS_TOKEN=0123456789abcdef0123456789abcdef",
    "DOMINIO=frequencia.exemplo.br",
    `CERTBOT_CERTS_DIR=${app}/infra/servidor/nginx/certificados`,
  ];
  if (proxy === "caddy") linhas.push("CADDYFILE=infra/servidor/Caddyfile");
  if (observabilidade) linhas.push("OBSERVABILIDADE_HABILITADA=true");
  else linhas.push("OBSERVABILIDADE_HABILITADA=false");
  if (explicita) linhas.push(`COMPOSE_ARQUIVOS=${explicita}`);
  gravar(`${config}/ops.env`, `${linhas.join("\n")}\n`);
  gravar(
    `${bin}/docker`,
    `#!/bin/bash
set -Eeuo pipefail
printf '%s\\n' "$*" >>"${raiz}/docker.log"
if [ "$1" = info ]; then printf '{"ID":"daemon-sintetico"}\\n'; exit 0; fi
if [ "$1" = inspect ]; then
  printf '%s\\n' '[{"Id":"container-app","Image":"sha256:app","State":{"Running":true,"Health":{"Status":"healthy"}},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Image":"sha256:db","State":{"Running":true},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"sintetico-dados","Source":"/var/lib/docker/volumes/sintetico-dados/_data","Destination":"/var/lib/postgresql/data"}]}]'
  exit 0
fi
[ "$1" = compose ] || { echo "docker inesperado: $*" >&2; exit 93; }
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-name | --project-directory | --env-file | -f | --profile) shift 2 ;;
    *) break ;;
  esac
done
case "$1" in
  config)
    if [[ " $* " == *" --services "* ]]; then printf 'app\\ndb\\ncaddy\\nprometheus\\n';
    else printf '%s\\n' '{"name":"sintetico","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{},"prometheus":{}},"volumes":{"dados":{"name":"sintetico-dados"}}}'; fi
    exit 0
    ;;
  ps) printf 'container-app\\ncontainer-db\\n'; exit 0 ;;
  exec) exit 0 ;;
  *) echo "compose inesperado: $1" >&2; exit 94 ;;
esac
`,
    0o700,
  );
  const ambiente = {
    PATH: `${bin}:${caminhoSistema}`,
    HOME: raiz,
    TMPDIR: raiz,
    APP_DIR: app,
    APP_ENV_FILE: `${config}/app.env`,
    OPS_ENV_FILE: `${config}/ops.env`,
    SERVIDOR_CONFIG_DIR: config,
    SERVIDOR_IDENTIDADE_ARQUIVO: `${config}/identidade.json`,
    SERVIDOR_AMBIENTE_INJETADO: "true",
    SERVIDOR_LOCK_DIR: `${raiz}/locks`,
    COMPOSE_PROJECT_NAME: "sintetico",
    PROXY_TIPO: proxy,
    OBSERVABILIDADE_HABILITADA: observabilidade ? "true" : "false",
  };
  if (explicita) ambiente.COMPOSE_ARQUIVOS = explicita;
  ok(
    executar("/bin/bash", [`${app}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"], {
      env: ambiente,
    }),
    "adoção da identidade sintética falhou",
  );
  const cli = `${repo}/scripts/servidor/controlador/cli.mjs`;
  const instalar = (fase = "--confirmar") =>
    executar(
      process.execPath,
      [
        cli,
        "instalar",
        "--fonte",
        app,
        "--app",
        app,
        "--config",
        config,
        "--prefixo",
        prefixo,
        "--operador",
        "nobody",
        "--bin-dir",
        bin,
        fase,
      ],
      { env: ambiente },
    );
  return {
    raiz,
    app,
    config,
    prefixo,
    bin,
    destino,
    ambiente,
    executar,
    ok,
    cli,
    instalar,
    perfil: `${prefixo}/perfil.json`,
    limpar: () => fs.rmSync(raiz, { recursive: true, force: true }),
  };
}

function adotar(f) {
  f.ok(f.instalar(), "a instalação do controlador falhou");
  f.ok(
    f.executar(`${f.prefixo}/executar`, [
      "instalar-rotinas",
      "--confirmar",
      "--destino",
      f.destino,
    ]),
    "a instalação das rotinas falhou",
  );
}

function alterarOps(f, transformacao) {
  const arquivo = `${f.config}/ops.env`;
  const texto = fs.readFileSync(arquivo, "utf8");
  fs.writeFileSync(arquivo, transformacao(texto), { mode: 0o600 });
  fs.chmodSync(arquivo, 0o600);
}

function manifesto(f) {
  return JSON.parse(fs.readFileSync(`${f.prefixo}/snapshot/manifesto.json`, "utf8"));
}

function composeDoSnapshot(f, perfil) {
  return perfil.compose.map((nome) => fs.readFileSync(nome));
}

test(
  "snapshot implícito inclui overlay e configurações e a entrada usa o snapshot",
  { skip: semAmbienteReal() },
  () => {
    const f = preparar({ observabilidade: true });
    try {
      adotar(f);
      const perfil = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
      const snapshot = perfil.snapshot;
      assert.equal(perfil.compose.length, 4);
      assert.ok(perfil.compose.every((nome) => nome.startsWith(`${snapshot}/compose/`)));
      assert.ok(
        fs.existsSync(`${snapshot}/compose.observabilidade.yml`),
        "o overlay canônico precisa estar no snapshot",
      );
      assert.ok(fs.existsSync(`${snapshot}/infra/observabilidade/prometheus/prometheus.yml`));
      assert.ok(fs.existsSync(`${snapshot}/infra/servidor/Caddyfile`));
      assert.deepEqual(composeDoSnapshot(f, perfil).at(-1), Buffer.from(composeObservabilidade));
      const membros = manifesto(f);
      for (const nome of [
        "compose/0.yml",
        "compose/1.yml",
        "compose/2.yml",
        "compose/3.yml",
        "compose.observabilidade.yml",
        "infra/observabilidade/prometheus/prometheus.yml",
        "infra/servidor/Caddyfile",
      ])
        assert.match(membros[nome], /^[a-f0-9]{64}$/, `manifesto sem ${nome}`);

      f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]), "a leitura autorizada falhou");
      const consulta = f.ok(
        f.executar(
          "/bin/bash",
          [`${f.app}/scripts/servidor/compose.sh`, "config", "--format", "json"],
          {
            env: { ...f.ambiente, SERVIDOR_CONTROLADOR_PERFIL: f.perfil },
          },
        ),
        "a consulta Compose autorizada falhou",
      );
      assert.match(consulta.stdout, /"name":"sintetico"/);
      const log = fs.readFileSync(`${f.raiz}/docker.log`, "utf8");
      assert.match(log, new RegExp(`--project-directory ${snapshot}`));
      for (const nome of perfil.compose)
        assert.ok(log.includes(`-f ${nome}`), `consulta sem ${nome}`);

      const seletores = {
        AGENDA_HABILITADA: "false",
        AGENDA_NOTIFICACOES: "false",
        AGENDA_PLANILHAS: "false",
        AGENDA_INDICADORES: "false",
        BACKUP_PLANILHAS_HABILITADO: "false",
      };
      f.ok(
        f.executar(process.execPath, [f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"], {
          input: JSON.stringify({ seletores, destino: f.destino }),
        }),
        "a mutação autorizada falhou",
      );
      const novo = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
      assert.equal(novo.versao, 2);
      assert.notEqual(novo.snapshot, snapshot);
      for (const nome of [
        "compose.observabilidade.yml",
        "infra/observabilidade/prometheus/prometheus.yml",
        "infra/servidor/Caddyfile",
      ])
        assert.ok(fs.existsSync(`${novo.snapshot}/${nome}`), `geração sem ${nome}`);
      assert.ok(
        novo.compose.every((nome) => nome.startsWith(`${novo.snapshot}/compose/`)),
        "a geração voltou ao checkout mutável",
      );
      f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]), "o estado pós-mutação falhou");
    } finally {
      f.limpar();
    }
  },
);

test(
  "overlay explícito com a flag desligada entra no snapshot",
  { skip: semAmbienteReal() },
  () => {
    const explicita = [
      "compose.yml",
      "compose.servidor.yml",
      "compose.servidor-caddy.yml",
      "compose.observabilidade.yml",
    ].join(":");
    const f = preparar({ observabilidade: true, explicita });
    try {
      alterarOps(f, (texto) =>
        texto.replace(/^OBSERVABILIDADE_HABILITADA=.*$/m, "OBSERVABILIDADE_HABILITADA=false"),
      );
      adotar(f);
      const perfil = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
      assert.equal(perfil.compose.length, 4);
      assert.ok(
        fs.existsSync(`${perfil.snapshot}/infra/observabilidade/prometheus/prometheus.yml`),
      );
      assert.ok(fs.existsSync(perfil.compose[3]));
    } finally {
      f.limpar();
    }
  },
);

test("instalação legada sem observabilidade continua aceita", { skip: semAmbienteReal() }, () => {
  const f = preparar({
    observabilidade: false,
    overlay: false,
    explicita: "compose.yml:compose.servidor.yml:compose.servidor-caddy.yml",
  });
  try {
    adotar(f);
    const perfil = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
    assert.equal(perfil.compose.length, 3);
    assert.equal(fs.existsSync(`${perfil.snapshot}/compose.observabilidade.yml`), false);
    assert.equal(fs.existsSync(`${perfil.snapshot}/infra/observabilidade`), false);
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  } finally {
    f.limpar();
  }
});

test(
  "snapshot do Nginx copia configurações e exclui certificados",
  { skip: semAmbienteReal() },
  () => {
    const f = preparar({ proxy: "nginx", observabilidade: true });
    try {
      adotar(f);
      const perfil = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
      const snapshot = perfil.snapshot;
      for (const nome of [
        "infra/servidor/nginx/Dockerfile",
        "infra/servidor/nginx/frequenciapp-https.conf",
        "infra/servidor/nginx/docker-entrypoint.d/50-frequenciapp.sh",
      ])
        assert.ok(fs.existsSync(`${snapshot}/${nome}`), `snapshot sem ${nome}`);
      assert.equal(
        fs.existsSync(`${snapshot}/infra/servidor/nginx/certificados`),
        false,
        "o snapshot copiou certificados",
      );
      assert.match(manifesto(f)["infra/servidor/nginx/frequenciapp-https.conf"], /^[a-f0-9]{64}$/);
      assert.ok(perfil.compose.every((nome) => nome.startsWith(`${snapshot}/compose/`)));
    } finally {
      f.limpar();
    }
  },
);

test(
  "lista explícita sem overlay com a flag ligada recusa antes de criar o prefixo",
  { skip: semAmbienteReal() },
  () => {
    const f = preparar({
      observabilidade: false,
      explicita: "compose.yml:compose.servidor.yml:compose.servidor-caddy.yml",
    });
    try {
      alterarOps(f, (texto) =>
        texto.replace(/^OBSERVABILIDADE_HABILITADA=.*$/m, "OBSERVABILIDADE_HABILITADA=true"),
      );
      const r = f.instalar();
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /OBSERVABILIDADE_HABILITADA=true exige compose\.observabilidade\.yml/);
      assert.equal(fs.existsSync(f.prefixo), false, "a recusa criou o prefixo");
    } finally {
      f.limpar();
    }
  },
);

test(
  "overlay ausente recusa antes de criar o prefixo e sem efeito colateral",
  { skip: semAmbienteReal() },
  () => {
    const f = preparar({ observabilidade: true });
    try {
      fs.rmSync(`${f.app}/compose.observabilidade.yml`);
      const antes = fs.readdirSync(f.raiz).sort();
      const r = f.instalar();
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /Arquivo Compose não encontrado: .*compose\.observabilidade\.yml/);
      assert.equal(fs.existsSync(f.prefixo), false, "a recusa criou o prefixo");
      assert.deepEqual(fs.readdirSync(f.raiz).sort(), antes);
    } finally {
      f.limpar();
    }
  },
);

test(
  "duplicata por relativo, absoluto e link entra uma vez no perfil",
  { skip: semAmbienteReal() },
  () => {
    const externo = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/snapshot-link-`);
    const f = preparar({
      observabilidade: true,
      explicita:
        "compose.yml:compose.servidor.yml:compose.servidor-caddy.yml:compose.observabilidade.yml",
    });
    try {
      const link = `${externo}/overlay-link.yml`;
      fs.symlinkSync(`${f.app}/compose.observabilidade.yml`, link);
      alterarOps(f, (texto) =>
        texto.replace(
          /^COMPOSE_ARQUIVOS=.*$/m,
          `COMPOSE_ARQUIVOS=compose.yml:compose.servidor.yml:compose.servidor-caddy.yml:compose.observabilidade.yml:${f.app}/compose.observabilidade.yml:${link}`,
        ),
      );
      const r = f.instalar();
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(r.status, 0, r.stderr);
      const perfil = JSON.parse(fs.readFileSync(f.perfil, "utf8"));
      assert.equal(perfil.compose.length, 4);
    } finally {
      f.limpar();
      fs.rmSync(externo, { recursive: true, force: true });
    }
  },
);

test("docker compose config resolve os arquivos a partir de um snapshot", () => {
  const versao = spawnSync("docker", ["compose", "version"], { encoding: "utf8" });
  if (versao.error || versao.status !== 0) {
    test.skip("Docker Compose indisponível neste ambiente.");
    return;
  }
  const raiz = fs.mkdtempSync(`${process.env.TMPDIR ?? "/tmp"}/compose-snapshot-`);
  try {
    const snapshot = `${raiz}/snapshot`;
    for (const [nome, conteudo] of [
      ["compose/0.yml", composeBase],
      ["compose/1.yml", composeServidor],
      ["compose/2.yml", composeCaddy],
      ["compose/3.yml", composeObservabilidade],
      ["infra/servidor/Caddyfile", "{\n}\n"],
      ["infra/observabilidade/prometheus/prometheus.yml", "global:\n  scrape_interval: 30s\n"],
    ])
      gravar(`${snapshot}/${nome}`, conteudo);
    const args = [
      "compose",
      "--project-name",
      "sintetico",
      "--project-directory",
      snapshot,
      "-f",
      `${snapshot}/compose/0.yml`,
      "-f",
      `${snapshot}/compose/1.yml`,
      "-f",
      `${snapshot}/compose/2.yml`,
      "-f",
      `${snapshot}/compose/3.yml`,
      "config",
      "--format",
      "json",
    ];
    const r = spawnSync("docker", args, {
      encoding: "utf8",
      env: { PATH: caminhoSistema, HOME: raiz, TMPDIR: raiz },
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    const config = JSON.parse(r.stdout);
    assert.equal(config.services.caddy.volumes[0].source, `${snapshot}/infra/servidor/Caddyfile`);
    assert.equal(
      config.services.prometheus.volumes[0].source,
      `${snapshot}/infra/observabilidade/prometheus/prometheus.yml`,
    );
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});
