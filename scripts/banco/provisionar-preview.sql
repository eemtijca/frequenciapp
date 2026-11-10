-- FrequenciApp: provisiona as roles e o schema de preview com privilégios mínimos.
-- Senhas vêm do ambiente, PUBLIC é revogado e o script falha fechado se o contrato
-- de privilégios não puder ser comprovado. Exige um papel administrativo com
-- CREATEROLE e poder de revogar privilégios no schema public.
\set ON_ERROR_STOP on

-- 1. Segredos fora do repositório. O comprimento mínimo também rejeita as
--    senhas curtas que versões anteriores deste arquivo documentavam.
\unset preview_senha_migrador
\unset preview_senha_app
\getenv preview_senha_migrador PREVIEW_SENHA_MIGRADOR
\getenv preview_senha_app PREVIEW_SENHA_APP

\if :{?preview_senha_migrador}
\else
  do $$ begin raise exception 'Defina PREVIEW_SENHA_MIGRADOR no ambiente antes de provisionar o preview.'; end $$;
\endif
\if :{?preview_senha_app}
\else
  do $$ begin raise exception 'Defina PREVIEW_SENHA_APP no ambiente antes de provisionar o preview.'; end $$;
\endif

select length(:'preview_senha_migrador') >= 32 as preview_senha_migrador_valida,
       length(:'preview_senha_app') >= 32 as preview_senha_app_valida,
       :'preview_senha_migrador' <> :'preview_senha_app' as preview_senhas_distintas
\gset

\if :preview_senha_migrador_valida
\else
  do $$ begin raise exception 'PREVIEW_SENHA_MIGRADOR precisa ter pelo menos 32 caracteres.'; end $$;
\endif
\if :preview_senha_app_valida
\else
  do $$ begin raise exception 'PREVIEW_SENHA_APP precisa ter pelo menos 32 caracteres.'; end $$;
\endif
\if :preview_senhas_distintas
\else
  do $$ begin raise exception 'As senhas do migrador e do runtime precisam ser diferentes.'; end $$;
\endif

select (select rolsuper from pg_roles where rolname = current_user) as preview_admin_superusuario
\gset

begin;

-- 2. Roles separadas: o migrador cria e altera objetos; o runtime apenas lê e
--    grava dados. Nenhuma das duas herda privilégios de outras roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'preview_migrador') then
    create role preview_migrador;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'preview_app') then
    create role preview_app;
  end if;
end
$$;

\if :preview_admin_superusuario
alter role preview_migrador
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  password :'preview_senha_migrador';
alter role preview_app
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  password :'preview_senha_app';
\else
-- Um papel com CREATEROLE não pode alterar SUPERUSER, CREATEDB, REPLICATION
-- nem BYPASSRLS, mesmo para negá-los. A conferência final reprova a
-- configuração se qualquer um deles estiver ativo.
alter role preview_migrador
  login noinherit
  password :'preview_senha_migrador';
alter role preview_app
  login noinherit
  password :'preview_senha_app';
\endif

-- 3. O administrador precisa poder agir como migrador para definir os default
--    privileges. A membership é mantida com INHERIT FALSE e SET TRUE: ela não
--    concede privilégios automáticos ao administrador, mas permite a reexecução
--    idempotente. Superusuário não recebe membership.
do $$
begin
  if current_user::regrole in ('preview_migrador'::regrole, 'preview_app'::regrole) then
    raise exception 'O provisionamento não pode ser executado por uma role de preview.';
  end if;
  if not (select rolsuper from pg_roles where rolname = current_user) then
    if not (select rolcreaterole from pg_roles where rolname = current_user) then
      raise exception 'O provisionamento exige um papel com CREATEROLE ou superusuário.';
    end if;
    execute format('grant preview_migrador to %I with inherit false, set true', current_user);
  end if;
end
$$;

-- 4. O schema pertence ao migrador, não ao runtime e não a PUBLIC. Se ele já
--    existir, a transferência de dono acontece como administrador; um schema
--    de terceiros faz o provisionamento falhar em vez de seguir sem controle.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'preview') then
    execute 'create schema preview';
  end if;
  if exists (
    select 1 from pg_namespace
     where nspname = 'preview' and nspowner <> 'preview_migrador'::regrole
  ) then
    execute 'alter schema preview owner to preview_migrador';
  end if;
end
$$;

-- 5. O runtime precisa conectar, mas não pode criar schemas. O migrador cria
--    schema por pull request e mantém o necessário para aplicar migrações.
do $$
begin
  execute format('grant connect, create on database %I to preview_migrador', current_database());
  execute format('grant connect on database %I to preview_app', current_database());
  execute format('revoke create on database %I from preview_app', current_database());
end
$$;

do $$
begin
  execute 'revoke usage, create on schema public from preview_migrador, preview_app';
exception
  when insufficient_privilege then
    raise exception 'Não foi possível revogar privilégios diretos das roles de preview no schema public.';
end
$$;

-- 6. A partir daqui as operações rodam como migrador, dono do schema. Isso
--    permite revogar PUBLIC e conceder o runtime sem depender de superusuário.
set local role preview_migrador;

revoke all on schema preview from public;
revoke all on schema preview from preview_app;
grant usage on schema preview to preview_app;

-- 7. Objetos já existentes no preview perdem os grants de PUBLIC e do runtime
--    antes de receberem apenas o necessário. Views e tabelas estrangeiras entram
--    em ALL TABLES; rotinas incluem funções e procedimentos.
revoke all on all tables in schema preview from public;
revoke all on all tables in schema preview from preview_app;
grant select, insert, update, delete on all tables in schema preview to preview_app;

revoke all on all sequences in schema preview from public;
revoke all on all sequences in schema preview from preview_app;
grant usage, select on all sequences in schema preview to preview_app;

revoke all on all routines in schema preview from public;
revoke all on all routines in schema preview from preview_app;
grant execute on all routines in schema preview to preview_app;

do $$
declare
  tipo record;
begin
  for tipo in
    select format('%I.%I', n.nspname, t.typname) as nome
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'preview'
       and t.typtype in ('e', 'd')
  loop
    execute format('revoke all on type %s from public', tipo.nome);
    execute format('revoke all on type %s from preview_app', tipo.nome);
    execute format('grant usage on type %s to preview_app', tipo.nome);
  end loop;
end
$$;

-- 8. Default privileges globais do migrador: qualquer objeto futuro, inclusive
--    os schemas preview_pr_<numero>, nasce sem PUBLIC e com os grants do runtime.
alter default privileges for role preview_migrador revoke all on tables from public;
alter default privileges for role preview_migrador revoke all on sequences from public;
alter default privileges for role preview_migrador revoke all on routines from public;
alter default privileges for role preview_migrador revoke all on types from public;

alter default privileges for role preview_migrador
  grant select, insert, update, delete on tables to preview_app;
alter default privileges for role preview_migrador
  grant usage, select on sequences to preview_app;
alter default privileges for role preview_migrador
  grant execute on routines to preview_app;
alter default privileges for role preview_migrador
  grant usage on types to preview_app;

reset role;

-- 9. Remove vínculos indevidos: as roles de preview não podem ser membros de
--    outras roles nem servir de grupo para outras roles. A única exceção é a
--    membership administrativa em preview_migrador, sem herança automática,
--    necessária para reaplicar default privileges em uma nova execução.
do $$
declare
  vinculo record;
begin
  for vinculo in
    select r.rolname as papel, m.rolname as membro
      from pg_auth_members a
      join pg_roles r on r.oid = a.roleid
      join pg_roles m on m.oid = a.member
     where m.rolname in ('preview_migrador', 'preview_app')
        or (r.rolname in ('preview_migrador', 'preview_app')
            and (m.rolname <> current_user
                 or (select rolsuper from pg_roles where rolname = current_user)
                 or a.inherit_option
                 or (r.rolname = 'preview_app' and a.set_option)))
  loop
    execute format('revoke %I from %I', vinculo.papel, vinculo.membro);
  end loop;
end
$$;

-- 10. Conferência efetiva. Qualquer divergência aborta a transação inteira.
do $$
declare
  falhas text[] := array[]::text[];
  papel record;
  tabela record;
  sequencia record;
  rotina record;
  tipo record;
  total integer;
begin
  if (select count(*) from pg_roles where rolname in ('preview_migrador', 'preview_app')) <> 2 then
    falhas := array_append(falhas, 'as duas roles de preview precisam existir');
  end if;

  for papel in
    select * from pg_roles where rolname in ('preview_migrador', 'preview_app')
  loop
    if not papel.rolcanlogin then
      falhas := array_append(falhas, format('%s precisa de LOGIN', papel.rolname));
    end if;
    if papel.rolsuper then
      falhas := array_append(falhas, format('%s não pode ser SUPERUSER', papel.rolname));
    end if;
    if papel.rolcreatedb then
      falhas := array_append(falhas, format('%s não pode ser CREATEDB', papel.rolname));
    end if;
    if papel.rolcreaterole then
      falhas := array_append(falhas, format('%s não pode ser CREATEROLE', papel.rolname));
    end if;
    if papel.rolreplication then
      falhas := array_append(falhas, format('%s não pode ser REPLICATION', papel.rolname));
    end if;
    if papel.rolbypassrls then
      falhas := array_append(falhas, format('%s não pode ser BYPASSRLS', papel.rolname));
    end if;
    if papel.rolinherit then
      falhas := array_append(falhas, format('%s precisa ser NOINHERIT', papel.rolname));
    end if;
  end loop;

  if exists (
    select 1
      from pg_auth_members a
      join pg_roles m on m.oid = a.member
     where m.rolname in ('preview_migrador', 'preview_app')
  ) then
    falhas := array_append(falhas, 'as roles de preview não podem ser membros de outras roles');
  end if;

  select count(*) into total
    from pg_auth_members a
    join pg_roles r on r.oid = a.roleid
   where r.rolname in ('preview_migrador', 'preview_app');

  if (select rolsuper from pg_roles where rolname = current_user) then
    if total <> 0 then
      falhas := array_append(falhas, 'superusuário não pode manter membership nas roles de preview');
    end if;
  else
    if total = 0 then
      falhas := array_append(falhas, 'falta a membership administrativa em preview_migrador');
    end if;
    if exists (
      select 1
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
       where r.rolname in ('preview_migrador', 'preview_app')
         and m.rolname <> current_user
    ) then
      falhas := array_append(falhas, 'somente o administrador pode manter membership nas roles de preview');
    end if;
    if exists (
      select 1
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
       where r.rolname in ('preview_migrador', 'preview_app')
         and m.rolname = current_user
         and a.inherit_option
    ) then
      falhas := array_append(falhas, 'a membership administrativa não pode herdar privilégios automaticamente');
    end if;
    if not exists (
      select 1
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
       where r.rolname = 'preview_migrador'
         and m.rolname = current_user
         and a.set_option
    ) then
      falhas := array_append(falhas, 'a membership administrativa precisa permitir SET ROLE em preview_migrador');
    end if;
    if exists (
      select 1
        from pg_auth_members a
        join pg_roles r on r.oid = a.roleid
        join pg_roles m on m.oid = a.member
       where r.rolname = 'preview_app'
         and m.rolname = current_user
         and a.set_option
    ) then
      falhas := array_append(falhas, 'o administrador não pode usar SET ROLE em preview_app');
    end if;
  end if;

  if not exists (
    select 1 from pg_namespace
     where nspname = 'preview' and nspowner = 'preview_migrador'::regrole
  ) then
    falhas := array_append(falhas, 'o schema preview precisa pertencer a preview_migrador');
  end if;
  if not has_schema_privilege('preview_migrador', 'preview', 'USAGE') then
    falhas := array_append(falhas, 'preview_migrador perdeu USAGE no schema preview');
  end if;
  if not has_schema_privilege('preview_migrador', 'preview', 'CREATE') then
    falhas := array_append(falhas, 'preview_migrador perdeu CREATE no schema preview');
  end if;
  if not has_schema_privilege('preview_app', 'preview', 'USAGE') then
    falhas := array_append(falhas, 'preview_app perdeu USAGE no schema preview');
  end if;
  if has_schema_privilege('preview_app', 'preview', 'CREATE') then
    falhas := array_append(falhas, 'preview_app não pode ter CREATE no schema preview');
  end if;
  if exists (
    select 1
      from pg_namespace n,
           aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
     where n.nspname = 'preview' and a.grantee = 0
  ) then
    falhas := array_append(falhas, 'PUBLIC ainda tem privilégio no schema preview');
  end if;

  for tabela in
    select c.oid, c.relname, c.relowner
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'preview' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    if tabela.relowner <> 'preview_migrador'::regrole then
      falhas := array_append(falhas, format('a tabela preview.%s não pertence ao migrador', tabela.relname));
    end if;
    if not has_table_privilege('preview_app', tabela.oid, 'SELECT,INSERT,UPDATE,DELETE') then
      falhas := array_append(falhas, format('preview_app não tem DML em preview.%s', tabela.relname));
    end if;
    if exists (
      select 1
        from pg_class c,
             aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       where c.oid = tabela.oid and a.grantee = 0
    ) then
      falhas := array_append(falhas, format('PUBLIC ainda tem privilégio na tabela preview.%s', tabela.relname));
    end if;
  end loop;

  for sequencia in
    select c.oid, c.relname, c.relowner
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'preview' and c.relkind = 'S'
  loop
    if sequencia.relowner <> 'preview_migrador'::regrole then
      falhas := array_append(falhas, format('a sequence preview.%s não pertence ao migrador', sequencia.relname));
    end if;
    if not has_sequence_privilege('preview_app', sequencia.oid, 'USAGE,SELECT') then
      falhas := array_append(falhas, format('preview_app não tem USAGE,SELECT em preview.%s', sequencia.relname));
    end if;
    if exists (
      select 1
        from pg_class c,
             aclexplode(coalesce(c.relacl, acldefault('s', c.relowner))) a
       where c.oid = sequencia.oid and a.grantee = 0
    ) then
      falhas := array_append(falhas, format('PUBLIC ainda tem privilégio na sequence preview.%s', sequencia.relname));
    end if;
  end loop;

  for rotina in
    select p.oid, p.proname, p.prokind, p.proowner
      from pg_proc p
     where p.pronamespace = 'preview'::regnamespace
  loop
    if rotina.proowner <> 'preview_migrador'::regrole then
      falhas := array_append(falhas, format('a rotina preview.%s não pertence ao migrador', rotina.proname));
    end if;
    if not has_function_privilege('preview_app', rotina.oid, 'EXECUTE') then
      falhas := array_append(falhas, format('preview_app não executa preview.%s', rotina.proname));
    end if;
    if exists (
      select 1
        from pg_proc p,
             aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = rotina.oid and a.grantee = 0
    ) then
      falhas := array_append(falhas, format('PUBLIC ainda executa preview.%s', rotina.proname));
    end if;
  end loop;

  for tipo in
    select t.oid, t.typname, t.typowner
      from pg_type t
     where t.typnamespace = 'preview'::regnamespace
       and t.typtype in ('e', 'd')
  loop
    if tipo.typowner <> 'preview_migrador'::regrole then
      falhas := array_append(falhas, format('o type preview.%s não pertence ao migrador', tipo.typname));
    end if;
    if not has_type_privilege('preview_app', tipo.oid, 'USAGE') then
      falhas := array_append(falhas, format('preview_app não usa o type preview.%s', tipo.typname));
    end if;
    if exists (
      select 1
        from pg_type t,
             aclexplode(coalesce(t.typacl, acldefault('T', t.typowner))) a
       where t.oid = tipo.oid and a.grantee = 0
    ) then
      falhas := array_append(falhas, format('PUBLIC ainda usa o type preview.%s', tipo.typname));
    end if;
  end loop;

  if not has_database_privilege('preview_migrador', current_database(), 'CONNECT') then
    falhas := array_append(falhas, 'preview_migrador perdeu CONNECT no banco');
  end if;
  if not has_database_privilege('preview_migrador', current_database(), 'CREATE') then
    falhas := array_append(falhas, 'preview_migrador perdeu CREATE de schemas no banco');
  end if;
  if not has_database_privilege('preview_app', current_database(), 'CONNECT') then
    falhas := array_append(falhas, 'preview_app perdeu CONNECT no banco');
  end if;
  if has_database_privilege('preview_app', current_database(), 'CREATE') then
    falhas := array_append(falhas, 'preview_app não pode criar schemas no banco');
  end if;

  if array_length(falhas, 1) > 0 then
    raise exception 'Contrato de privilégios do preview não confirmado: %',
      array_to_string(falhas, '; ');
  end if;
end
$$;

commit;

-- 11. Relatório para a operação. As consultas não concedem nada e servem de
--     evidência; a transação acima já garantiu o contrato ou abortou.
select rolname,
       rolcanlogin as login,
       rolinherit as herda,
       rolsuper as superusuario,
       rolcreaterole as cria_papel,
       rolcreatedb as cria_banco
  from pg_roles
 where rolname in ('preview_migrador', 'preview_app')
 order by rolname;

select pg_get_userbyid(n.nspowner) as dono,
       has_schema_privilege('preview_migrador', 'preview', 'USAGE') as migrador_usa,
       has_schema_privilege('preview_migrador', 'preview', 'CREATE') as migrador_cria,
       has_schema_privilege('preview_app', 'preview', 'USAGE') as runtime_usa,
       has_schema_privilege('preview_app', 'preview', 'CREATE') as runtime_cria
  from pg_namespace n
 where n.nspname = 'preview';

select r.rolname as papel,
       m.rolname as membro,
       a.inherit_option as herda,
       a.set_option as permite_set_role,
       a.admin_option as admin
  from pg_auth_members a
  join pg_roles r on r.oid = a.roleid
  join pg_roles m on m.oid = a.member
 where r.rolname in ('preview_migrador', 'preview_app')
    or m.rolname in ('preview_migrador', 'preview_app')
 order by 1, 2, 3, 4, 5;
