// Exercita o SQL e as autenticações reais sem Docker ou socket no driver.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const raiz = path.resolve(import.meta.dirname, "../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const salvar = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
const admin = "preview_admin_ensaio";
const senhas = {
  postgres: "senha-sintetica-postgres-exclusiva-0000",
  [admin]: "senha-sintetica-do-admin-do-ensaio-0000",
  preview_migrador: "senha-sintetica-do-migrador-do-ensaio-0001",
  preview_app: "senha-sintetica-do-runtime-do-ensaio-0002",
  alternativa: "senha-sintetica-alternativa-do-ensaio-0003",
  incorreta: "senha-sintetica-incorreta-do-ensaio-0004",
};
// A intrusa de postgres aborta o REVOKE antes da conferência contratual final.
export function conferirRecusaIntrusa(r) {
  assert.equal(r.error, undefined, "recusa da intrusa: erro do cliente");
  assert.equal(r.signal, null, "recusa da intrusa: cliente interrompido");
  assert.equal(r.status, 3, "recusa da intrusa: código divergente");
  assert.match(
    r.stderr,
    /^psql:<stdin>:143: ERROR: +42501: permission denied for table intrusa\r?$/m,
    "recusa da intrusa: causa divergente",
  );
}
export const sqlRelatorio = String.raw`with
papeis as (
  select jsonb_object_agg(rolname, jsonb_build_object(
    'login', rolcanlogin,
    'herda', rolinherit,
    'superusuario', rolsuper,
    'criaPapel', rolcreaterole,
    'criaBanco', rolcreatedb,
    'replica', rolreplication,
    'ignoraRls', rolbypassrls
  )) as valor
  from pg_roles
  where rolname in ('preview_migrador', 'preview_app')
),
membros_saida as (
  select count(*)::int as valor
  from pg_auth_members a
  join pg_roles m on m.oid = a.member
  where m.rolname in ('preview_migrador', 'preview_app')
),
membros_entrada as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'papel', r.rolname,
    'membro', m.rolname,
    'herda', a.inherit_option,
    'set', a.set_option,
    'admin', a.admin_option
  ) order by r.rolname, m.rolname, a.inherit_option, a.set_option, a.admin_option), '[]'::jsonb) as valor
  from pg_auth_members a
  join pg_roles r on r.oid = a.roleid
  join pg_roles m on m.oid = a.member
  where r.rolname in ('preview_migrador', 'preview_app')
),
schema_preview as (
  select jsonb_build_object(
    'dono', pg_get_userbyid(n.nspowner),
    'migradorUso', has_schema_privilege('preview_migrador', 'preview', 'USAGE'),
    'migradorCria', has_schema_privilege('preview_migrador', 'preview', 'CREATE'),
    'appUso', has_schema_privilege('preview_app', 'preview', 'USAGE'),
    'appCria', has_schema_privilege('preview_app', 'preview', 'CREATE'),
    'publico', (select count(*)::int
                  from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
                 where a.grantee = 0)
  ) as valor
  from pg_namespace n
  where n.nspname = 'preview'
),
tabelas as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', c.relname,
    'dono', pg_get_userbyid(c.relowner),
    'appSeleciona', has_table_privilege('preview_app', c.oid, 'SELECT'),
    'appInsere', has_table_privilege('preview_app', c.oid, 'INSERT'),
    'appAtualiza', has_table_privilege('preview_app', c.oid, 'UPDATE'),
    'appRemove', has_table_privilege('preview_app', c.oid, 'DELETE'),
    'publico', (select count(*)::int
                  from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                 where a.grantee = 0)
  ) order by c.relname), '[]'::jsonb) as valor
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'preview' and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
sequencias as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', c.relname,
    'dono', pg_get_userbyid(c.relowner),
    'appUso', has_sequence_privilege('preview_app', c.oid, 'USAGE'),
    'appSeleciona', has_sequence_privilege('preview_app', c.oid, 'SELECT'),
    'publico', (select count(*)::int
                  from aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
                 where a.grantee = 0)
  ) order by c.relname), '[]'::jsonb) as valor
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'preview' and c.relkind = 'S'
),
funcoes as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', p.proname,
    'dono', pg_get_userbyid(p.proowner),
    'appExecuta', has_function_privilege('preview_app', p.oid, 'EXECUTE'),
    'publico', (select count(*)::int
                  from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where a.grantee = 0)
  ) order by p.proname), '[]'::jsonb) as valor
  from pg_proc p
  where p.pronamespace = 'preview'::regnamespace
),
tipos as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'nome', t.typname,
    'dono', pg_get_userbyid(t.typowner),
    'appUsa', has_type_privilege('preview_app', t.oid, 'USAGE'),
    'publico', (select count(*)::int
                  from aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
                 where a.grantee = 0)
  ) order by t.typname), '[]'::jsonb) as valor
  from pg_type t
  where t.typnamespace = 'preview'::regnamespace
    and t.typtype in ('e', 'd')
),
banco as (
  select jsonb_build_object(
    'migradorConecta', has_database_privilege('preview_migrador', current_database(), 'CONNECT'),
    'migradorCria', has_database_privilege('preview_migrador', current_database(), 'CREATE'),
    'appConecta', has_database_privilege('preview_app', current_database(), 'CONNECT'),
    'appCria', has_database_privilege('preview_app', current_database(), 'CREATE')
  ) as valor
),
schema_alheio as (
  select jsonb_build_object(
    'appUso', has_schema_privilege('preview_app',
      (select oid from pg_namespace where nspname = 'producao_simulada'), 'USAGE'),
    'appSeleciona', has_table_privilege('preview_app',
      (select c.oid from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'producao_simulada' and c.relname = 'dados'), 'SELECT'),
    'migradorUso', has_schema_privilege('preview_migrador',
      (select oid from pg_namespace where nspname = 'producao_simulada'), 'USAGE'),
    'migradorSeleciona', has_table_privilege('preview_migrador',
      (select c.oid from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'producao_simulada' and c.relname = 'dados'), 'SELECT')
  ) as valor
),
publico_alheio as (
  select jsonb_build_object(
    'appSeleciona', has_table_privilege('preview_app',
      (select c.oid from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'dado_producao'), 'SELECT')
  ) as valor
)
select jsonb_build_object(
  'administrador', current_user,
  'papeis', (select valor from papeis),
  'membrosSaida', (select valor from membros_saida),
  'membrosEntrada', (select valor from membros_entrada),
  'schemaPreview', (select valor from schema_preview),
  'tabelas', (select valor from tabelas),
  'sequencias', (select valor from sequencias),
  'funcoes', (select valor from funcoes),
  'tipos', (select valor from tipos),
  'banco', (select valor from banco),
  'schemaAlheio', (select valor from schema_alheio),
  'publicoAlheio', (select valor from publico_alheio)
);`;

export const nomesRelatoriosPreview = [
  "isolamento.json",
  "readiness.json",
  "casos.json",
  "resultado.json",
  "privilegios.json",
  "rollback.json",
  "falha.json",
  "comandos.json",
];
// Apenas relatórios fechados; snapshots de pg_authid, senhas e PGDATA nunca saem.
export async function exportarRelatorios(pasta, manifesto, saida = process.stdout) {
  const ler = (nome) => {
    const alvo = path.join(pasta, nome),
      s = fs.lstatSync(alvo);
    assert.ok(s.isFile() && s.size <= 262144, "relatório fora do limite");
    return JSON.parse(fs.readFileSync(alvo, "utf8"));
  };
  const arquivos = [];
  const adicionar = (nome, valor) => {
    const b = Buffer.from(JSON.stringify(valor) + "\n");
    arquivos.push({ nome, sha256: hash(b), base64: b.toString("base64") });
  };
  for (const nome of nomesRelatoriosPreview.filter((n) => n !== "comandos.json")) {
    if (fs.existsSync(path.join(pasta, nome))) adicionar(nome, ler(nome));
  }
  const nomes = fs
    .readdirSync(pasta)
    .filter((n) => /^comando-[1-9]\d{0,2}\.json$/.test(n))
    .sort((a, b) => Number(a.slice(8, -5)) - Number(b.slice(8, -5)));
  assert.ok(nomes.length <= 128, "comandos além do limite");
  adicionar(
    "comandos.json",
    nomes.map((nome, i) => {
      assert.equal(nome, `comando-${i + 1}.json`, "recibos de comandos incompletos");
      const { nome: operacao, status, sinal, erro, stdoutSha256, stderrSha256 } = ler(nome);
      return { nome: operacao, status, sinal, erro, stdoutSha256, stderrSha256 };
    }),
  );
  for (const nome of ["isolamento.json", "resultado.json"])
    assert.ok(
      arquivos.some((a) => a.nome === nome),
      "relatório obrigatório ausente",
    );
  const corpo = Buffer.from(
    JSON.stringify({ rodada: manifesto.rodada, fase: manifesto.fase, arquivos }),
  );
  assert.ok(corpo.length <= 1048576, "exportação além do limite");
  await new Promise((resolve, reject) =>
    saida.write(`PREVIEW_EVIDENCIAS_V1 ${hash(corpo)} ${corpo.toString("base64")}\n`, (erro) =>
      erro ? reject(erro) : resolve(),
    ),
  );
}
export function conferirIsolamento(f) {
  assert.equal(f.uid, 999, "UID não isolado");
  assert.equal(f.gid, 999, "GID não isolado");
  assert.equal(f.dockerenv, true, "contêiner ausente");
  assert.equal(f.sockets, false, "socket Docker presente");
  assert.deepEqual(f.interfaces, ["lo"], "interface externa presente");
  assert.equal(f.rotas.trim().split("\n").length, 1, "rota IPv4 presente");
  for (const linha of f.ipv6.trim().split("\n").filter(Boolean))
    assert.equal(linha.trim().split(/\s+/).at(-1), "lo", "rota IPv6 externa");
  for (const campo of ["CapEff", "CapPrm", "CapBnd"])
    assert.match(f.status, new RegExp(`^${campo}:\\s*0+$`, "m"), "capacidade presente");
  assert.match(f.status, /^NoNewPrivs:\s*1$/m, "NNP ausente");
  for (const destino of ["/", "/app"]) {
    const m = f.mounts.filter((m) => m.destino === destino);
    assert.equal(m.length, 1, "montagem somente leitura ausente");
    assert.ok(m[0].opcoes.includes("ro"), "raiz ou fonte gravável");
  }
  for (const destino of ["/ensaio", "/var/lib/postgresql/data"]) {
    const m = f.mounts.filter((m) => m.destino === destino);
    assert.equal(m.length, 1, "tmpfs próprio ausente");
    assert.equal(m[0].tipo, "tmpfs");
    for (const o of ["rw", "nosuid", "nodev", "noexec"]) assert.ok(m[0].opcoes.includes(o));
    const d = f.diretorios.find((d) => d.caminho === destino);
    assert.ok(d);
    assert.equal(d.uid, 999);
    assert.equal(d.gid, 999);
    assert.equal(d.modo, 0o700);
    assert.deepEqual(d.entradas, [], "diretório PG ou ensaio não vazio");
  }
}
function fatosIsolamento() {
  return {
    uid: process.getuid(),
    gid: process.getgid(),
    dockerenv: fs.existsSync("/.dockerenv"),
    sockets: fs.existsSync("/var/run/docker.sock") || fs.existsSync("/run/docker.sock"),
    interfaces: fs.readdirSync("/sys/class/net").sort(),
    rotas: fs.readFileSync("/proc/net/route", "utf8"),
    ipv6: fs.readFileSync("/proc/net/ipv6_route", "utf8"),
    status: fs.readFileSync("/proc/self/status", "utf8"),
    mounts: fs
      .readFileSync("/proc/self/mountinfo", "utf8")
      .trim()
      .split("\n")
      .map((linha) => {
        const [antes, depois] = linha.split(" - ");
        const a = antes.split(" ");
        return { destino: a[4], opcoes: a[5].split(","), tipo: depois.split(" ")[0] };
      }),
    diretorios: ["/ensaio", "/var/lib/postgresql/data"].map((caminho) => {
      const s = fs.statSync(caminho);
      return {
        caminho,
        uid: s.uid,
        gid: s.gid,
        modo: s.mode & 0o777,
        entradas: fs.readdirSync(caminho),
      };
    }),
  };
}
function ambienteKernel() {
  const mapa = {};
  for (const par of fs.readFileSync("/proc/self/environ", "utf8").split("\0").filter(Boolean)) {
    const i = par.indexOf("=");
    assert.ok(i > 0);
    const k = par.slice(0, i);
    assert.equal(Object.hasOwn(mapa, k), false, "ambiente duplicado");
    mapa[k] = par.slice(i + 1);
  }
  return mapa;
}
export async function principal(args = process.argv.slice(2)) {
  assert.equal(args.length, 1);
  assert.match(args[0], /^--fase=(vertical|restante|completo)$/);
  const fase = args[0].slice(7);
  const fatos = fatosIsolamento();
  conferirIsolamento(fatos);
  const manifesto = JSON.parse(fs.readFileSync(path.join(raiz, "preview-fontes.json"), "utf8"));
  assert.equal(manifesto.fase, fase);
  assert.equal(process.env.PREVIEW_ENSAIO_RODADA, manifesto.rodada);
  assert.deepEqual(ambienteKernel(), manifesto.ambiente, "ambiente não aprovado");
  for (const [nome, sha] of Object.entries(manifesto.fontes)) {
    assert.equal(hash(fs.readFileSync(path.join(raiz, nome))), sha, "fonte capturada divergente");
    assert.ok([0o444, 0o555].includes(fs.statSync(path.join(raiz, nome)).mode & 0o777));
  }
  const evidencia = "/ensaio/evidencias";
  fs.mkdirSync(evidencia, { mode: 0o700 });
  salvar(path.join(evidencia, "isolamento.json"), {
    ...fatos,
    fontes: manifesto.fontes,
    sqlRelatorioSha256: hash(sqlRelatorio),
  });
  const env = {
    PATH: process.env.PATH,
    HOME: "/ensaio",
    TMPDIR: "/ensaio",
    LANG: "C.UTF-8",
    PGCONNECT_TIMEOUT: "2",
  };
  const casos = [];
  let sequencia = 0;
  function executar(nome, bin, argv, extra = {}, input) {
    const r = spawnSync(bin, argv, {
      cwd: raiz,
      env: { ...env, ...extra },
      input,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 2 * 1048576,
    });
    const recibo = {
      nome,
      status: r.status,
      sinal: r.signal,
      erro: r.error?.code ?? null,
      stdoutSha256: hash(r.stdout ?? ""),
      stderrSha256: hash(r.stderr ?? ""),
    };
    salvar(path.join(evidencia, `comando-${++sequencia}.json`), {
      ...recibo,
      bin,
      argv,
      stdout: r.stdout,
      stderr: r.stderr,
    });
    process.stdout.write(JSON.stringify({ tipo: "comando", ...recibo }) + "\n");
    assert.equal(r.error, undefined, `${nome}: erro do cliente`);
    assert.equal(r.signal, null, `${nome}: cliente interrompido`);
    return r;
  }
  function sucesso(r) {
    assert.equal(r.status, 0, "comando real recusado; consultar recibo privado");
    return r.stdout.trim();
  }
  function rejeicao(r, status, causa) {
    assert.equal(r.status, status, "código de recusa divergente");
    assert.match(r.stderr, causa, "causa de recusa divergente");
  }
  function psql(nome, usuario, sql, senha = senhas[usuario], extras = {}) {
    return executar(
      nome,
      "psql",
      [
        "-X",
        "-q",
        "-At",
        "-h",
        "127.0.0.1",
        "-p",
        "55432",
        "-U",
        usuario,
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "VERBOSITY=verbose",
        "-f",
        "-",
      ],
      { PGPASSWORD: senha, ...extras },
      sql,
    );
  }
  const consultar = (nome, usuario, sql) => sucesso(psql(nome, usuario, sql));
  function provisionar(nome, migrador = senhas.preview_migrador, app = senhas.preview_app) {
    const extras = {};
    if (migrador !== null) extras.PREVIEW_SENHA_MIGRADOR = migrador;
    if (app !== null) extras.PREVIEW_SENHA_APP = app;
    return psql(
      nome,
      admin,
      fs.readFileSync(path.join(raiz, "scripts/banco/provisionar-preview.sql"), "utf8"),
      senhas[admin],
      extras,
    );
  }
  function caso(nome, fn) {
    fn();
    casos.push(nome);
    salvar(path.join(evidencia, "casos.json"), { rodada: manifesto.rodada, fase, casos });
    process.stdout.write(JSON.stringify({ tipo: "caso", nome, estado: "aprovado" }) + "\n");
  }
  const pgdata = "/ensaio/pgdata";
  let iniciado = false,
    causa;
  try {
    const pwfile = "/ensaio/senha-postgres";
    fs.writeFileSync(pwfile, senhas.postgres + "\n", { mode: 0o600 });
    sucesso(
      executar("initdb-scram", "initdb", [
        "-D",
        pgdata,
        "-U",
        "postgres",
        "--auth-host=scram-sha-256",
        "--auth-local=scram-sha-256",
        `--pwfile=${pwfile}`,
        "--no-locale",
        "-E",
        "UTF8",
      ]),
    );
    fs.unlinkSync(pwfile);
    const regras = fs
      .readFileSync(path.join(pgdata, "pg_hba.conf"), "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"));
    assert.ok(
      regras.length > 0 && regras.every((s) => /scram-sha-256$/.test(s)),
      "autenticação insegura",
    );
    fs.appendFileSync(
      path.join(pgdata, "postgresql.conf"),
      "\nlisten_addresses='127.0.0.1'\nport=55432\nunix_socket_directories=''\npassword_encryption='scram-sha-256'\n",
    );
    sucesso(
      executar("pg-start", "pg_ctl", [
        "-D",
        pgdata,
        "-l",
        path.join(evidencia, "postgres.log"),
        "-w",
        "start",
      ]),
    );
    iniciado = true;
    let pronto;
    for (let tentativa = 0; tentativa < 20; tentativa++) {
      const r = psql(
        "readiness-readonly",
        "postgres",
        `begin read only;
select json_build_object('usuario',current_user,'banco',current_database(),'major',current_setting('server_version_num')::int / 10000,
 'objetos',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'),
 'schemas',(select count(*) from pg_namespace where nspname !~ '^pg_' and nspname not in ('public','information_schema')),
 'roles',(select count(*) from pg_roles where rolname !~ '^pg_' and rolname <> 'postgres'),
 'scram',(select rolpassword like 'SCRAM-SHA-256$%' from pg_authid where rolname=current_user)); commit;`,
      );
      if (r.status === 0) {
        pronto = JSON.parse(r.stdout.trim());
        break;
      }
      assert.equal(r.status, 2, "readiness não pode repetir erro SQL");
      assert.match(
        r.stderr,
        /connection refused|starting up/i,
        "readiness recusou causa não transitória",
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(
      pronto,
      {
        usuario: "postgres",
        banco: "postgres",
        major: 17,
        objetos: 0,
        schemas: 0,
        roles: 0,
        scram: true,
      },
      "identidade ou vazio divergente antes das fixtures",
    );
    salvar(path.join(evidencia, "readiness.json"), pronto);
    // As escritas sintéticas só começam após identidade, autenticação e vazio conferidos.
    consultar(
      "fixtures-administrador-sentinelas",
      "postgres",
      `create role ${admin} login createrole password '${senhas[admin]}';
alter database postgres owner to ${admin}; alter schema public owner to ${admin};
create schema producao_simulada; create table producao_simulada.dados (id integer primary key, segredo text);
insert into producao_simulada.dados values (1, 'dado sintetico de producao');
create table public.dado_producao (id integer primary key, segredo text);
insert into public.dado_producao values (1, 'dado sintetico de public');
create schema preview; alter schema preview owner to ${admin};`,
    );
    if (fase !== "restante") {
      caso("administrador-nao-superusuario", () =>
        assert.equal(
          consultar(
            "atributos-admin",
            "postgres",
            `select rolsuper::text || ':' || rolcreaterole::text from pg_roles where rolname='${admin}'`,
          ),
          "false:true",
        ),
      );
      for (const [nome, m, a, mensagem] of [
        ["migrador-ausente", null, senhas.preview_app, /Defina PREVIEW_SENHA_MIGRADOR/],
        ["app-ausente", senhas.preview_migrador, null, /Defina PREVIEW_SENHA_APP/],
        ["migrador-curto", "curta", senhas.preview_app, /PREVIEW_SENHA_MIGRADOR precisa ter/],
        ["app-curta", senhas.preview_migrador, "curta", /PREVIEW_SENHA_APP precisa ter/],
        [
          "senhas-iguais",
          senhas.preview_app,
          senhas.preview_app,
          /senhas do migrador e do runtime precisam ser diferentes/,
        ],
      ])
        caso(`configuracao-${nome}-sem-roles`, () => {
          rejeicao(provisionar(nome, m, a), 3, mensagem);
          assert.equal(
            consultar(
              "roles-ausentes",
              "postgres",
              "select count(*) from pg_roles where rolname in ('preview_migrador','preview_app')",
            ),
            "0",
          );
        });
    }
    // No recorte restante esta execução é somente pré-requisito, não repete os testes verticais.
    sucesso(provisionar("provisionamento-inicial"));
    if (fase !== "restante") {
      caso("provisionamento-inicial-sql-real", () =>
        assert.equal(
          consultar(
            "senhas-scram",
            "postgres",
            "select count(*) from pg_authid where rolname in ('preview_migrador','preview_app') and rolpassword like 'SCRAM-SHA-256$%'",
          ),
          "2",
        ),
      );
      for (const u of [admin, "preview_migrador", "preview_app"])
        caso(`autenticacao-${u}`, () =>
          assert.equal(consultar(`autenticacao-${u}`, u, "select current_user"), u),
        );
      caso("senha-incorreta-recusada-scram", () =>
        rejeicao(
          psql("senha-incorreta", "preview_app", "select 1", senhas.incorreta),
          2,
          /28P01|password authentication failed/,
        ),
      );
      caso("runtime-escreve-vertical", () => {
        consultar(
          "tabela-vertical",
          "preview_migrador",
          "create table preview.vertical (id integer primary key, valor text)",
        );
        assert.equal(
          consultar(
            "dml-vertical",
            "preview_app",
            "insert into preview.vertical values (1,'vertical'); select id || ':' || valor from preview.vertical",
          ),
          "1:vertical",
        );
      });
      caso("runtime-nao-le-sentinela-alheia", () =>
        rejeicao(
          psql("alheio-vertical", "preview_app", "select * from producao_simulada.dados"),
          3,
          /42501/,
        ),
      );
    }
    if (fase !== "vertical") {
      caso("provisionamento-idempotente", () =>
        sucesso(provisionar("provisionamento-idempotente")),
      );
      caso("objetos-preview-e-schema-pr", () =>
        consultar(
          "criar-objetos",
          "preview_migrador",
          `create table preview.teste (id integer primary key, nome text);
create sequence preview.seq_teste; create function preview.funcao_teste() returns integer language sql as 'select 1';
create type preview.estado_teste as enum ('ATIVO','INATIVO'); create table preview.com_enum (estado preview.estado_teste);
grant usage on schema preview to public; grant select,insert,update,delete on preview.teste to public;
grant usage,select on sequence preview.seq_teste to public; grant execute on function preview.funcao_teste() to public;
grant usage on type preview.estado_teste to public;
create schema preview_pr_ensaio; create table preview_pr_ensaio.teste (id integer primary key, nome text);
create sequence preview_pr_ensaio.seq_teste; create function preview_pr_ensaio.funcao_teste() returns integer language sql as 'select 1';
create type preview_pr_ensaio.estado_teste as enum ('ATIVO','INATIVO'); grant usage on schema preview_pr_ensaio to preview_app;`,
        ),
      );
      caso("membership-indevida-introduzida", () =>
        consultar("membership-indevida", admin, `grant preview_app to ${admin}`),
      );
      caso("public-membership-revogados-verificador-real", () => {
        sucesso(provisionar("revogar-legados"));
        const relatorio = consultar("relatorio-sql-original", admin, sqlRelatorio);
        salvar(path.join(evidencia, "privilegios.json"), JSON.parse(relatorio));
        sucesso(
          executar(
            "verificador-real",
            "node",
            ["tests/apoio/privilegios-preview.mjs", "--exigir-membership"],
            {},
            relatorio,
          ),
        );
      });
      caso("runtime-dml-sequencias-funcoes-enums-pr", () => {
        assert.equal(
          consultar(
            "runtime-objetos",
            "preview_app",
            `insert into preview.teste values (1,'linha sintetica'),(2,'remover');
update preview.teste set nome='atualizada' where id=1; delete from preview.teste where id=2;
insert into preview.com_enum values ('ATIVO'); insert into preview_pr_ensaio.teste values (1,'linha do preview');
select 'dml=' || count(*) || ':' || min(nome) from preview.teste;
select 'enum=' || estado from preview.com_enum;
select 'pr=' || count(*) from preview_pr_ensaio.teste;
select 'seq=' || nextval('preview.seq_teste'); select 'seqpr=' || nextval('preview_pr_ensaio.seq_teste');
select 'func=' || preview.funcao_teste(); select 'funcpr=' || preview_pr_ensaio.funcao_teste();
select 'enumpr=' || 'ATIVO'::preview_pr_ensaio.estado_teste;`,
          ),
          "dml=1:atualizada\nenum=ATIVO\npr=1\nseq=1\nseqpr=1\nfunc=1\nfuncpr=1\nenumpr=ATIVO",
        );
      });
      caso("default-privileges-pr-sem-public", () =>
        assert.equal(
          consultar(
            "defaults-pr",
            "postgres",
            `select count(*) from (
select a.grantee from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a where n.nspname='preview_pr_ensaio'
union all select a.grantee from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='preview_pr_ensaio'::regnamespace
union all select a.grantee from pg_type t cross join lateral aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) a where t.typnamespace='preview_pr_ensaio'::regnamespace and t.typtype='e'
) x where grantee=0`,
          ),
          "0",
        ),
      );
      const negativas = [
        ["runtime-public", "preview_app", "select * from public.dado_producao"],
        ["runtime-ddl-tabela", "preview_app", "create table preview.proibida (id integer)"],
        ["runtime-ddl-schema", "preview_app", "create schema preview_proibido"],
        ["runtime-setrole", "preview_app", "set role preview_migrador"],
        ["migrador-alheio", "preview_migrador", "select * from producao_simulada.dados"],
        ["migrador-public", "preview_migrador", "select * from public.dado_producao"],
        ["migrador-setrole", "preview_migrador", "set role preview_app"],
      ];
      for (const [nome, u, sql] of negativas)
        caso(nome, () => rejeicao(psql(nome, u, sql), 3, /42501/));
      caso("migrador-novo-schema-pr", () =>
        consultar(
          "novo-schema-pr",
          "preview_migrador",
          "create schema preview_pr_novo; create table preview_pr_novo.teste (id integer primary key); grant usage on schema preview_pr_novo to preview_app",
        ),
      );
      caso("rollback-integral-inclusive-senhas", () => {
        consultar(
          "introduzir-terceiro-e-acls",
          "postgres",
          `create table preview.intrusa (id integer primary key);
grant usage on schema preview to public; grant select on preview.teste to public; grant truncate on preview.teste to preview_app;
alter default privileges for role preview_migrador grant select on tables to public; grant preview_app to ${admin};`,
        );
        const snapshot = `select jsonb_build_object(
'roles',(select jsonb_agg(to_jsonb(r) order by rolname) from pg_authid r where rolname in ('${admin}','preview_app','preview_migrador')),
'memberships',(select jsonb_agg(to_jsonb(a) order by roleid,member,grantor) from pg_auth_members a where a.roleid in (select oid from pg_roles where rolname in ('preview_app','preview_migrador')) or a.member in (select oid from pg_roles where rolname in ('preview_app','preview_migrador'))),
'rolesConfig',(select jsonb_agg(to_jsonb(s) order by setdatabase,setrole) from pg_db_role_setting s),
'schemas',(select jsonb_agg(jsonb_build_array(oid,nspname,nspowner,nspacl) order by nspname) from pg_namespace where nspname in ('public','producao_simulada') or nspname like 'preview%'),
'objetos',(select jsonb_agg(jsonb_build_array(c.oid,c.relnamespace,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','producao_simulada') or n.nspname like 'preview%'),
'funcoes',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosrc) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname like 'preview%'),
'tipos',(select jsonb_agg(jsonb_build_array(t.oid,t.typowner,t.typacl) order by t.oid) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname like 'preview%'),
'defaults',(select jsonb_agg(to_jsonb(d) order by oid) from pg_default_acl d),
'banco',(select jsonb_build_array(oid,datdba,datacl) from pg_database where datname=current_database()),
'dados',(select jsonb_agg(to_jsonb(t) order by id) from preview.teste t),
'alheio',(select jsonb_agg(to_jsonb(t) order by id) from producao_simulada.dados t),
'public',(select jsonb_agg(to_jsonb(t) order by id) from public.dado_producao t),
'sequencia',(select jsonb_build_array(last_value,is_called) from preview.seq_teste),
'sequenciaPR',(select jsonb_build_array(last_value,is_called) from preview_pr_ensaio.seq_teste));`;
        const antes = JSON.parse(consultar("snapshot-antes", "postgres", snapshot));
        salvar(path.join(evidencia, "rollback-antes.json"), antes);
        conferirRecusaIntrusa(
          provisionar("recusa-terceiro", senhas.preview_migrador, senhas.alternativa),
        );
        const depois = JSON.parse(consultar("snapshot-depois", "postgres", snapshot));
        salvar(path.join(evidencia, "rollback-depois.json"), depois);
        assert.deepEqual(depois, antes, "rollback lógico integral divergiu");
        assert.equal(
          consultar("senha-anterior-preservada", "preview_app", "select current_user"),
          "preview_app",
        );
        rejeicao(
          psql("senha-alternativa-recusada", "preview_app", "select 1", senhas.alternativa),
          2,
          /28P01|password authentication failed/,
        );
        consultar("remover-somente-intrusa", "postgres", "drop table preview.intrusa");
        sucesso(provisionar("provisionamento-apos-corrigir-objeto"));
        salvar(path.join(evidencia, "rollback.json"), {
          integral: true,
          antesSha256: hash(JSON.stringify(antes)),
          depoisSha256: hash(JSON.stringify(depois)),
          senhaAnterior: true,
          senhaAlternativaRecusada: true,
        });
      });
    }
  } catch (erro) {
    causa = erro;
    salvar(path.join(evidencia, "falha.json"), {
      nome: erro.name,
      mensagem: erro.message,
      stack: erro.stack,
      casos,
    });
  } finally {
    if (iniciado) {
      try {
        sucesso(executar("pg-stop", "pg_ctl", ["-D", pgdata, "-m", "fast", "-w", "stop"]));
      } catch (erro) {
        causa ??= erro;
      }
    }
  }
  salvar(path.join(evidencia, "resultado.json"), {
    rodada: manifesto.rodada,
    fase,
    casos,
    estado: causa ? "falhou" : "aprovado",
    fontes: manifesto.fontes,
  });
  await exportarRelatorios(evidencia, manifesto);
  if (causa) throw causa;
  process.stdout.write(
    JSON.stringify({
      tipo: "conclusao",
      rodada: manifesto.rodada,
      fase,
      casos,
      estado: "aprovado",
    }) + "\n",
  );
}
const direto =
  process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (direto)
  principal().catch((erro) => {
    process.stderr.write(`FALHOU: ${erro.message}\n`);
    process.exitCode = 1;
  });
