# Modelo de dados

Entidades, invariantes e derivações. O modelo mantém uma frequência por dia e turma, com todos os presentes por padrão e apenas as faltas registradas, sobre uma estrutura escolar administrada com séries, turmas, alunos e professores com atribuições.

## Usuário (usuario)

| Campo        | Tipo     | Observação                                         |
| ------------ | -------- | -------------------------------------------------- |
| id           | uuid     | Gerado pelo banco.                                 |
| email        | texto    | Único sem diferenciar caixa, por índice funcional. |
| senhaHash    | texto    | scrypt com sal e formato versionado.               |
| nome         | texto    | Nome de tratamento usado na saudação.              |
| papel        | enum     | `ADMIN` ou `PROFESSOR`.                            |
| ativo        | booleano | Desativado perde o acesso na próxima requisição.   |
| criadoEm     | data     |                                                    |
| atualizadoEm | data     |                                                    |

Não há telefone, CPF, matrícula ou qualquer outro dado pessoal. O administrador inicial é criado pelo comando `criar-admin` com credenciais do ambiente. O restante das contas nasce na área de Gestão.

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

## Atribuição (atribuicao)

| Campo       | Tipo | Observação                                 |
| ----------- | ---- | ------------------------------------------ |
| professorId | uuid | Professor autorizado a registrar na turma. |
| turmaId     | uuid | Turma atribuída.                           |
| criadoEm    | data |                                            |

A chave primária é o par (professor, turma). O administrador define o conjunto completo em uma única transação. Professores veem e registram somente as turmas atribuídas; administradores veem tudo.

## Aluno (aluno)

| Campo           | Tipo     | Observação                                             |
| --------------- | -------- | ------------------------------------------------------ |
| id              | uuid     | Gerado pelo banco.                                     |
| turmaId         | uuid     | Turma atual, de onde parte a frequência diária.        |
| turmaOriginalId | uuid     | Turma de origem para a consulta agrupada.              |
| nome            | texto    | Nome do aluno, de 2 a 100 caracteres.                  |
| ordem           | inteiro  | Ordem de apresentação dentro da turma atual.           |
| ativo           | booleano | Desativado sai das frequências e preserva o histórico. |
| criadoEm        | data     |                                                        |

A origem nasce igual à turma atual e muda quando o administrador transfere o aluno. Nomes de alunos são dados pessoais mínimos e necessários à finalidade de frequência, conforme [lgpd.md](lgpd.md). A exclusão apaga o aluno e as faltas dele; a desativação apenas o retira das frequências futuras.

## Frequência (frequencia)

| Campo        | Tipo    | Observação                               |
| ------------ | ------- | ---------------------------------------- |
| id           | uuid    | Gerado pelo banco.                       |
| professorId  | uuid    | Quem registrou; a restrição preserva.    |
| turmaId      | uuid    | Turma registrada.                        |
| dia          | date    | Dia civil do professor.                  |
| revisao      | inteiro | 1 na criação; cresce a cada atualização. |
| atualizadoEm | data    | Momento do último salvamento.            |

A unicidade de (professor, turma, dia) faz o banco rejeitar duplicatas. A revisão implementa concorrência otimista entre aparelhos dentro de uma transação serializável (ADR-007).

## Falta (falta)

| Campo        | Tipo | Observação         |
| ------------ | ---- | ------------------ |
| frequenciaId | uuid | Frequência do dia. |
| alunoId      | uuid | Aluno ausente.     |

A presença não gera linha: quem não tem falta na frequência do dia esteve presente. Uma frequência salva sem faltas significa todos presentes, que é o caso comum e o motivo de o salvamento existir mesmo sem marcações.

## Auditoria (auditoria)

| Campo     | Tipo  | Observação                                     |
| --------- | ----- | ---------------------------------------------- |
| id        | uuid  | Gerado pelo banco.                             |
| usuarioId | uuid  | Quem agiu; fica nulo se a conta for excluída.  |
| acao      | texto | Nome curto da ação, por exemplo `serie.criar`. |
| alvo      | texto | Descrição curta sem dados pessoais de alunos.  |
| criadoEm  | data  |                                                |

A trilha registra ações administrativas e trocas de senha sempre na mesma transação da ação. Não registra nomes de alunos nem conteúdo de frequências, apenas quem fez, o quê e quando.

## Derivação da marca

A marca de um aluno em um dia segue três regras, nesta ordem:

1. **Falta** quando existe registro de falta em qualquer frequência do professor naquele dia. A regra vale mesmo depois de o aluno mudar de turma.
2. **Presente** quando a turma atual do aluno teve frequência naquele dia e não há falta dele.
3. **Vazia** quando a turma não teve frequência; células vazias na grade significam ausência de frequência, não presença.

A implementação pura está em `src/domain/frequencia.ts` e é compartilhada pelo servidor e pela interface, para manter a grade de Originais e o Histórico coerentes com a frequência.

## Grade por turma de origem

A consulta Originais monta linhas com os alunos ativos da turma de origem escolhida, ordenados pela ordem de apresentação, e colunas com os dias do mês. Cada linha carrega o total de faltas e o total de frequências do aluno no mês. A primeira coluna fica fixa durante a rolagem horizontal.
