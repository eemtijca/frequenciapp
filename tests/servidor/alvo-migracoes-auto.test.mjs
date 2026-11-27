// Exercita a CLI da guarda com configurações e capturas sintéticas, sem serviços.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const programa = fileURLToPath(
  new URL("../../scripts/servidor/alvo-migracoes-auto.mjs", import.meta.url),
);
const env = { PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
const segredo = "senha-sintetica";

function cli(args, entrada) {
  const r = spawnSync(process.execPath, [programa, ...args], {
    input: entrada === undefined ? undefined : JSON.stringify(entrada),
    encoding: "utf8",
    env,
    timeout: 10000,
  });
  assert.ifError(r.error);
  assert.ok(!`${r.stdout}${r.stderr}`.includes(segredo));
  return r;
}

function config() {
  const url = `postgresql://conta:${segredo}@db:5432/sintetico`;
  return {
    name: "qa",
    services: {
      app: {
        image: "frequenciapp:qa",
        restart: "unless-stopped",
        command: ["./docker/app/entrypoint.sh"],
        networks: { interna: null, publica: null },
        environment: { MIGRAR_NA_PARTIDA: "true", DATABASE_URL: url, DIRECT_URL: url },
      },
      db: {
        networks: { interna: null },
        environment: { POSTGRES_DB: "sintetico", POSTGRES_USER: "conta" },
      },
    },
    networks: {
      interna: { name: "qa_interna", internal: true },
      publica: { name: "qa_publica" },
    },
  };
}

const compose = ["compose", "app", "db", "sintetico", "public"];
const composeManual = ["compose-manual", ...compose.slice(1)];

function configComBordaCompartilhada() {
  const c = config();
  c.networks.borda = { name: "proxy_compartilhado", external: true, ipam: {} };
  c.services.app.networks.borda = { aliases: ["frequencia"] };
  return c;
}

test("aceita a rede externa de borda só no Compose manual e preserva a rede interna do banco", () => {
  const c = configComBordaCompartilhada();
  const r = cli(composeManual, c);
  assert.equal(r.status, 0, r.stderr);
  const projecao = JSON.parse(r.stdout);
  assert.equal(projecao.rede, "qa_interna");
  assert.deepEqual(projecao.redesApp, ["proxy_compartilhado", "qa_interna", "qa_publica"]);
  assert.match(projecao.topologia, /^[0-9a-f]{64}$/);
  assert.equal(cli(compose, c).status, 1);

  const imagem = `sha256:${"a".repeat(64)}`;
  const envelope = "lote_sintetico";
  const source = "/diretorio-privado/entrada";
  const partida = c.services.app;
  partida.image = imagem;
  partida.restart = "no";
  Object.assign(partida.environment, {
    MIGRACAO_MANUAL_PROTEGIDA: "true",
    MIGRACAO_LOTE_APROVADO: envelope,
    ADMIN_EMAIL: "",
    ADMIN_SENHA: "",
  });
  partida.volumes = [
    {
      type: "bind",
      source,
      target: "/run/frequenciapp-migracao",
      read_only: true,
      bind: { create_host_path: false },
    },
  ];
  const ip = "192.0.2.10";
  const args = [...composeManual, imagem, envelope, source, ip];
  assert.equal(cli(args, c).status, 1);
  partida.extra_hosts = [`db=${ip}`];
  assert.equal(cli(args.slice(0, -1), c).status, 1);
  const alvo = cli(args, c);
  assert.equal(alvo.status, 0, alvo.stderr);
  assert.deepEqual(JSON.parse(alvo.stdout), projecao);
  for (const mapa of [["db=192.0.2.11"], [`db=${ip}`, "outro=192.0.2.11"], { outro: ip }]) {
    partida.extra_hosts = mapa;
    assert.equal(cli(args, c).status, 1);
  }
  partida.extra_hosts = { db: ip };
  c.networks.borda.name = "outra_borda";
  const outra = cli(args, c);
  assert.equal(outra.status, 0, outra.stderr);
  assert.notEqual(JSON.parse(outra.stdout).topologia, projecao.topologia);
});

test("recusa a configuração manual quando a borda compromete o isolamento do banco", () => {
  for (const alterar of [
    (c) => {
      c.services.db.networks.borda = null;
    },
    (c) => {
      c.networks.interna.external = true;
    },
    (c) => {
      c.networks.borda.name = c.networks.interna.name;
    },
    (c) => {
      c.networks.borda.driver = "overlay";
    },
    (c) => {
      c.networks.borda.ipam = { config: [{ subnet: "192.0.2.0/24" }] };
    },
    (c) => {
      c.services.proxy = { networks: { borda: { aliases: ["DB."] } } };
    },
  ]) {
    const c = configComBordaCompartilhada();
    alterar(c);
    const r = cli(composeManual, c);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
  }
});

test("projeta apenas o destino do banco Compose compartilhado por backup, app e migrador", () => {
  const r = cli(compose, config());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    projeto: "qa",
    rede: "qa_interna",
    banco: "sintetico",
    schema: "public",
    usuario: "conta",
  });
});

test("exige a imagem, o lote e o bind exatos na configuração de partida", () => {
  const c = config();
  const imagem = `sha256:${"a".repeat(64)}`;
  const envelope = "lote_sintetico";
  const source = "/diretorio-privado/entrada";
  const args = [...compose, imagem, envelope, source];
  assert.equal(cli(args, c).status, 1);
  c.services.app.environment.MIGRACAO_AUTOMATICA = "true";
  c.services.app.restart = "no";
  c.services.app.image = imagem;
  c.services.app.environment.MIGRACAO_LOTE_APROVADO = envelope;
  c.services.app.volumes = [
    {
      type: "bind",
      source,
      target: "/run/frequenciapp-migracao",
      read_only: true,
      bind: { create_host_path: false },
    },
  ];
  assert.equal(cli(args, c).status, 0);
  for (const alterar of [
    (app) => {
      app.image = `sha256:${"b".repeat(64)}`;
    },
    (app) => {
      app.environment.MIGRACAO_LOTE_APROVADO = "outro_lote";
    },
    (app) => {
      app.volumes[0].source += "-outro";
    },
    (app) => {
      app.volumes[0].read_only = false;
    },
    (app) => {
      app.volumes[0].bind.create_host_path = true;
    },
  ]) {
    const alterado = structuredClone(c);
    alterar(alterado.services.app);
    assert.equal(cli(args, alterado).status, 1);
  }
});

test("recusa sobreposições que mudam destino, código ou ambiente da migração", () => {
  const casos = [
    (c) => {
      c.services.app.environment.MIGRAR_NA_PARTIDA = "false";
    },
    (c) => {
      c.services.app.environment.DIRECT_URL = c.services.app.environment.DIRECT_URL.replace(
        "@db:",
        "@externo:",
      );
    },
    (c) => {
      c.services.app.environment.DIRECT_URL += "?host=externo";
    },
    (c) => {
      c.services.app.environment.DIRECT_URL += "?schema=public&schema=public";
    },
    (c) => {
      c.services.app.environment.DATABASE_URL += "?schema=outro";
    },
    (c) => {
      c.services.app.environment.DATABASE_SCHEMA = "outro";
    },
    (c) => {
      c.services.app.environment.NODE_OPTIONS = "sintetico";
    },
    (c) => {
      c.services.db.environment.PGSERVICE = "sintetico";
    },
    (c) => {
      c.services.app.command = ["node", "server.js"];
    },
    (c) => {
      c.services.app.entrypoint = ["/bin/sh"];
    },
    (c) => {
      c.services.app.volumes = [{ source: "falso", target: "/app" }];
    },
    (c) => {
      c.services.app.extra_hosts = { db: "192.0.2.1" };
    },
    (c) => {
      c.services.app.hostname = "db";
    },
    (c) => {
      c.services.app.network_mode = "host";
    },
    (c) => {
      c.services.db.ports = [{ target: 5432 }];
    },
    (c) => {
      c.services.db.networks.publica = null;
    },
    (c) => {
      c.networks.interna.external = true;
    },
    (c) => {
      c.networks.publica.external = true;
    },
    (c) => {
      c.services.proxy = { networks: { publica: { aliases: ["db"] } } };
    },
    (c) => {
      c.services.proxy = { networks: { publica: { aliases: ["DB."] } } };
    },
  ];
  for (const alterar of casos) {
    const c = config();
    alterar(c);
    const r = cli(compose, c);
    assert.equal(
      r.status,
      1,
      JSON.stringify(c, (k, v) => (k.endsWith("URL") ? undefined : v)),
    );
    assert.match(r.stderr, /Compose/);
    assert.equal(r.stdout, "");
  }
});

const primeiro = "20260101000000_primeiro";
const segundo = "20260102000000_segundo";
const caminho = (nome) => `prisma/migrations/${nome}/migration.sql`;
const execucao = [
  "docker/app/entrypoint.sh",
  "docker/app/migrar.mjs",
  "src/infra/schema-postgres.mjs",
];
const arquivos = {
  [caminho(primeiro)]: "CREATE TABLE exemplo (id integer);\r\n",
  [caminho(segundo)]: "ALTER TABLE exemplo ADD COLUMN nota integer;\n",
  "prisma/migrations/migration_lock.toml": 'provider = "postgresql"\n',
  ...Object.fromEntries(execucao.map((nome) => [nome, "# conteúdo sintético, não executado\n"])),
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const provaImagem = () =>
  Object.fromEntries(Object.entries(arquivos).map(([p, bytes]) => [p, hash(bytes)]));

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "alvo-migracoes-auto."));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  for (const [nome, bytes] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(repo, nome)), { recursive: true });
    writeFileSync(join(repo, nome), bytes);
  }
  function git(...args) {
    const r = spawnSync("/usr/bin/git", ["-C", repo, ...args], {
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  }
  git("init", "-q", "--template=");
  git("add", ".");
  git("-c", "user.name=QA", "-c", "user.email=qa@localhost", "commit", "-qm", "fixture");
  return { repo, revisao: git("rev-parse", "HEAD") };
}

test("confronta todos os bytes da imagem com o commit, não só o lote novo", (t) => {
  const { repo, revisao } = fixture(t);
  const args = ["imagem", repo, revisao];
  assert.equal(cli(args, provaImagem()).status, 0);
  const casos = [
    (p) => {
      p[caminho(primeiro)] = hash(arquivos[caminho(primeiro)].replace("\r\n", "\n"));
    },
    (p) => {
      delete p[caminho(segundo)];
    },
    (p) => {
      p[caminho("20260103000000_extra")] = hash("extra");
    },
    (p) => {
      p[execucao[1]] = hash("outro migrador");
    },
  ];
  for (const alterar of casos) {
    const p = provaImagem();
    alterar(p);
    const r = cli(args, p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Imagem/);
  }
});

test("sonda a árvore com bytes crus e recusa links e diretórios inesperados", (t) => {
  const { repo } = fixture(t);
  const fonte = cli(["sondar-imagem"]);
  assert.equal(fonte.status, 0, fonte.stderr);
  assert.match(fonte.stdout, /\)\("\/app"\)\.then\(/);
  // A única substituição é a raiz fixa da imagem pela pasta da fixture.
  const sonda = () =>
    spawnSync(process.execPath, ["--input-type=module", "-"], {
      input: fonte.stdout.replace(')("/app").then(', `)(${JSON.stringify(repo)}).then(`),
      env,
      encoding: "utf8",
      timeout: 10000,
    });
  const ok = sonda();
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), provaImagem());
  const recusada = () => {
    const r = sonda();
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Imagem: inventário indisponível/);
  };
  const extra = join(repo, "prisma/migrations/20260103000000_extra");
  mkdirSync(extra);
  recusada();
  rmSync(extra, { recursive: true });
  const sql = join(repo, caminho(segundo));
  rmSync(sql);
  symlinkSync(join(repo, caminho(primeiro)), sql);
  recusada();
});

const identidade = {
  cluster: "7312345678901234567",
  banco: "sintetico",
  bancoOid: "20000",
  schema: "public",
  schemaOid: "2200",
  usuario: "conta",
  primario: true,
  gatilhos: false,
};

function postgres() {
  return {
    ...identidade,
    historicoCompativel: true,
    registros: [primeiro, segundo].map((nome) => [nome, hash(arquivos[caminho(nome)]), true]),
  };
}

test("aceita somente o histórico completo e ordenado do banco e schema declarados", (t) => {
  const { repo, revisao } = fixture(t);
  const args = ["historico", repo, revisao, "sintetico", "public"];
  const ok = cli(args, postgres());
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout), identidade);
  const casos = [
    (p) => {
      p.cluster = "";
    },
    (p) => {
      p.banco = "outro";
    },
    (p) => {
      p.schema = "outro";
    },
    (p) => {
      p.primario = false;
    },
    (p) => {
      p.gatilhos = true;
    },
    (p) => {
      p.registros.pop();
    },
    (p) => {
      p.registros.reverse();
    },
    (p) => {
      p.registros[1] = p.registros[0];
    },
    (p) => {
      p.registros[0][2] = false;
    },
    (p) => {
      p.registros[0][1] = hash("bytes diferentes");
    },
  ];
  for (const alterar of casos) {
    const p = postgres();
    alterar(p);
    const r = cli(args, p);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /PostgreSQL/);
    assert.equal(r.stdout, "");
  }
});

test("recusa estrutura incompatível mesmo com todos os registros esperados", (t) => {
  const { repo, revisao } = fixture(t);
  for (const modo of ["historico", "historico-manual"]) {
    for (const valor of [false, "true", undefined]) {
      const r = cli([modo, repo, revisao, "sintetico", "public"], {
        ...postgres(),
        inicio: "1767225600.000000",
        historicoCompativel: valor,
      });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /estrutura.*histórico/i);
      assert.equal(r.stdout, "");
    }
  }
});

test("gera uma captura PostgreSQL limitada à leitura e recusa schema fora do perfil", () => {
  const r = cli(["sql-historico", "public"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(r.stdout, /pg_catalog\.pg_control_system\(\)/);
  assert.match(r.stdout, /pg_catalog\.pg_event_trigger/);
  assert.match(r.stdout, /"public"\._prisma_migrations/);
  assert.match(r.stdout, /ROLLBACK;\n$/);
  assert.equal(cli(["sql-historico", 'public"; select 1']).status, 1);
});

test("aplica prazos só na via automática, antes de tentar a primeira trava", (t) => {
  const { repo } = fixture(t);
  for (const nome of execucao.slice(1)) {
    copyFileSync(new URL(`../../${nome}`, import.meta.url), join(repo, nome));
  }
  mkdirSync(join(repo, "node_modules/pg"), { recursive: true });
  writeFileSync(
    join(repo, "node_modules/pg/index.js"),
    `
exports.Client = class {
  async connect() {}
  async query(text) {
    console.log(text);
    if (text.includes("has_schema_privilege")) return {rows: [{uso: true}]};
    if (text.includes("pg_advisory_lock")) throw new Error("trava sintética indisponível");
    return {rows: []};
  }
  async end() {}
};
`,
  );
  const nomeEHash = (nome) => ({ nome, sha256: hash(arquivos[caminho(nome)]) });
  const envelope = Buffer.from(
    JSON.stringify({
      cluster: "123456",
      banco: "sintetico",
      bancoOid: "10001",
      schema: "public",
      schemaOid: "2200",
      usuario: "conta",
      ip: "127.0.0.1",
      base: "a".repeat(40),
      alvo: "b".repeat(40),
      aplicadas: [nomeEHash(primeiro)],
      pendentes: [nomeEHash(segundo)],
    }),
  ).toString("base64url");
  for (const auto of ["true", "false"]) {
    const r = spawnSync(process.execPath, [execucao[1]], {
      cwd: repo,
      encoding: "utf8",
      timeout: 5000,
      env: {
        DIRECT_URL: "postgresql://conta@invalido/sintetico",
        MIGRACAO_AUTOMATICA: auto,
        MIGRACAO_LOTE_APROVADO: auto === "true" ? envelope : "",
      },
    });
    assert.ifError(r.error);
    assert.equal(r.status, 3);
    if (auto === "false") assert.match(r.stderr, /trava sintética indisponível/);
    assert.doesNotMatch(r.stdout, /create table/);
    if (auto === "true") {
      assert.match(
        r.stdout,
        /^SET lock_timeout = '5000ms'\nSET statement_timeout = '30s'\n[\s\S]+pg_advisory_lock/,
      );
    } else {
      assert.doesNotMatch(r.stdout, /(?:lock|statement)_timeout/);
    }
  }
});
