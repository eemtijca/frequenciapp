# Banco

PostgreSQL 17 com Prisma ORM 7, gerador `prisma-client` e adaptador `pg`. O schema em `prisma/schema.prisma` é a fonte de verdade para o cliente. As migrations em `prisma/migrations/` são o histórico aplicado e `prisma.config.ts` configura o CLI.

## Esquema

| Tabela                        | Papel                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `usuarios`                    | Contas: login único (e-mail ou identificador do diretor), hash da senha, nome, papel e situação. |
| `sessoes`                     | Sessões opacas: hash SHA-256 do token, dono e expiração.                                         |
| `assinaturas_push`            | Preferência voluntária por dispositivo, conta, sessão e chaves de transporte.                    |
| `entregas_push`               | Reserva e confirmação do aviso diário por assinatura, com retenção de 30 dias.                   |
| `series`                      | Séries escolares, por exemplo 1º ano, com ordem de exibição.                                     |
| `turmas`                      | Turmas por série, com rótulo composto e unicidade dentro da série.                               |
| `alunos`                      | Nome do aluno, turma atual, turma de origem, ordem, atividade e data de desistência.             |
| `horarios`                    | Aulas da turma: ordem, janela `HH:MM`, dias da semana e situação.                                |
| `frequencias`                 | Uma frequência por turma e dia: revisão, autoria e atualização.                                  |
| `frequencias_parciais`        | Presença personalizada por aluno e dia, turma histórica, revisão e confirmação manual da Seduc.  |
| `alunos_chamada`              | Lista de cada chamada: quem estava nela, presente ou ausente.                                    |
| `faltas`                      | Ausências por frequência, aluno e aula, com justificativa e observação opcionais.                |
| `saidas_antecipadas`          | Saídas antes do fim do dia: aluno, momento, horário, justificativa, responsável e autoria.       |
| `configuracoes`               | Linha única com os recursos ligados: chamada por aula, saída antecipada e origem na Chamada.     |
| `configuracoes_origem_series` | Séries completas selecionadas para exibir a origem na Chamada.                                   |
| `configuracoes_origem_turmas` | Turmas específicas selecionadas para exibir a origem na Chamada.                                 |
| `justificativas`              | Catálogo de justificativas: código estável, rótulo e situação, editável na Gestão.               |
| `liberadores`                 | Catálogo de quem libera a saída: código estável, rótulo e situação, editável na Gestão.          |
| `integracoes_planilha`        | Uma linha por finalidade (`FREQUENCIA`, `SAIDAS` e `PARCIAL`) com token, esquema e modo.         |
| `sincronizacoes_planilha`     | Histórico de envios por finalidade e turma de origem, com contagens e resultado.                 |
| `fila_planilha`               | Fila FIFO dos envios automáticos às planilhas: ordem, estado, tentativas e reserva (ADR-039).    |
| `auditoria`                   | Trilha de ações administrativas: quem, o quê e quando.                                           |
| `vinculos_diretor`            | Turmas de origem de cada diretor, com início e fim; o fim fica no histórico.                     |
| `credenciais_diretor`         | Ciclo de vida da palavra-chave do diretor: emissão, validade, primeiro uso e revogação.          |
| `parametros_acesso`           | Linha única com validade, sessão do diretor, limites de entrada, categorias e risco.             |
| `tentativas_entrada`          | Contador de tentativas por chave, compartilhado entre instâncias.                                |

Restrições de integridade relevantes:

- `assinaturas_push` tem endpoint único e exclusão em cascata com a conta; a remoção natural da sessão anula a referência, preservando a preferência. A saída explícita remove as assinaturas dessa sessão antes de encerrá-la.
- `entregas_push` tem unicidade de assinatura e dia e exclusão em cascata com a assinatura. As duas tabelas ficam fora da cópia JSON e não guardam conteúdo de estudantes.

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
- `fila_planilha` guarda só identificadores e o dia de cada envio automático, sem nome de aluno nem dado de planilha; a coluna `sequencia` define a ordem de saída, e `estado`, `proxima_tentativa_em` e `reservado_ate` controlam retentativas e o consumidor único. Itens concluídos saem depois de sete dias; falhos e descartados, depois de trinta.
- `integracoes_planilha` e `sincronizacoes_planilha` separam frequência, saídas e chamadas parciais pela coluna `finalidade`; cada finalidade tem a própria linha de token, esquema e modo completo.
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

A migração `20260930015940_formulario_entradas` acrescenta momento e código/nome do responsável pelo registro como colunas anuláveis. Nenhuma entrada antiga é reescrita. Novos registros exigem momento válido e responsável ativo do catálogo; o nome escolhido é guardado separadamente da autoria autenticada. Cópias JSON antigas continuam aceitas com esses campos ausentes.

A migração `20260930005502_entradas_atrasadas` cria apenas a tabela `entradas_atrasadas`, seus índices e referências. Não altera saídas nem frequências existentes. A chave (aluno, dia) impede repetição; horário e motivo são validados pela aplicação. O registro guarda turma e rótulo de quem registrou, preservados depois de transferência de aluno ou exclusão de conta. A turma é protegida por referência; a autoria é anulável. A cópia JSON inclui entradas e importa por mesclagem, sem sobrescrever. Cópias antigas sem esse campo continuam aceitas.

## Chamada Parcial

`frequencias_parciais` tem unicidade de (aluno, dia), independente de `frequencias` e `faltas`. O aluno usa exclusão em cascata; a turma histórica usa `ON DELETE RESTRICT`. Nome do aluno e rótulo da turma são guardados no registro e não mudam depois de transferência ou renomeação. Autoria e responsável pela confirmação usam `ON DELETE SET NULL`, preservando nomes históricos.

`tipo` aceita `DIA_INTEIRO`, `TURNO` ou `AULAS`. Dia inteiro exige turno nulo e lista de aulas vazia; um turno exige `MANHA` ou `TARDE` e lista de aulas vazia; aulas específicas exigem turno nulo e inteiros distintos entre 1 e 30, em ordem crescente. Observações têm até 300 caracteres. A aplicação valida calendário e data futura; revisão positiva protege salvamento, confirmação e exclusão concorrentes. Corrigir conteúdo incrementa a revisão e limpa a confirmação da Seduc. Confirmar ou reabrir também incrementa a revisão.

A migração acrescenta somente o modelo e a finalidade `PARCIAL`, sem reescrever chamadas normais. A cópia JSON versão 1 inclui o campo opcional `frequenciasParciais`: preserva identidade, nomes históricos, revisão, datas e confirmação. Cópias anteriores continuam válidas. Na importação, qualquer identidade ou par (aluno, dia) já existente impede sobrescrita; divergências e referências ausentes entram na contagem de conflitos. Contas históricas inexistentes ficam nulas e seus nomes são preservados. Conexões OAuth continuam fora da cópia.

A migração `20261005202238_presenca_dia_inteiro` acrescenta somente `DIA_INTEIRO` ao enum existente, sem copiar dados nem remover confirmações. A consulta da Chamada Parcial combina `frequencias`, `alunos_chamada` e `frequencias_parciais`: a personalização prevalece por aluno e dia. A base diária continua nas tabelas originais e não ganha uma linha parcial. Remover a personalização limpa as confirmações do aluno no dia em `alunos_chamada`, exigindo reconferência sem alterar faltas ou revisão da chamada. A cópia JSON versão 1 aceita o novo tipo e continua aceitando arquivos anteriores.

Detalhes na [ADR-034](adr/034-chamada-parcial-e-confirmacao-seduc.md) e no [adendo da ADR-035](adr/035-seduc-na-chamada-normal.md#adendo-2026-10-05).

## Conexões

O runtime da API usa `DATABASE_URL`. O Prisma CLI, o migrador e os scripts administrativos usam `DIRECT_URL` quando essa variável está disponível.

No Supabase, `DATABASE_URL` deve apontar para a Transaction pooler na porta 6543, com `pgbouncer=true` e `sslmode=require`. `DIRECT_URL` deve apontar para a Session pooler na porta 5432, com `sslmode=require`.

O `prisma.config.ts` prioriza `DIRECT_URL`, com fallback para `DATABASE_URL` e uma URL local para permitir `prisma generate` durante o build. O migrador Docker usa a mesma preferência.

O schema é escolhido por `DATABASE_SCHEMA`, que vence, ou pelo parâmetro `schema` das URLs, com padrão `public` quando os dois estão ausentes. O runtime passa o schema explicitamente ao `PrismaPg` e qualifica tabelas nas consultas SQL diretas, sem depender do estado de sessão da Transaction pooler. O migrador Docker e os scripts administrativos configuram `search_path` apenas para o schema selecionado e recusam um schema inexistente; não recorrem a `public` quando um destino explícito está ausente.

O nome escolhido, pela variável ou pela URL, é recusado quando está vazio ou repetido, contém caracteres de controle ou aspas duplas, tem o valor especial `$user` ou ultrapassa 63 bytes.

Produção e Preview podem usar schemas distintos no mesmo database. Cada schema mantém tabelas, contas e histórico `_prisma_migrations` próprios. As credenciais PostgreSQL são independentes do nome do schema e precisam das permissões adequadas. O preparo do Preview está em [deploy.md](deploy.md#preview-em-schema-do-mesmo-banco).

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

Nas consultas SQL manuais, selecione explicitamente o schema do ambiente ou qualifique o nome das tabelas. O parâmetro `schema` das URLs do Prisma não configura clientes como `psql`.

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

Se a URL contiver o parâmetro `schema`, retire esse parâmetro da conexão usada pelo `pg_dump` e pelo `pg_restore`, que não o reconhecem. Para copiar apenas o Preview de um database compartilhado, use `pg_dump --schema=preview` com o nome correspondente; um dump sem filtro inclui os demais schemas. Teste a restauração em outro banco vazio.

A migração `saida_horario` acrescenta `saidas_antecipadas.horario` (`VARCHAR(5)`, `HH:MM`) como coluna anulável. Saídas anteriores ficam sem horário; novas saídas exigem um horário válido. Cópias JSON antigas continuam aceitas sem o campo.

## Confirmação da Seduc na chamada normal

A migração `20261003011539_confirmacao_seduc_chamada` acrescenta confirmação, data, nome e referência do responsável e revisão própria a `alunos_chamada`. As chamadas existentes começam sem confirmação. A chave composta de frequência e aluno mantém a confirmação vinculada à lista histórica, independente da presença ou falta. Remover a conta preserva o nome do responsável, com a referência anulada.

A operação usa transação serializável e confere tanto a revisão da frequência como `revisao_seduc`. Corrigir a frequência invalida apenas os alunos afetados. A revisão e o horário da chamada não mudam ao confirmar a Seduc. A interface de confirmação fica na Chamada Parcial; os dados existentes continuam nesta tabela quando não há personalização. Uma personalização ou outra chamada mais recente usada como base impede confirmar a versão diária anterior. Detalhes na [ADR-035](adr/035-seduc-na-chamada-normal.md).
