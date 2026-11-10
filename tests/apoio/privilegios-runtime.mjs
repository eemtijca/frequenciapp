// Ensaio PostgreSQL preparado para rodada exclusiva; a guarda precede conexão e DDL.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { verificarIsolamento } from "../helpers/isolamento.mjs";

const prova = await verificarIsolamento();
const id = randomBytes(8).toString("hex");
const runtime = `qa_app_${id}`,
  migrador = `qa_owner_${id}`,
  grupo = `qa_grupo_${id}`;
const schema = `qa_app_${id}`,
  canario = `qa_canario_${id}`;
const senha = randomBytes(24).toString("hex");
const ident = (s) => `"${s.replaceAll('"', '""')}"`;
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const admin = new pg.Client({ connectionString: prova.databaseUrl });
const sessoes = [];
const roles = [];
const schemas = [];
const recusados = [];
const negar = async (cliente, sql) => {
  await assert.rejects(cliente.query(sql), (e) => e.code === "42501");
};
try {
  await admin.connect();
  for (const papel of [runtime, migrador, grupo]) {
    await admin.query(
      `create role ${ident(papel)} ${papel === grupo ? "nologin" : `login password ${literal(senha)}`} inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
    );
    roles.push(papel);
  }
  await admin.query(`create schema ${ident(schema)} authorization ${ident(migrador)}`);
  schemas.push(schema);
  await admin.query(`create schema ${ident(canario)}`);
  schemas.push(canario);
  // Alterações em PUBLIC são exclusivas desta rodada sintética, não parte do provisionador.
  await admin.query(`revoke usage on schema public from public`);
  await admin.query(
    `revoke temporary on database ${ident(new URL(prova.databaseUrl).pathname.slice(1))} from public`,
  );
  await admin.query(`create table ${ident(schema)}._prisma_migrations (id int)`);
  await admin.query(`alter table ${ident(schema)}._prisma_migrations owner to ${ident(migrador)}`);
  await admin.query(`set role ${ident(migrador)}`);
  await admin.query(`create type ${ident(schema)}.estado_anterior as enum ('ativo')`);
  await admin.query(
    `create table ${ident(schema)}.dados_anteriores (id serial primary key, estado ${ident(schema)}.estado_anterior not null)`,
  );
  await admin.query(
    `create function ${ident(schema)}.restrita_anterior() returns int language sql as 'select 1'`,
  );
  await admin.query("reset role");
  await admin.query(`create table ${ident(canario)}.segredo (id int)`);
  await admin.query(`grant usage on schema ${ident(canario)} to public`);
  await admin.query(`grant select on ${ident(canario)}.segredo to public`);
  let sql = readFileSync("scripts/banco/provisionar-runtime.sql", "utf8").replace(
    /^\\set.*$/gm,
    "",
  );
  for (const [chave, valor] of Object.entries({
    app_schema: schema,
    papel_runtime: runtime,
    papel_migracao: migrador,
  }))
    sql = sql.replaceAll(`:'${chave}'`, literal(valor));
  const recusar = async (mensagem) => {
    try {
      await assert.rejects(admin.query(sql), (e) => e.code === "P0001" && mensagem.test(e.message));
    } finally {
      await admin.query("rollback");
    }
  };
  await recusar(/schema externo/);
  await admin.query(`revoke usage on schema ${ident(canario)} from public`);

  // Os papéis já existem ao provisionar. As capacidades são conferidas pelo PostgreSQL,
  // nunca por um interpretador local do SQL ou somente por texto de erro.
  for (const destinatario of [runtime, "public"]) {
    const alvo = destinatario === "public" ? "public" : ident(destinatario);
    try {
      await admin.query(`grant create on schema ${ident(canario)} to ${alvo}`);
      const { rows } = await admin.query(
        "select has_schema_privilege($1, $2, 'CREATE') as cria, has_schema_privilege($1, $2, 'USAGE') as usa",
        [runtime, canario],
      );
      assert.deepEqual(rows, [{ cria: true, usa: false }]);
      await recusar(/CREATE efetivo/);
      recusados.push(`create_externo_sem_usage_${destinatario === "public" ? "public" : "direto"}`);
    } finally {
      await admin.query(`revoke create on schema ${ident(canario)} from ${alvo}`);
    }
  }
  try {
    await admin.query(`grant create on schema ${ident(schema)} to ${ident(runtime)}`);
    await recusar(/CREATE efetivo/);
    recusados.push("create_schema_alvo");
  } finally {
    await admin.query(`revoke create on schema ${ident(schema)} from ${ident(runtime)}`);
  }
  for (const herda of [true, false]) {
    try {
      await admin.query(`grant create on schema ${ident(canario)} to ${ident(grupo)}`);
      await admin.query(
        `grant ${ident(grupo)} to ${ident(runtime)} with inherit ${herda}, set true`,
      );
      const { rows } = await admin.query(
        "select pg_has_role($1, $2, 'MEMBER') as membro, pg_has_role($1, $2, 'SET') as assume, has_schema_privilege($1, $3, 'CREATE') as cria, has_schema_privilege($1, $3, 'USAGE') as usa",
        [runtime, grupo, canario],
      );
      assert.deepEqual(rows, [{ membro: true, assume: true, cria: herda, usa: false }]);
      await recusar(/Membership exige auditoria/);
      recusados.push(herda ? "membership_herdada" : "membership_set_role");
    } finally {
      await admin.query(`revoke ${ident(grupo)} from ${ident(runtime)}`);
      await admin.query(`revoke create on schema ${ident(canario)} from ${ident(grupo)}`);
    }
  }
  const objetos = [
    {
      classe: "funcao",
      criar: "function preexistente() returns int language sql as 'select 1'",
      catalogo: "pg_proc",
      dono: "proowner",
      namespace: "pronamespace",
      nome: "proname",
      remover: "function preexistente()",
    },
    {
      classe: "tipo",
      criar: "type preexistente as enum ('ativo')",
      catalogo: "pg_type",
      dono: "typowner",
      namespace: "typnamespace",
      nome: "typname",
      remover: "type preexistente",
    },
    {
      classe: "relacao",
      criar: "table preexistente (id int)",
      catalogo: "pg_class",
      dono: "relowner",
      namespace: "relnamespace",
      nome: "relname",
      remover: "table preexistente",
    },
  ];
  for (const espaco of [schema, canario]) {
    for (const objeto of objetos) {
      const qualificar = (comando) =>
        comando.replace("preexistente", `${ident(espaco)}.preexistente`);
      try {
        await admin.query(`grant usage, create on schema ${ident(espaco)} to ${ident(runtime)}`);
        await admin.query(`set role ${ident(runtime)}`);
        await admin.query(`create ${qualificar(objeto.criar)}`);
        await admin.query("reset role");
        await admin.query(`revoke usage, create on schema ${ident(espaco)} from ${ident(runtime)}`);
        const { rows } = await admin.query(
          `select o.${objeto.dono} = r.oid as dono, has_schema_privilege(r.oid, n.oid, 'CREATE') as cria from ${objeto.catalogo} o join pg_namespace n on n.oid = o.${objeto.namespace} join pg_roles r on r.rolname = $1 where n.nspname = $2 and o.${objeto.nome} = 'preexistente'`,
          [runtime, espaco],
        );
        assert.deepEqual(rows, [{ dono: true, cria: false }]);
        await recusar(/Runtime não pode ser owner/);
        recusados.push(`owner_${objeto.classe}_${espaco === schema ? "alvo" : "externo"}`);
      } finally {
        await admin.query("reset role");
        await admin.query(`drop ${qualificar(objeto.remover)}`);
        await admin.query(`revoke usage, create on schema ${ident(espaco)} from ${ident(runtime)}`);
      }
    }
  }

  // Controle bom: papéis preexistentes sem DDL, objetos antigos do migrador e reaplicação.
  await admin.query(sql);
  await admin.query(sql);
  const abrir = async (papel) => {
    const url = new URL(prova.databaseUrl);
    url.username = papel;
    url.password = senha;
    const cliente = new pg.Client({ connectionString: url.href });
    sessoes.push(cliente);
    await cliente.connect();
    return cliente;
  };
  const owner = await abrir(migrador);
  const app = await abrir(runtime);
  await owner.query(`create type ${ident(schema)}.estado as enum ('ativo')`);
  await owner.query(
    `create table ${ident(schema)}.dados (id serial primary key, estado ${ident(schema)}.estado not null)`,
  );
  await owner.query(
    `create function ${ident(schema)}.restrita() returns int language sql as 'select 1'`,
  );
  for (const tabela of ["dados_anteriores", "dados"]) {
    await app.query(`insert into ${ident(schema)}.${tabela} (estado) values ('ativo')`);
    assert.equal(
      (await app.query(`select count(*)::int as n from ${ident(schema)}.${tabela}`)).rows[0].n,
      1,
    );
    await app.query(`update ${ident(schema)}.${tabela} set estado='ativo'`);
    await app.query(`select nextval('${schema}.${tabela}_id_seq')`);
    await app.query(`delete from ${ident(schema)}.${tabela}`);
  }
  await app.query("select 1");
  for (const comando of [
    `create table ${ident(schema)}.indevida (id int)`,
    `create table ${ident(canario)}.indevida (id int)`,
    `create temp table indevida (id int)`,
    `create type ${ident(schema)}.indevido as enum ('ativo')`,
    `create function ${ident(schema)}.indevida() returns int language sql as 'select 1'`,
    `alter table ${ident(schema)}.dados add column indevida int`,
    `drop table ${ident(schema)}.dados`,
    `alter type ${ident(schema)}.estado add value 'indevido'`,
    `alter function ${ident(schema)}.restrita() rename to indevida`,
    `drop function ${ident(schema)}.restrita()`,
    `set role ${ident(migrador)}`,
    `create role qa_indevida_${id}`,
    `select * from ${ident(canario)}.segredo`,
    `select ${ident(schema)}.restrita()`,
    `select ${ident(schema)}.restrita_anterior()`,
    `select * from ${ident(schema)}._prisma_migrations`,
  ])
    await negar(app, comando);
  process.stdout.write(
    JSON.stringify({
      tipo: "sintetico_postgresql",
      recusados,
      runtimeDml: true,
      runtimeDdl: false,
      assumeMigrador: false,
      canarioExterno: false,
      objetosAnteriores: true,
      objetosNovos: true,
      reaplicacao: true,
    }) + "\n",
  );
} finally {
  for (const sessao of sessoes) await sessao.end();
  await admin.query("rollback");
  await admin.query("reset role");
  // Somente nomes aleatórios criados e registrados nesta rodada exclusiva.
  for (const nome of schemas.reverse()) await admin.query(`drop schema ${ident(nome)} cascade`);
  for (const papel of roles.reverse()) {
    await admin.query(`drop owned by ${ident(papel)}`);
    await admin.query(`drop role ${ident(papel)}`);
  }
  await admin.end();
}
