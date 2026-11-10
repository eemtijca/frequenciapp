# Segurança do schema de preview

O provisionamento do preview compartilha o database com a produção e usa duas roles separadas, `preview_migrador` e `preview_app`. Este documento descreve o contrato aplicado por [`scripts/banco/provisionar-preview.sql`](../scripts/banco/provisionar-preview.sql) e a forma de validá-lo. O guia de publicação continua em [`docs/deploy.md`](deploy.md).

O schema de preview é estado descartável. O contrato abaixo reduz o alcance das roles de preview, revoga os privilégios implícitos de PUBLIC e falha fechado quando a configuração não pode ser comprovada.

## Contrato de roles

| Role               | Uso                                    | Privilégios                                                                                                                                                                                |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `preview_migrador` | Migrações, criação de `preview_pr_<n>` | LOGIN, NOINHERIT, CONNECT e CREATE no database, dono do schema `preview` e dos objetos que cria. Sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ou BYPASSRLS.                            |
| `preview_app`      | Runtime do preview                     | LOGIN, NOINHERIT e CONNECT no database. USAGE no schema `preview`, DML nas tabelas, USAGE e SELECT nas sequences, EXECUTE nas rotinas e USAGE nos tipos. Sem CREATE em schema ou database. |

As duas roles não são membros uma da outra. A role de runtime não pode assumir a role de migração, e a role de migração não pode assumir a role de runtime. O administrador que executa o provisionamento mantém a membership necessária para definir default privileges, com `INHERIT FALSE` e `SET TRUE`. As memberships automáticas criadas pelo atributo CREATEROLE também não herdam privilégios; a membership automática em `preview_app` não permite `SET ROLE`. Nenhuma outra role é membro das roles de preview.

O runtime não recebe grants diretos de produção. O migrador cria schemas por pull request, mas não recebe acesso a schemas alheios. O ensaio prova a negativa em um schema sintético e em uma tabela do schema `public`. Grants para PUBLIC fora do preview ficam fora do alcance deste script e devem ser auditados pela operação.

## Senhas

O arquivo SQL não contém senha padrão nem senha em texto claro. Os valores são lidos do ambiente pelas variáveis `PREVIEW_SENHA_MIGRADOR` e `PREVIEW_SENHA_APP` e aplicados com `ALTER ROLE`.

O provisionamento recusa a execução quando uma variável está ausente, tem menos de 32 caracteres ou repete a senha da outra role. As senhas devem vir do gerenciador de segredos da plataforma, nunca de arquivos versionados, issues ou logs. A rotação ocorre ao reexecutar o SQL com os novos valores, que é idempotente.

## Revogação de PUBLIC

O provisionamento revoga PUBLIC do schema `preview` e dos objetos existentes:

- `ALL` no schema, nas tabelas, nas sequences e nas rotinas;
- `USAGE` nos tipos enum e domínio do schema.

Depois, concede ao runtime apenas o necessário. Os default privileges globais da role `preview_migrador` repetem a revogação para objetos futuros, incluindo os schemas `preview_pr_<n>` criados pela automação do preview. Assim, uma tabela, sequence, rotina ou tipo novo nasce sem PUBLIC e com os grants do runtime.

O script também remove grants diretos das roles de preview no schema `public` e exige que o administrador consiga fazer essa revogação. Ele não altera os grants de PUBLIC nos demais schemas, porque isso afetaria o ambiente de produção. A auditoria de grants para PUBLIC fora do preview continua sendo responsabilidade da operação.

> [!WARNING]
> As roles são do cluster, não do schema. As roles de preview não devem ser reutilizadas na produção, e `DIRECT_URL_PREVIEW` fica restrita ao environment `preview`. Um grant para PUBLIC em outro schema ou tabela fora do preview não é removido por este script.

## Validação e falha fechada

O SQL executa a conferência dentro da mesma transação do provisionamento. Se qualquer condição divergir, a exceção desfaz as alterações de roles, schema, grants e default privileges. A conferência usa:

- `pg_roles` para LOGIN, NOINHERIT e ausência dos atributos administrativos;
- `pg_auth_members` para memberships de entrada e de saída;
- `has_schema_privilege` para o schema `preview` e para o schema alheio;
- `has_table_privilege` para as tabelas do preview e para a tabela de produção sintética;
- `has_sequence_privilege`, `has_function_privilege` e `has_type_privilege` para os demais objetos;
- `has_database_privilege` para CONNECT e CREATE no database;
- `aclexplode` sobre `pg_namespace`, `pg_class` e `pg_proc` para comprovar que PUBLIC não aparece nas ACLs.

A execução administrativa ocorre com um papel que tenha CREATEROLE, administração do database e poder de revogar privilégios no schema `public`. O administrador precisa poder assumir `preview_migrador` com `SET ROLE`; o SQL concede a membership com `INHERIT FALSE` e `SET TRUE` quando necessário. Superusuários não recebem membership.

Para aplicar em um ambiente já provisionado, com a conexão administrativa fora do repositório:

```bash
psql -X "$DIRECT_URL_ADMIN" -v ON_ERROR_STOP=1 -f scripts/banco/provisionar-preview.sql
```

As variáveis `PREVIEW_SENHA_MIGRADOR` e `PREVIEW_SENHA_APP` precisam estar no ambiente do comando, fornecidas pelo gerenciador de segredos.

## Ensaio descartável

O ensaio [`tests/servidor/privilegios-preview.sh`](../tests/servidor/privilegios-preview.sh) sobe um `postgres:17-alpine` sem portas publicadas, cria um administrador sem superusuário, um schema alheio e uma tabela no schema `public`, e aplica o SQL com senhas sintéticas. Ele comprova:

- recusa de variável ausente, senha curta e senhas iguais antes de criar roles;
- autenticação do migrador e do runtime e recusa de senha incorreta;
- DML, sequences, funções, enums e schema por pull request para o runtime;
- negativa de acesso ao schema alheio, à tabela do schema `public`, à criação de schema e ao `SET ROLE` indevido;
- revogação de PUBLIC e de membership indevida em uma reexecução;
- falha fechada com objeto de terceiro no preview e restauração da senha anterior após o rollback.

O relatório JSON da conferência é validado por [`tests/apoio/privilegios-preview.mjs`](../tests/apoio/privilegios-preview.mjs), sem conexão ao banco. A lógica pura do verificador tem teste em [`tests/unidade/infra/privilegios-preview.test.ts`](../tests/unidade/infra/privilegios-preview.test.ts).

Comandos:

```bash
bash tests/servidor/privilegios-preview.sh
pnpm exec vitest run tests/unidade/infra/privilegios-preview.test.ts
```

O ensaio exige Docker e Node. Ele usa apenas dados sintéticos, não publica portas e remove o contêiner ao final.

## Rotina operacional

1. O SQL é aplicado com a conexão administrativa e as senhas fornecidas pelo gerenciador de segredos.
2. A configuração de `DIRECT_URL_PREVIEW` usa `preview_migrador`, e o runtime do preview usa `preview_app`.
3. O ensaio descartável é executado após qualquer mudança no SQL, no schema ou na automação do preview.
4. Os grants para PUBLIC fora do schema `preview` são auditados periodicamente.

O workflow [`schema-preview.yml`](../.github/workflows/schema-preview.yml) e [`scripts/banco/preview-schema.mjs`](../scripts/banco/preview-schema.mjs) continuam responsáveis por criar, migrar e remover `preview_pr_<n>`. O provisionamento define o contrato das roles e os default privileges globais que esses componentes herdam.
