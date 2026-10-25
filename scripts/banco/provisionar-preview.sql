-- FrequenciApp: provisionamento do schema de preview no mesmo banco.
-- Idempotente: cria as roles se faltarem, preserva senhas existentes e
-- reaplica apenas grants e default privileges. Não toca em dados de produção.

-- 1. Roles de preview: cria se faltar e garante LOGIN se existir.
--    Substitua as duas senhas antes de executar. Evite aspas simples; se
--    houver, duplique-as.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'preview_migrador') then
    execute format('create role preview_migrador login password %L', 'senha-forte-do-migrador');
  else
    execute 'alter role preview_migrador login';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'preview_app') then
    execute format('create role preview_app login password %L', 'senha-forte-do-app');
  else
    execute 'alter role preview_app login';
  end if;
end
$$;

-- 2. Membership do papel atual sobre o migrador. O PostgreSQL exige ser membro
--    do papel para definir default privileges dele (erro 42501 sem isso).
do $$
begin
  execute format('grant preview_migrador to %I', current_user);
end
$$;

-- 3. Schema de preview e permissões básicas.
create schema if not exists preview;
grant usage, create on schema preview to preview_migrador;
grant usage on schema preview to preview_app;

-- 4. Conexão e criação de schemas futuros pelo migrador.
do $$
begin
  execute format('grant connect, create on database %I to preview_migrador', current_database());
  execute format('grant connect on database %I to preview_app', current_database());
end
$$;

-- 5. Default privileges: o que o migrador criar no schema preview já nasce
--    acessível ao runtime, inclusive os tipos criados pelas migrações.
alter default privileges for role preview_migrador in schema preview
  grant select, insert, update, delete on tables to preview_app;
alter default privileges for role preview_migrador in schema preview
  grant usage, select on sequences to preview_app;
alter default privileges for role preview_migrador in schema preview
  grant usage on types to preview_app;

-- 6. Defesa em profundidade: nega o schema public às roles de preview.
--    Se o USAGE vier de PUBLIC, o PostgreSQL apenas avisa; não revogar de
--    PUBLIC para não afetar produção.
do $$
begin
  execute 'revoke usage, create on schema public from preview_migrador, preview_app';
exception
  when insufficient_privilege then
    raise notice 'Sem privilégio para revogar em public; os grants de tabela seguem como proteção.';
end
$$;

-- 7. Conferência.
select rolname, rolcanlogin
  from pg_roles
 where rolname in ('preview_app', 'preview_migrador')
 order by rolname;

select nspname,
       pg_get_userbyid(nspowner) as dono,
       has_schema_privilege('preview_migrador', 'preview', 'CREATE') as migrador_cria,
       has_schema_privilege('preview_app', 'preview', 'USAGE') as app_usa
  from pg_namespace
 where nspname = 'preview';

select defaclrole::regrole as papel,
       defaclnamespace::regnamespace as schema,
       defaclobjtype as tipo,
       defaclacl as privilegios
  from pg_default_acl
 where defaclrole = 'preview_migrador'::regrole;
