# Modelo de dados

Entidades, invariantes e derivações. O modelo serve ao fluxo essencial do aplicativo original (uma chamada por dia e turma, todos presentes por padrão e apenas as faltas registradas) sobre uma estrutura escolar administrada: séries, turmas, alunos e professores com atribuições.

## Usuário (usuario)

| Campo        | Tipo     | Observação                                            |
| ------------ | -------- | ----------------------------------------------------- |
| id           | uuid     | Gerado pelo banco.                                    |
| email        | texto    | Único sem diferenciar caixa (índice funcional).       |
| senhaHash    | texto    | scrypt com sal, formato próprio.                      |
| nome         | texto    | Nome de tratamento usado na saudação.                 |
| papel        | enum     | `ADMIN` (acesso root de configuração) ou `PROFESSOR`. |
| ativo        | booleano | Desativado perde o acesso na próxima requisição.      |
| criadoEm     | data     |                                                       |
| atualizadoEm | data     |                                                       |

Não há telefone, CPF, matrícula ou qualquer outro dado pessoal. O administrador inicial é criado pelo comando `criar-admin` com credenciais do `.env`; o restante das contas nasce na área de Gestão (ADR-005 e ADR-006).

Invariantes de segurança da camada de aplicação: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta, e desativar uma conta encerra as sessões dela na hora.

## Série (serie)

| Campo    | Tipo    | Observação                                       |
| -------- | ------- | ------------------------------------------------ |
| id       | uuid    | Gerado pelo banco.                               |
| nome     | texto   | Único sem diferenciar caixa (índice funcional).  |
| ordem    | inteiro | Ordem de exibição, com verificação de positivos. |
| criadoEm | data    |                                                  |

A série organiza as turmas (por exemplo, "1º ano"). A exclusão é barrada enquanto houver turmas.

## Turma (turma)

| Campo    | Tipo  | Observação                                     |
| -------- | ----- | ---------------------------------------------- |
| id       | uuid  | Gerado pelo banco.                             |
| serieId  | uuid  | Série à qual pertence; restrição impede órfão. |
| nome     | texto | Letra ou rótulo; único por série sem caixa.    |
| criadoEm | data  |                                                |

O rótulo de exibição é composto: série + nome, por exemplo "1º ano A". A exclusão é barrada quando ainda há alunos ou chamadas; o caminho certo é mover os alunos e preservar o histórico.

## Atribuição (atribuicao)

| Campo       | Tipo | Observação                             |
| ----------- | ---- | -------------------------------------- |
| professorId | uuid | Professor autorizado a chamar a turma. |
| turmaId     | uuid | Turma atribuída.                       |
| criadoEm    | data |                                        |

A chave primária é o par (professor, turma). O administrador define o conjunto completo em uma única chamada, e a troca acontece em transação. Professores veem e chamam apenas as turmas atribuídas; administradores veem tudo.

## Aluno (aluno)

| Campo           | Tipo     | Observação                                        |
| --------------- | -------- | ------------------------------------------------- |
| id              | uuid     | Gerado pelo banco.                                |
| turmaId         | uuid     | Turma atual, de onde parte a chamada diária.      |
| turmaOriginalId | uuid     | Turma de origem para a consulta agrupada.         |
| nome            | texto    | Nome de chamada, 2 a 100 caracteres.              |
| ordem           | inteiro  | Ordem de chamada dentro da turma atual.           |
| ativo           | booleano | Desativado sai da chamada e preserva o histórico. |
| criadoEm        | data     |                                                   |

A origem nasce igual à turma atual e muda apenas quando o administrador transfere o aluno. Nomes de alunos são dados pessoais mínimos e necessários à finalidade de frequência (ver [lgpd.md](lgpd.md)). A exclusão apaga o aluno e as faltas dele; a desativação apenas o retira das chamadas futuras.

## Chamada (chamada)

| Campo        | Tipo    | Observação                               |
| ------------ | ------- | ---------------------------------------- |
| id           | uuid    | Gerado pelo banco.                       |
| professorId  | uuid    | Quem registrou; restrição preserva.      |
| turmaId      | uuid    | Turma chamada.                           |
| dia          | date    | Dia civil do professor.                  |
| revisao      | inteiro | 1 na criação; cresce a cada atualização. |
| atualizadoEm | data    | Momento do último salvamento.            |

Unicidade de (professor, turma, dia): o banco rejeita duplicatas e o fluxo de salvamento transforma a rejeição em conflito 409 com a versão vigente. A revisão implementa concorrência otimista entre aparelhos dentro de transação serializável (ADR-007).

## Falta (falta)

| Campo     | Tipo | Observação      |
| --------- | ---- | --------------- |
| chamadaId | uuid | Chamada do dia. |
| alunoId   | uuid | Aluno ausente.  |

A presença não gera linha: quem não tem falta na chamada do dia esteve presente. Uma chamada salva sem faltas significa todos presentes, que é o caso comum e o motivo de o salvamento existir mesmo sem marcações.

## Auditoria (auditoria)

| Campo     | Tipo  | Observação                                     |
| --------- | ----- | ---------------------------------------------- |
| id        | uuid  | Gerado pelo banco.                             |
| usuarioId | uuid  | Quem agiu; fica nulo se a conta for excluída.  |
| acao      | texto | Nome curto da ação (por exemplo, serie.criar). |
| alvo      | texto | Descrição curta sem dados pessoais de alunos.  |
| criadoEm  | data  |                                                |

A trilha registra ações administrativas e trocas de senha, sempre na mesma transação da ação. Não registra nomes de alunos nem conteúdo de chamadas: apenas quem fez, o quê e quando.

## Derivação da marca

A marca de um aluno em um dia segue três regras, na ordem:

1. **Falta** quando existe registro de falta em qualquer chamada do professor naquele dia. A regra vale mesmo depois de o aluno mudar de turma: a ausência registrada continua contando.
2. **Presente** quando a turma atual do aluno teve chamada naquele dia e não há falta dele.
3. **Vazia** quando a turma não foi chamada; células vazias na grade significam ausência de chamada, não presença.

A implementação pura está em `src/domain/frequencia.ts` e é compartilhada pelo servidor e pela interface, o que mantém a grade de Originais e o Histórico coerentes com a Chamada.

## Grade por turma de origem

A consulta Originais monta linhas com os alunos ativos da turma de origem escolhida, ordenados pela ordem de chamada, e colunas com os dias do mês. Cada linha carrega o total de faltas e o total de chamadas do aluno no mês. A primeira coluna fica fixa durante a rolagem horizontal.
