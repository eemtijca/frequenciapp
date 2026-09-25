# Modelo de dados

Entidades, invariantes e derivações. A coordenação faz uma chamada por turma e dia, compartilhada pela equipe, com todos os presentes por padrão e apenas as faltas registradas. Cada falta pode ter um código de justificativa (FJ). A saída antecipada é um registro separado da chamada, com momento, justificativa e responsável pela liberação. A administração cuida das contas, dos cadastros e dos recursos ligados.

## Usuário (usuario)

| Campo        | Tipo     | Observação                                         |
| ------------ | -------- | -------------------------------------------------- |
| id           | uuid     | Gerado pelo banco.                                 |
| email        | texto    | Único sem diferenciar caixa, por índice funcional. |
| senhaHash    | texto    | scrypt com sal e formato versionado.               |
| nome         | texto    | Nome de tratamento usado na saudação.              |
| papel        | enum     | `ADMIN` ou `COORDENACAO`.                          |
| ativo        | booleano | Desativado perde o acesso na próxima requisição.   |
| criadoEm     | data     |                                                    |
| atualizadoEm | data     |                                                    |

Não há telefone, CPF, matrícula ou qualquer outro dado pessoal. A administração configura tudo e a coordenação registra a frequência. O administrador inicial é criado pelo comando `criar-admin` com credenciais do ambiente; as contas de coordenação nascem pelo comando `criar-coordenacao` ou pela área de Gestão.

Invariantes de segurança da camada de aplicação: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta e desativar uma conta encerra as sessões dela na hora.

## Série (serie)

| Campo    | Tipo    | Observação                                         |
| -------- | ------- | -------------------------------------------------- |
| id       | uuid    | Gerado pelo banco.                                 |
| nome     | texto   | Único sem diferenciar caixa, por índice funcional. |
| ordem    | inteiro | Ordem de exibição, com verificação de positivos.   |
| criadoEm | data    |                                                    |

A série organiza as turmas, por exemplo "1º ano". A exclusão é barrada enquanto houver turmas.

## Turma (turma)

| Campo    | Tipo  | Observação                                     |
| -------- | ----- | ---------------------------------------------- |
| id       | uuid  | Gerado pelo banco.                             |
| serieId  | uuid  | Série à qual pertence; restrição impede órfão. |
| nome     | texto | Letra ou rótulo; único por série sem caixa.    |
| criadoEm | data  |                                                |

O rótulo de exibição é composto por série e nome, por exemplo "1º ano A". A exclusão é barrada quando ainda há alunos ou frequências. O caminho adequado é mover os alunos e preservar o histórico.

## Aluno (aluno)

| Campo           | Tipo     | Observação                                                     |
| --------------- | -------- | -------------------------------------------------------------- |
| id              | uuid     | Gerado pelo banco.                                             |
| turmaId         | uuid     | Turma atual, de onde parte a frequência diária.                |
| turmaOriginalId | uuid     | Turma de origem para a consulta agrupada.                      |
| nome            | texto    | Nome do aluno, de 2 a 100 caracteres.                          |
| ordem           | inteiro  | Ordem de apresentação dentro da turma atual.                   |
| ativo           | booleano | Desativado sai das frequências futuras e preserva o histórico. |
| criadoEm        | data     |                                                                |

A origem nasce igual à turma atual e muda quando a administração transfere o aluno. Nomes de alunos são dados pessoais mínimos e necessários à finalidade de frequência, conforme [lgpd.md](lgpd.md). A exclusão apaga o aluno e as faltas dele; a desativação apenas o retira das frequências futuras.

## Aula (horario)

| Campo      | Tipo     | Observação                                                  |
| ---------- | -------- | ----------------------------------------------------------- |
| id         | uuid     | Gerado pelo banco.                                          |
| turmaId    | uuid     | Turma dona da grade; cascata na exclusão da turma.          |
| ordem      | inteiro  | Ordem da aula no dia, positiva e única por turma.           |
| inicio     | texto    | Horário inicial `HH:MM`.                                    |
| fim        | texto    | Horário final `HH:MM`, posterior ao início.                 |
| diasSemana | inteiro  | Dias ISO em que a aula acontece (1 é segunda, 7 é domingo). |
| ativo      | booleano | Aula desativada sai das próximas chamadas.                  |
| criadoEm   | data     |                                                             |

Toda turma nasce com uma aula padrão (ordem 1, 00:00 às 23:59, todos os dias), que a administração ajusta quando quiser. A aula com faltas registradas não é excluída, apenas desativada.

## Frequência (frequencia)

| Campo           | Tipo    | Observação                                        |
| --------------- | ------- | ------------------------------------------------- |
| id              | uuid    | Gerado pelo banco.                                |
| turmaId         | uuid    | Turma registrada; exclusão barrada com histórico. |
| dia             | date    | Dia civil da escola.                              |
| revisao         | inteiro | 1 na criação; cresce a cada atualização.          |
| criadoPorId     | uuid    | Quem criou; anulável quando a conta é excluída.   |
| atualizadoPorId | uuid    | Quem salvou por último; anulável.                 |
| atualizadoEm    | data    | Momento do último salvamento.                     |

A unicidade de (turma, dia) faz o banco rejeitar duplicatas: existe **uma frequência por turma e dia**, compartilhada por toda a coordenação. A revisão implementa concorrência otimista entre dispositivos dentro de uma transação serializável (ADR-007), e a autoria sobrevive à exclusão da conta.

## Falta (falta)

| Campo         | Tipo  | Observação                                                    |
| ------------- | ----- | ------------------------------------------------------------- |
| frequenciaId  | uuid  | Frequência do dia.                                            |
| alunoId       | uuid  | Aluno ausente.                                                |
| horarioId     | uuid  | Aula em que faltou.                                           |
| justificativa | texto | Código do catálogo; nulo quando a falta é simples.            |
| observacao    | texto | Observação opcional, usada principalmente no código "Outros". |

A presença não gera linha: quem não tem falta na frequência do dia esteve presente na aula. Uma frequência salva sem faltas significa todos presentes, que é o caso comum. A falta com justificativa vira **FJ**; sem justificativa permanece **F**. No modo por aula, o aluno que sai no meio do dia fica com falta apenas nas aulas que perdeu, e a marca vira **S** quando a falta cobre parte das aulas. O catálogo de justificativas vem da tabela `justificativas`, é editável na Gestão e vale para a falta e para a saída; o código é estável e o rótulo pode mudar.

## Saída antecipada (saida_antecipada)

| Campo         | Tipo  | Observação                                        |
| ------------- | ----- | ------------------------------------------------- |
| id            | uuid  | Gerado pelo banco.                                |
| alunoId       | uuid  | Aluno que saiu; cascata na exclusão do aluno.     |
| dia           | date  | Dia civil da saída.                               |
| momento       | texto | Código do momento: aulas, intervalos e almoço.    |
| justificativa | texto | Código do catálogo.                               |
| observacao    | texto | Observação opcional.                              |
| liberadoPorId | uuid  | Quem liberou; anulável quando a conta é excluída. |
| criadoPorId   | uuid  | Quem registrou; anulável.                         |
| criadoEm      | data  | Momento do registro.                              |

A unicidade de (aluno, dia) impede dois registros no mesmo dia; a correção é remover o registro com auditoria. A saída não altera a presença nem a falta do dia: é uma informação separada, usada nos relatórios e nos indicadores.

## Configuração (configuracao)

| Campo             | Tipo     | Observação                                                 |
| ----------------- | -------- | ---------------------------------------------------------- |
| id                | texto    | Linha única `principal`, criada na migração.               |
| frequenciaPorAula | booleano | Liga a chamada por aula, os chips de aulas e a marca S.    |
| saidaAntecipada   | booleano | Mostra a área de saídas antecipadas e o relatório semanal. |
| atualizadoEm      | data     | Momento da última alteração.                               |
| atualizadoPorId   | uuid     | Quem alterou; anulável.                                    |

Os recursos são ligados e desligados na Gestão, com auditoria. Desligar não apaga dados: a chamada por aula volta a valer quando religada, e as saídas permanecem consultáveis pelos relatórios.

## Justificativa (justificativa)

| Campo    | Tipo     | Observação                                                         |
| -------- | -------- | ------------------------------------------------------------------ |
| id       | uuid     | Gerado pelo banco.                                                 |
| codigo   | texto    | Código estável, único sem diferenciar caixa; até 10 caracteres.    |
| rotulo   | texto    | Nome exibido, de 2 a 60 caracteres; editável.                      |
| ativo    | booleano | Desativada sai das opções novas e continua resolvendo o histórico. |
| criadoEm | data     |                                                                    |

O catálogo nasce com os 12 códigos do aplicativo de referência e é editado em Gestão, Configurações, Justificativas. A exclusão é bloqueada quando há faltas ou saídas usando o código; o caminho é desativar. A lista aparece em ordem alfabética pelo rótulo.

## Auditoria (auditoria)

| Campo     | Tipo  | Observação                                     |
| --------- | ----- | ---------------------------------------------- |
| id        | uuid  | Gerado pelo banco.                             |
| usuarioId | uuid  | Quem agiu; fica nulo se a conta for excluída.  |
| acao      | texto | Nome curto da ação, por exemplo `serie.criar`. |
| alvo      | texto | Referência sem dados pessoais de alunos.       |
| criadoEm  | data  |                                                |

A trilha registra ações administrativas e trocas de senha sempre na mesma transação da ação. Não registra nomes de alunos nem conteúdo de frequências, apenas quem fez, o quê e quando.

## Derivação da marca

A marca de um aluno em um dia considera a grade de aulas da turma e as faltas registradas:

1. **FJ** quando todas as faltas do aluno no dia têm justificativa do catálogo. Conta como ausência no total (F + FJ).
2. **F** quando o aluno falta em todas as aulas do dia sem justificativa, ou quando a falta está registrada em aula que saiu da grade. A falta prevalece mesmo depois de o aluno mudar de turma; na dúvida de transferência, prevalece a confirmação mais recente por aluno e dia.
3. **S** (presença parcial) quando o aluno falta em parte das aulas e esteve presente no restante, caso de quem saiu antes do fim ou chegou depois. A marca existe apenas no modo por aula.
4. **P** quando a turma atual teve frequência naquele dia e não há falta do aluno.
5. **Vazia** quando a turma não teve frequência; células vazias na grade significam ausência de frequência, não presença.

A implementação pura está em `src/domain/frequencia.ts` e é compartilhada pelo servidor e pela interface, para manter a grade, o histórico e o painel coerentes com a chamada.

## Grade por turma de origem

A consulta de grade monta linhas com os alunos ativos da turma de origem escolhida, ordenados pela ordem de apresentação, e colunas com os dias do período: um dia, uma semana de aula (segunda a sexta), um período personalizado ou o mês, com limite de 366 dias. Cada linha carrega o total de dias com falta, com falta justificada, com presença parcial e com frequência, além do acumulado de F + FJ de todo o histórico. A primeira coluna fica fixa durante a rolagem horizontal. Uma saída antecipada no dia fica registrada no relatório por aluno e nas estatísticas da área de saídas, sem alterar a marca.
