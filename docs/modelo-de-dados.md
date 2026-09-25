# Modelo de dados

Entidades, invariantes e derivações. A coordenação faz uma frequência por turma e dia, compartilhada pela equipe, com todos os presentes por padrão e apenas as faltas registradas por aula. A administração cuida das contas e dos cadastros escolares.

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

A unicidade de (turma, dia) faz o banco rejeitar duplicatas: existe **uma frequência por turma e dia**, compartilhada por toda a coordenação. A revisão implementa concorrência otimista entre aparelhos dentro de uma transação serializável (ADR-007), e a autoria sobrevive à exclusão da conta.

## Falta (falta)

| Campo        | Tipo | Observação          |
| ------------ | ---- | ------------------- |
| frequenciaId | uuid | Frequência do dia.  |
| alunoId      | uuid | Aluno ausente.      |
| horarioId    | uuid | Aula em que faltou. |

A presença não gera linha: quem não tem falta na frequência do dia esteve presente na aula. Uma frequência salva sem faltas significa todos presentes, que é o caso comum. O aluno que sai no meio da aula fica com falta apenas nas aulas que perdeu.

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

A marca de um aluno em um dia segue três regras, nesta ordem:

1. **Falta** quando existe registro de falta em qualquer frequência do dia. A regra vale mesmo depois de o aluno mudar de turma.
2. **Presente** quando a turma atual do aluno teve frequência naquele dia e não há falta dele.
3. **Vazia** quando a turma não teve frequência; células vazias na grade significam ausência de frequência, não presença.

A implementação pura está em `src/domain/frequencia.ts` e é compartilhada pelo servidor e pela interface, para manter a grade do mês e o Histórico coerentes com a frequência.

## Grade por turma de origem

A consulta de grade monta linhas com os alunos ativos da turma de origem escolhida, ordenados pela ordem de apresentação, e colunas com os dias do mês. Cada linha carrega o total de dias com falta e o total de dias com frequência. A primeira coluna fica fixa durante a rolagem horizontal.
