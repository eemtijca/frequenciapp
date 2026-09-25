# Banco

PostgreSQL 17 com Prisma ORM 7, gerador `prisma-client` e adaptador `pg`. O schema em `prisma/schema.prisma` é a fonte de verdade para o cliente. As migrations em `prisma/migrations/` são o histórico aplicado e `prisma.config.ts` configura o CLI.

## Esquema

| Tabela        | Papel                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| `usuarios`    | Contas: e-mail único, hash da senha, nome, papel e situação.                   |
| `sessoes`     | Sessões opacas: hash SHA-256 do token, dono e expiração.                       |
| `series`      | Séries escolares, por exemplo 1º ano, com ordem de exibição.                   |
| `turmas`      | Turmas por série, com rótulo composto e unicidade dentro da série.             |
| `atribuicoes` | Turmas que cada professor pode registrar; par professor e turma é a chave.     |
| `alunos`      | Nome do aluno, turma atual, turma de origem, ordem e situação.                 |
| `frequencias` | Frequência de um dia e turma por professor: dia `date`, revisão e atualização. |
| `faltas`      | Ausências por frequência e aluno; a presença é implícita.                      |
| `auditoria`   | Trilha de ações administrativas: quem, o quê e quando.                         |

Restrições de integridade relevantes:

- `frequencias` tem unicidade de (professor, turma, dia): uma frequência por dia, turma e professor, imposta pelo banco.
- `faltas` tem chave composta (`frequencia_id`, `aluno_id`) e exclusão em cascata com a frequência e com o aluno.
- `series`, `turmas`, `alunos` e `frequencias` se protegem por `ON DELETE RESTRICT`: séries com turmas, turmas com alunos ou frequências, professores com frequências e origens com alunos não são excluídos.
- `atribuicoes` exclui em cascata com o professor e com a turma.
- Unicidade de e-mail, nome de série e nome de turma por série é feita por índices funcionais em `lower()`, mantidos no SQL das migrations.
- Checks de positividade em `frequencias.revisao`, `alunos.ordem` e `series.ordem` independem da aplicação.

A decisão de guardar apenas as faltas, com presença implícita, está em [ADR-003](adr/003-faltas-normalizadas.md) e detalhada em [modelo-de-dados.md](modelo-de-dados.md). A decisão de transações serializáveis está em [ADR-007](adr/007-transacoes-acid.md).

## Conexões

O runtime da API usa `DATABASE_URL`. O Prisma CLI, o migrador e os scripts administrativos usam `DIRECT_URL` quando essa variável está disponível.

No Supabase, `DATABASE_URL` deve apontar para a Transaction pooler na porta 6543, com `pgbouncer=true` e `sslmode=require`. `DIRECT_URL` deve apontar para a Session pooler na porta 5432, com `sslmode=require`.

O `prisma.config.ts` prioriza `DIRECT_URL`, com fallback para `DATABASE_URL` e uma URL local para permitir `prisma generate` durante o build. O migrador Docker usa a mesma preferência.

## Migrações

Dia a dia em desenvolvimento:

```bash
npx prisma migrate dev --name ajuste
```

Aplicação em produção e ambientes limpos:

```bash
npx prisma migrate deploy
```

Nunca edite uma migration aplicada; ajustes entram como migration nova. O contêiner da aplicação aplica as migrations na partida com um migrador próprio que registra cada arquivo em `_prisma_migrations`, interoperando com `migrate deploy` da CLI. O código está em `docker/app/migrar.mjs`.

A migration inicial foi reescrita antes do primeiro deploy de produção para trocar os nomes antigos. Ambientes locais com essa revisão anterior precisam ser recriados.

## Regeneração do cliente

```bash
npx prisma generate
```

O `postinstall` do npm executa a regeneração. O código gerado fica em `generated/`, fora do controle de versão, e o runtime o importa de `src/infra/banco.ts` junto com o adaptador `pg`.

## Manutenção

Sessões vencidas acumulam poucas linhas por conta:

```sql
delete from sessoes where expira_em < now();
```

A trilha de auditoria cresce com o uso administrativo. Quando não houver obrigação legal de retenção, a purga pode seguir política própria:

```sql
delete from auditoria where criado_em < now() - interval '1 year';
```

Não há rotina de limpeza automática embutida. Ambientes com poucas contas podem purgar esporadicamente, conforme [operacao.md](operacao.md).

## Backup e restauração

O volume de dados é pequeno e textual. O backup direto por `pg_dump` cobre tudo. Use `DIRECT_URL` com a Session pooler ou uma conexão direta, nunca a Transaction pooler:

```bash
pg_dump "$DIRECT_URL" -F c -f frequenciapp.dump
pg_restore --clean --if-exists -d "$DIRECT_URL" frequenciapp.dump
```

O teste de restauração recomendado é restaurar em um banco vazio e conferir contagens de `alunos` e `frequencias`. A rotina completa está em [operacao.md](operacao.md).
