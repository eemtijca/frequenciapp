# Banco

PostgreSQL 17 com Prisma ORM 7, gerador `prisma-client` e adaptador `pg`. O schema em `prisma/schema.prisma` é a fonte de verdade para o cliente. As migrations em `prisma/migrations/` são o histórico aplicado e `prisma.config.ts` configura o CLI.

## Esquema

| Tabela        | Papel                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| `usuarios`    | Contas: e-mail único, hash da senha, nome, papel (`ADMIN` ou `COORDENACAO`) e situação. |
| `sessoes`     | Sessões opacas: hash SHA-256 do token, dono e expiração.                                |
| `series`      | Séries escolares, por exemplo 1º ano, com ordem de exibição.                            |
| `turmas`      | Turmas por série, com rótulo composto e unicidade dentro da série.                      |
| `alunos`      | Nome do aluno, turma atual, turma de origem, ordem e situação.                          |
| `horarios`    | Aulas da turma: ordem, janela `HH:MM`, dias da semana e situação.                       |
| `frequencias` | Uma frequência por turma e dia: revisão, autoria e atualização.                         |
| `faltas`      | Ausências por frequência, aluno e aula; a presença é implícita.                         |
| `auditoria`   | Trilha de ações administrativas: quem, o quê e quando.                                  |

Restrições de integridade relevantes:

- `frequencias` tem unicidade de (turma, dia): uma frequência por turma e dia, compartilhada pela coordenação.
- `faltas` tem chave composta (`frequencia_id`, `aluno_id`, `horario_id`) e exclusão em cascata com a frequência e com o aluno; a aula é protegida por `ON DELETE RESTRICT`.
- `horarios` tem unicidade de (`turma_id`, `ordem`), exclusão em cascata com a turma e checks de formato de hora, intervalo e dias da semana.
- `series`, `turmas` e `alunos` se protegem por `ON DELETE RESTRICT`.
- `frequencias.criado_por_id` e `frequencias.atualizado_por_id` usam `ON DELETE SET NULL`: excluir uma conta preserva o histórico da escola.
- Unicidade de e-mail, nome de série e nome de turma por série é feita por índices funcionais em `lower()`, mantidos no SQL das migrations.
- Checks de positividade em `frequencias.revisao`, `alunos.ordem`, `series.ordem` e `horarios.ordem` independem da aplicação.

A decisão de guardar apenas as faltas, com presença implícita, está em [ADR-003](adr/003-faltas-normalizadas.md) e detalhada em [modelo-de-dados.md](modelo-de-dados.md). A frequência única com saídas por aula está em [ADR-010](adr/010-frequencia-unica-com-aulas.md). A decisão de transações serializáveis está em [ADR-007](adr/007-transacoes-acid.md).

## Migração inicial reescrita

Enquanto o aplicativo não tinha o primeiro deploy de produção, a migração inicial foi reescrita para o schema da coordenação, sem acúmulo de migrações intermediárias e sem backfill. Ambientes locais criados antes dessa revisão precisam ser recriados:

```bash
npx prisma migrate reset --force
# ou
docker compose down -v && docker compose up --build
```

Depois do primeiro deploy de produção, a regra passa a ser aplicada sem exceção: nunca editar uma migração aplicada; qualquer ajuste entra como migração nova.

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

O contêiner da aplicação aplica as migrations na partida com um migrador próprio que registra cada arquivo em `_prisma_migrations`, usa trava consultiva para dois contêineres não aplicarem a mesma migração em paralelo e confere o checksum das migrações já aplicadas. O código está em `docker/app/migrar.mjs`.

## Regeneração do cliente

```bash
npx prisma generate
```

O `postinstall` do npm executa a regeneração. O código gerado fica em `generated/`, fora do controle de versão, e o runtime o importa de `src/infra/banco.ts` junto com o adaptador `pg`.

## Fuso e datas civis

As datas civis trafegam como texto `YYYY-MM-DD` e são gravadas como `date` a partir do meio-dia UTC, imunes a deslocamentos de fuso na gravação. O dia corrente é resolvido com `TZ_APP` ([ambiente.md](ambiente.md)).

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
