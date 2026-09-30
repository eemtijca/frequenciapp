# Banco

PostgreSQL 17 com Prisma ORM 7, gerador `prisma-client` e adaptador `pg`. O schema em `prisma/schema.prisma` é a fonte de verdade para o cliente. As migrations em `prisma/migrations/` são o histórico aplicado e `prisma.config.ts` configura o CLI.

## Esquema

| Tabela                        | Papel                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `usuarios`                    | Contas: login único (e-mail ou identificador do diretor), hash da senha, nome, papel e situação. |
| `sessoes`                     | Sessões opacas: hash SHA-256 do token, dono e expiração.                                         |
| `series`                      | Séries escolares, por exemplo 1º ano, com ordem de exibição.                                     |
| `turmas`                      | Turmas por série, com rótulo composto e unicidade dentro da série.                               |
| `alunos`                      | Nome do aluno, turma atual, turma de origem, ordem, atividade e data de desistência.             |
| `horarios`                    | Aulas da turma: ordem, janela `HH:MM`, dias da semana e situação.                                |
| `frequencias`                 | Uma frequência por turma e dia: revisão, autoria e atualização.                                  |
| `alunos_chamada`              | Lista de cada chamada: quem estava nela, presente ou ausente.                                    |
| `faltas`                      | Ausências por frequência, aluno e aula, com justificativa e observação opcionais.                |
| `saidas_antecipadas`          | Saídas antes do fim do dia: aluno, momento, justificativa, responsável e autoria.                |
| `configuracoes`               | Linha única com os recursos ligados: chamada por aula, saída antecipada e origem na Chamada.     |
| `configuracoes_origem_series` | Séries completas selecionadas para exibir a origem na Chamada.                                   |
| `configuracoes_origem_turmas` | Turmas específicas selecionadas para exibir a origem na Chamada.                                 |
| `justificativas`              | Catálogo de justificativas: código estável, rótulo e situação, editável na Gestão.               |
| `liberadores`                 | Catálogo de quem libera a saída: código estável, rótulo e situação, editável na Gestão.          |
| `integracoes_planilha`        | Uma linha por finalidade (`FREQUENCIA` e `SAIDAS`) com token, esquema e modo.                    |
| `sincronizacoes_planilha`     | Histórico de envios por finalidade e turma de origem, com contagens e resultado.                 |
| `auditoria`                   | Trilha de ações administrativas: quem, o quê e quando.                                           |
| `vinculos_diretor`            | Turmas de origem de cada diretor, com início e fim; o fim fica no histórico.                     |
| `credenciais_diretor`         | Ciclo de vida da palavra-chave do diretor: emissão, validade, primeiro uso e revogação.          |
| `parametros_acesso`           | Linha única com validade, sessão do diretor, limites de entrada, categorias e risco.             |
| `tentativas_entrada`          | Contador de tentativas por chave, compartilhado entre instâncias.                                |

Restrições de integridade relevantes:

- `frequencias` tem unicidade de (turma, dia): uma frequência por turma e dia, compartilhada pela coordenação.
- `alunos.desistente_em` é uma data opcional: a partir dela o aluno continua na lista da chamada, sem novas marcas. `situacao_atualizada_em` permite incluir a mudança no próximo envio incremental à planilha. A turma de origem não muda quando a turma atual é alterada.
- `alunos_chamada` tem chave composta (`frequencia_id`, `aluno_id`) e exclusão em cascata com a frequência e com o aluno. A migração `lista_da_chamada` preenche as chamadas já salvas com quem tem falta nelas e com os alunos ativos que estão na turma da chamada.
- `faltas` tem chave composta (`frequencia_id`, `aluno_id`, `horario_id`) e exclusão em cascata com a frequência e com o aluno; a aula é protegida por `ON DELETE RESTRICT`.
- `saidas_antecipadas` tem unicidade de (aluno, dia) e exclusão em cascata com o aluno; o responsável e a autoria usam `ON DELETE SET NULL`. A linha exige código de justificativa ou texto livre, e `liberado_por_codigo`, quando preenchido, aponta para o catálogo `liberadores`, validado na aplicação.
- `configuracoes` é uma linha única (`principal`) criada na migração, com autoria anulável.
- As seleções de origem têm chave composta e referências para a configuração e para a série ou turma. Excluir uma série ou turma retira somente a respectiva seleção em cascata. Desativar o recurso não remove seleções. A migração `origem_chamada_configuravel` seleciona apenas as séries existentes com ordinal 3 para compatibilidade; em base vazia, o recurso permanece desligado e sem seleção ([ADR-026](adr/026-origem-configuravel-na-chamada.md)).
- `justificativas` tem unicidade funcional em `lower(codigo)` e é o catálogo usado na validação da chamada e da saída.
- `liberadores` tem unicidade funcional em `lower(codigo)` e é o catálogo de quem libera a saída, cadastrado pela administração e sem nomes de pessoas na migração.
- `horarios` tem unicidade de (`turma_id`, `ordem`), exclusão em cascata com a turma e checks de formato de hora, intervalo e dias da semana.
- `series`, `turmas` e `alunos` se protegem por `ON DELETE RESTRICT`.
- `frequencias.criado_por_id` e `frequencias.atualizado_por_id` usam `ON DELETE SET NULL`: excluir uma conta preserva o histórico da escola.
- Unicidade de e-mail, nome de série e nome de turma por série é feita por índices funcionais em `lower()`, mantidos no SQL das migrations.
- Checks de positividade em `frequencias.revisao`, `alunos.ordem`, `series.ordem` e `horarios.ordem` independem da aplicação.
- `integracoes_planilha` e `sincronizacoes_planilha` separam a frequência das saídas pela coluna `finalidade`; cada finalidade tem a própria linha de token, esquema e modo completo.
- `vinculos_diretor` tem índice único parcial em (`usuario_id`, `turma_id`) com `fim` nulo, check de fim maior ou igual ao início, exclusão em cascata com a conta e `ON DELETE RESTRICT` na turma.
- `credenciais_diretor` tem um registro por conta, com check de validade posterior à emissão.
- `parametros_acesso` é linha única com checks de faixa e de categorias (subconjunto fechado, sempre com `faltas`), criada na migração.

A decisão de guardar apenas as faltas, com presença implícita, está em [ADR-003](adr/003-faltas-normalizadas.md) e detalhada em [modelo-de-dados.md](modelo-de-dados.md). A frequência única com saídas por aula está em [ADR-010](adr/010-frequencia-unica-com-aulas.md); a chamada diária com justificativas, saídas e recursos opcionais está na [ADR-012](adr/012-chamada-diaria-com-saidas.md); a grade por período e a cópia JSON estão na [ADR-013](adr/013-grade-por-periodo-e-copia-json.md). A decisão de transações serializáveis está em [ADR-007](adr/007-transacoes-acid.md).

## Migração inicial reescrita

Enquanto o aplicativo não tinha o primeiro deploy de produção, a migração inicial foi reescrita para o schema da coordenação, sem acúmulo de migrações intermediárias e sem backfill. Ambientes locais criados antes dessa revisão precisam ser recriados:

```bash
npx prisma migrate reset --force
# ou
docker compose down -v && docker compose up --build
```

Depois do primeiro deploy de produção, a regra passa a ser aplicada sem exceção: nunca editar uma migração aplicada; qualquer ajuste entra como migração nova.

## Entradas atrasadas

A migração `20260930005502_entradas_atrasadas` cria apenas a tabela `entradas_atrasadas`, seus índices e referências. Não altera saídas nem frequências existentes. A chave (aluno, dia) impede repetição; horário e motivo são validados pela aplicação. O registro guarda turma e rótulo de quem registrou, preservados depois de transferência de aluno ou exclusão de conta. A turma é protegida por referência; a autoria é anulável. A cópia JSON inclui entradas e importa por mesclagem, sem sobrescrever. Cópias antigas sem esse campo continuam aceitas.

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

O contador de tentativas se expurga sozinho de tempos em tempos; para limpar de uma vez:

```sql
delete from tentativas_entrada where janela_inicio < now() - interval '1 day';
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
