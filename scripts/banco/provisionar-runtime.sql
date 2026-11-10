-- Provisiona DML no schema exclusivo de um owner dedicado, sem criar logins ou senhas.
-- Executar com psql -v ON_ERROR_STOP=1 -v app_schema=... -v papel_runtime=... -v papel_migracao=...
\set ON_ERROR_STOP on
begin;
select set_config('frequenciapp.schema', :'app_schema', true);
select set_config('frequenciapp.runtime', :'papel_runtime', true);
select set_config('frequenciapp.migrador', :'papel_migracao', true);
do $$
declare
  esquema text := current_setting('frequenciapp.schema');
  runtime text := current_setting('frequenciapp.runtime');
  migrador text := current_setting('frequenciapp.migrador');
  r pg_roles;
  m pg_roles;
  objeto record;
begin
  if esquema !~ '^[a-z_][a-z0-9_]{0,62}$' or esquema in ('public', 'information_schema') or esquema like 'pg_%' or runtime = migrador then
    raise exception 'Exigir schema exclusivo e papéis distintos.';
  end if;
  select * into strict r from pg_roles where rolname = runtime;
  select * into strict m from pg_roles where rolname = migrador;
  if r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls or
     m.rolsuper or m.rolcreatedb or m.rolcreaterole or m.rolreplication or m.rolbypassrls then
    raise exception 'Os papéis não podem ter atributos administrativos.';
  end if;
  if exists (select 1 from pg_roles p where p.oid <> r.oid and pg_has_role(r.oid, p.oid, 'MEMBER')) or
     exists (select 1 from pg_roles p where p.oid <> m.oid and pg_has_role(m.oid, p.oid, 'MEMBER')) then
    raise exception 'Membership exige auditoria; não é concedida nem removida implicitamente.';
  end if;
  if has_database_privilege(runtime, current_database(), 'CREATE') or
     has_database_privilege(runtime, current_database(), 'TEMP') then
    raise exception 'Privilégios efetivos de CREATE ou TEMP impedem o contrato de runtime. Rever PUBLIC em banco dedicado.';
  end if;
  -- CREATE não exige USAGE; conferir separadamente inclusive schemas de sistema.
  if exists (select 1 from pg_namespace n where has_schema_privilege(runtime, n.oid, 'CREATE') or
      (n.nspname <> esquema and n.nspname <> 'information_schema' and n.nspname !~ '^pg_'
       and has_schema_privilege(runtime, n.oid, 'USAGE'))) then
    raise exception 'CREATE efetivo ou acesso a schema externo exige inventário e decisão operacional.';
  end if;
  -- Ownership permite DDL mesmo sem ACL: inclui funções, tipos e demais classes,
  -- não apenas relações. Considera objetos compartilhados e os deste banco.
  if exists (select 1 from pg_shdepend d where d.refclassid = 'pg_authid'::regclass
      and d.refobjid = r.oid and d.deptype = 'o'
      and (d.dbid = 0 or d.dbid = (select oid from pg_database where datname = current_database()))) then
    raise exception 'Runtime não pode ser owner de objetos.';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relowner=m.oid and n.nspname<>esquema and n.nspname!~'^pg_') or
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proowner=m.oid and n.nspname<>esquema and n.nspname!~'^pg_') or
     exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
      where t.typowner=m.oid and n.nspname<>esquema and n.nspname!~'^pg_') or
     exists (select 1 from pg_namespace n
      where n.nspowner=m.oid and n.nspname<>esquema and n.nspname<>'information_schema' and n.nspname!~'^pg_') then
    raise exception 'O owner de migração precisa ser dedicado a este schema.';
  end if;
  if exists (select 1 from pg_namespace where nspname=esquema and nspowner<>m.oid) then
    raise exception 'Schema existente pertence a outro papel; nenhuma transferência automática.';
  end if;
  execute format('create schema if not exists %I authorization %I', esquema, migrador);
  if has_schema_privilege(runtime, esquema, 'CREATE') or
     exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=esquema and c.relowner=r.oid) then
    raise exception 'Runtime não pode ser owner nem criar objetos.';
  end if;
  if to_regclass(format('%I._prisma_migrations', esquema)) is null then
    raise exception 'Aplicar as migrações iniciais com o owner antes de provisionar o runtime.';
  end if;
  execute format('grant usage on schema %I to %I', esquema, runtime);
  execute format('revoke all privileges on all tables in schema %I from %I', esquema, runtime);
  execute format('revoke all privileges on all sequences in schema %I from %I', esquema, runtime);
  execute format('revoke all privileges on all functions in schema %I from %I', esquema, runtime);
  execute format('grant select, insert, update, delete on all tables in schema %I to %I', esquema, runtime);
  execute format('grant usage, select on all sequences in schema %I to %I', esquema, runtime);
  for objeto in select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname=esquema and t.typtype in ('e','d','r','m') loop
    execute format('revoke all privileges on type %I.%I from %I', esquema, objeto.typname, runtime);
    execute format('grant usage on type %I.%I to %I', esquema, objeto.typname, runtime);
  end loop;
  execute format('revoke execute on all functions in schema %I from public', esquema);
  -- O owner é exclusivo: remove o default global dele, não o de outros owners ou schemas.
  execute format('alter default privileges for role %I revoke execute on functions from public', migrador);
  execute format('alter default privileges for role %I in schema %I grant select, insert, update, delete on tables to %I', migrador, esquema, runtime);
  execute format('alter default privileges for role %I in schema %I grant usage, select on sequences to %I', migrador, esquema, runtime);
  execute format('alter default privileges for role %I in schema %I grant usage on types to %I', migrador, esquema, runtime);
  if to_regclass(format('%I._prisma_migrations', esquema)) is not null then
    execute format('revoke all privileges on table %I._prisma_migrations from %I', esquema, runtime);
  end if;
end
$$;
commit;
