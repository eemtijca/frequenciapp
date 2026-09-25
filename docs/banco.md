# Banco

PostgreSQL 17 com Prisma ORM 7 (gerador `prisma-client`, adaptador `pg`). O schema em `prisma/schema.prisma` é a fonte da verdade para o cliente; as migrações em `prisma/migrations/` são o histórico aplicado; `prisma.config.ts` configura o CLI e a connection string.

## Esquema

| Tabela        | Papel                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `usuarios`    | Contas: e-mail único, hash da senha, nome, papel e situação.               |
| `sessoes`     | Sessões opacas: hash SHA-256 do token, dono e expiração.                   |
| `series`      | Séries escolares (por exemplo, 1º ano) com ordem de exibição.              |
| `turmas`      | Turmas por série, com rótulo composto e unicidade dentro da série.         |
| `atribuicoes` | Turmas que cada professor pode chamar; par professor + turma é a chave.    |
| `alunos`      | Nome de chamada, turma atual, turma de origem, ordem e situação.           |
| `chamadas`    | Chamada de um dia e turma por professor: dia `date`, revisão, atualização. |
| `faltas`      | Ausências por chamada e aluno; presença é implícita.                       |
| `auditoria`   | Trilha de ações administrativas: quem, o quê, quando.                      |

Restrições de integridade relevantes:

- `chamadas` tem unicidade de (professor, turma, dia): uma chamada por dia, turma e professor, imposta pelo banco.
- `faltas` tem chave composta (chamada, aluno) e exclusão em cascata com a chamada e com o aluno.
- `series`, `turmas`, `alunos` e `chamadas` se protegem por `ON DELETE RESTRICT`: séries com turmas, turmas com alunos ou chamadas, professores com chamadas e origens com alunos não são excluídos; a mensagem de erro orienta o caminho (mover, desativar) em vez de deixar órfãos.
- `atribuicoes` exclui em cascata com o professor e com a turma: sumir uma atribuição nunca danglinga.
- Unicidade de e-mail, nome de série e nome de turma por série é feita por índices funcionais em `lower()`, mantidos no SQL das migrações porque o Prisma não os representa.
- Checks de positividade em `chamadas.revisao`, `alunos.ordem` e `series.ordem` independem da aplicação.

A decisão de guardar apenas as faltas, com presença implícita, está em [ADR-003](adr/003-faltas-normalizadas.md) e detalhada em odelo-de-dados.md](modelo-de-dados.md). A de transações serializáveis, em [ADR-007](adr/007-transacoes-acid.md).

A decisão de guardar apenas as faltas, com presença implícita, está em [ADR-003](adr/003-faltas-normalizadas.md) e detalhada em [modelo-de-dados.md](modelo-de-dados.md).

## Migrações

Dia a dia em desenvolvimento:

```bash
npx prisma migrate dev --name ajuste
```

Aplicação em produção e ambientes limpos:

```bash
npx prisma migrate deploy
```

Nunca edite uma migração já aplicada; ajustes entram como migração nova. O contêiner da aplicação aplica as migrações na partida com um migrador próprio que registra cada arquivo em `_prisma_migrations`, interoperando com o `migrate deploy` da CLI (ver `docker/app/migrar.mjs`).

## Regeneração do cliente

```bash
npx prisma generate
```

O `postinstall` do npm executa a regeneração; não é preciso rodar à mão após instalar dependências. O código gerado fica em `generated/` (fora do controle de versão) e o runtime o importa de `src/infra/banco.ts` junto com o adaptador `pg`.

## Manutenção

Sessões vencidas acumulam poucas linhas por conta; a purga pode ser agendada pelo operador:

```sql
delete from sessoes where expira_em < now();
```

A trilha de auditoria cresce com o uso administrativo; quando não houver obrigação legal de retenção, a purga pode seguir política própria (ver [lgpd.md](lgpd.md)):

```sql
delete from auditoria where criado_em < now() - interval '1 year';
```

Não há rotina de limpeza automática embutida; ambientes com poucas contas podem purgar esporadicamente (ver [operacao.md](operacao.md)).

## Backup e restauração

O volume de dados é pequeno e textual. O backup direto por `pg_dump` cobre tudo:

```bash
pg_dump "$DATABASE_URL" -F c -f chamada.dump
pg_restore --clean --if-exists -d "$DATABASE_URL" chamada.dump
```

O teste de restauração recomendado é restaurar em um banco vazio e conferir contagens de `alunos` e `chamadas`. Rotina completa em [operacao.md](operacao.md).
