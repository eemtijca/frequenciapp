#!/usr/bin/env bash
# Ensaia em PostgreSQL 17 descartável o contrato de privilégios do schema de
# preview: roles separadas, PUBLIC revogado e falha fechada sem configuração.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BANCO="frequenciapp-preview-privilegios-$$"
ADMIN="preview_admin_ensaio"
SENHA_ADMIN="senha-sintetica-do-admin-do-ensaio-0000"
SENHA_MIGRADOR="senha-sintetica-do-migrador-do-ensaio-0001"
SENHA_APP="senha-sintetica-do-runtime-do-ensaio-0002"
SENHA_ALTERNATIVA="senha-sintetica-alternativa-do-ensaio-0003"
SENHA_INCORRETA="senha-sintetica-incorreta-do-ensaio-0004"
ARQUIVO_SQL="$RAIZ/scripts/banco/provisionar-preview.sql"

limpar() {
  docker rm -f "$BANCO" >/dev/null 2>&1 || true
}
trap 'limpar' EXIT

falhar() {
  printf 'FALHOU: %s\n' "$*" >&2
  exit 1
}

esperar_sucesso() {
  local descricao="$1"
  shift
  if ! "$@" >/dev/null 2>&1; then
    falhar "esperava sucesso: $descricao"
  fi
}

esperar_falha() {
  local descricao="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    falhar "esperava falha: $descricao"
  fi
}

psql_postgres() {
  docker exec "$BANCO" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc "$1"
}

psql_role() {
  local usuario="$1"
  local senha="$2"
  shift 2
  docker exec -i -e PGPASSWORD="$senha" "$BANCO" \
    psql -X -h 127.0.0.1 -U "$usuario" -d postgres -v ON_ERROR_STOP=1 "$@"
}

provisionar() {
  local env_migrador="$1"
  local env_app="$2"
  local argumentos=(-i -e "PGPASSWORD=$SENHA_ADMIN")
  if [ "$env_migrador" != "__AUSENTE__" ]; then
    argumentos+=(-e "PREVIEW_SENHA_MIGRADOR=$env_migrador")
  fi
  if [ "$env_app" != "__AUSENTE__" ]; then
    argumentos+=(-e "PREVIEW_SENHA_APP=$env_app")
  fi
  docker exec "${argumentos[@]}" "$BANCO" \
    psql -X -U "$ADMIN" -d postgres -v ON_ERROR_STOP=1 -f - <"$ARQUIVO_SQL"
}

gerar_relatorio() {
  docker exec -e PGPASSWORD="$SENHA_ADMIN" "$BANCO" psql -X -U "$ADMIN" -d postgres \
    -v ON_ERROR_STOP=1 -tAc "$(cat <<'SQL'
with
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
);
SQL
)"
}

# 1. PostgreSQL 17 descartável, sem portas publicadas e com credenciais sintéticas.
docker run -d --name "$BANCO" \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres \
  postgres:17-alpine >/dev/null

for _tentativa in $(seq 1 60); do
  if docker exec "$BANCO" psql -X -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$BANCO" psql -X -U postgres -d postgres -tAc 'select 1' >/dev/null 2>&1; then
  docker logs "$BANCO" >&2 || true
  falhar "o PostgreSQL descartável não ficou pronto."
fi

# O ensaio precisa provar a senha, não a confiança do socket local. As conexões
# TCP de 127.0.0.1 e ::1 passam a exigir scram-sha-256.
docker exec "$BANCO" sh -c \
  'sed -i -E "s#^(host[[:space:]]+all[[:space:]]+all[[:space:]]+(127\.0\.0\.1/32|::1/128)[[:space:]]+)trust#\1scram-sha-256#" "$PGDATA/pg_hba.conf"'
docker exec "$BANCO" psql -X -U postgres -d postgres -tAc 'select pg_reload_conf()' >/dev/null

# 2. Administrador sem superusuário, schema alheio e tabela no schema public.
docker exec -i "$BANCO" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -v senha_admin="$SENHA_ADMIN" <<'SQL' >/dev/null
create role preview_admin_ensaio login createrole password :'senha_admin';
alter database postgres owner to preview_admin_ensaio;
alter schema public owner to preview_admin_ensaio;
create schema producao_simulada;
create table producao_simulada.dados (id integer primary key, segredo text);
insert into producao_simulada.dados values (1, 'dado sintetico de producao');
create table public.dado_producao (id integer primary key, segredo text);
insert into public.dado_producao values (1, 'dado sintetico de public');
create schema preview;
alter schema preview owner to preview_admin_ensaio;
SQL

# 3. Configuração incompleta precisa falhar antes de criar qualquer role.
esperar_falha "senha do migrador ausente" provisionar "__AUSENTE__" "$SENHA_APP"
esperar_falha "senha do migrador curta" provisionar "curta" "$SENHA_APP"
esperar_falha "senhas iguais" provisionar "$SENHA_APP" "$SENHA_APP"
[ "$(psql_postgres "select count(*) from pg_roles where rolname in ('preview_migrador', 'preview_app')")" = "0" ] ||
  falhar "as execuções inválidas criaram roles de preview."

# 4. Provisionamento válido e reexecução idempotente.
esperar_sucesso "provisionamento inicial" provisionar "$SENHA_MIGRADOR" "$SENHA_APP"
esperar_sucesso "reexecução do provisionamento" provisionar "$SENHA_MIGRADOR" "$SENHA_APP"

# 5. Autenticação das três roles e recusa da senha incorreta.
[ "$(psql_role "$ADMIN" "$SENHA_ADMIN" -tAc 'select current_user')" = "$ADMIN" ] ||
  falhar "o administrador do ensaio não autenticou."
[ "$(psql_role preview_migrador "$SENHA_MIGRADOR" -tAc 'select current_user')" = "preview_migrador" ] ||
  falhar "o migrador não autenticou com a senha fornecida."
[ "$(psql_role preview_app "$SENHA_APP" -tAc 'select current_user')" = "preview_app" ] ||
  falhar "o runtime não autenticou com a senha fornecida."
esperar_falha "senha incorreta do runtime" \
  psql_role preview_app "$SENHA_INCORRETA" -tAc 'select 1'

# 6. Objetos do preview e grants legados de PUBLIC, além de membership indevida.
esperar_sucesso "migrador cria objetos do preview" psql_role preview_migrador "$SENHA_MIGRADOR" <<'SQL'
create table preview.teste (id integer primary key, nome text);
create sequence preview.seq_teste;
create function preview.funcao_teste() returns integer language sql as 'select 1';
create type preview.estado_teste as enum ('ATIVO', 'INATIVO');
create table preview.com_enum (estado preview.estado_teste);
grant usage on schema preview to public;
grant select, insert, update, delete on preview.teste to public;
grant usage, select on sequence preview.seq_teste to public;
grant execute on function preview.funcao_teste() to public;
grant usage on type preview.estado_teste to public;
create schema preview_pr_ensaio;
create table preview_pr_ensaio.teste (id integer primary key, nome text);
create sequence preview_pr_ensaio.seq_teste;
create function preview_pr_ensaio.funcao_teste() returns integer language sql as 'select 1';
create type preview_pr_ensaio.estado_teste as enum ('ATIVO', 'INATIVO');
grant usage on schema preview_pr_ensaio to preview_app;
SQL

esperar_sucesso "administrador cria membership indevida" \
  psql_role "$ADMIN" "$SENHA_ADMIN" -tAc 'grant preview_app to preview_admin_ensaio'

# 7. A reexecução revoga PUBLIC, remove a membership indevida e mantém o contrato.
esperar_sucesso "provisionamento após grants legados" provisionar "$SENHA_MIGRADOR" "$SENHA_APP"

command -v node >/dev/null 2>&1 || falhar "node é necessário para conferir o relatório de privilégios."
relatorio="$(gerar_relatorio)"
if ! printf '%s\n' "$relatorio" | node "$RAIZ/tests/apoio/privilegios-preview.mjs" \
  --exigir-membership; then
  falhar "o relatório de privilégios divergiu do contrato."
fi

# 8. Runtime: DML no preview, sequência, função, enum e schema por pull request.
esperar_sucesso "runtime usa tabela, sequence, função e enum" psql_role preview_app "$SENHA_APP" <<'SQL'
insert into preview.teste values (1, 'linha sintetica');
insert into preview.com_enum values ('ATIVO');
insert into preview_pr_ensaio.teste values (1, 'linha do preview');
select count(*) from preview.teste;
select nextval('preview.seq_teste');
select nextval('preview_pr_ensaio.seq_teste');
select preview.funcao_teste();
select preview_pr_ensaio.funcao_teste();
SQL

# 9. Runtime não alcança schema alheio nem cria objetos.
esperar_falha "runtime lê schema alheio" \
  psql_role preview_app "$SENHA_APP" -tAc 'select * from producao_simulada.dados'
esperar_falha "runtime lê tabela do schema public" \
  psql_role preview_app "$SENHA_APP" -tAc 'select * from public.dado_producao'
esperar_falha "runtime cria tabela no preview" \
  psql_role preview_app "$SENHA_APP" -tAc 'create table preview.proibida (id integer)'
esperar_falha "runtime cria schema" \
  psql_role preview_app "$SENHA_APP" -tAc 'create schema preview_proibido'
esperar_falha "runtime assume a role de migração" \
  psql_role preview_app "$SENHA_APP" -tAc 'set role preview_migrador'

# 10. Migrador: cria schema por pull request e não alcança o schema alheio.
esperar_sucesso "migrador cria schema por pull request" psql_role preview_migrador "$SENHA_MIGRADOR" -tAc \
  "create schema preview_pr_novo; create table preview_pr_novo.teste (id integer primary key); grant usage on schema preview_pr_novo to preview_app"
esperar_falha "migrador lê schema alheio" \
  psql_role preview_migrador "$SENHA_MIGRADOR" -tAc 'select * from producao_simulada.dados'
esperar_falha "migrador lê tabela do schema public" \
  psql_role preview_migrador "$SENHA_MIGRADOR" -tAc 'select * from public.dado_producao'
esperar_falha "migrador assume a role de runtime" \
  psql_role preview_migrador "$SENHA_MIGRADOR" -tAc 'set role preview_app'

# 11. Objeto de terceiro no preview falha fechado e a transação é revertida.
psql_postgres 'create table preview.intrusa (id integer primary key)' >/dev/null
esperar_falha "provisionamento recusa objeto de terceiro" \
  provisionar "$SENHA_MIGRADOR" "$SENHA_ALTERNATIVA"
[ "$(psql_role preview_app "$SENHA_APP" -tAc 'select current_user')" = "preview_app" ] ||
  falhar "a senha anterior do runtime não foi restaurada após a falha."
esperar_falha "senha alternativa não foi aplicada" \
  psql_role preview_app "$SENHA_ALTERNATIVA" -tAc 'select 1'
psql_postgres 'drop table preview.intrusa' >/dev/null
esperar_sucesso "provisionamento após corrigir o objeto" provisionar "$SENHA_MIGRADOR" "$SENHA_APP"

printf 'Ensaio de privilégios do preview concluído.\n'
