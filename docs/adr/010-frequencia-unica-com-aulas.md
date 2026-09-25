# ADR-010: frequência única por turma e dia com faltas por aula

## Estado

Aceita.

## Contexto

A coordenação faz uma chamada por dia e precisa registrar alunos que saem no meio da aula. O modelo anterior guardava uma frequência por professor, turma e dia, com faltas no dia inteiro, o que não representava a saída parcial nem a chamada compartilhada. O BuscApp, usado como referência, registra ausências por aluno e período em uma mesma chamada, com todos presentes por padrão.

## Decisão

- Uma frequência por turma e dia, com revisão e autoria (criador e último editor anuláveis).
- Cada falta aponta também para a aula, com chave (frequência, aluno, aula).
- A grade de aulas é por turma, com ordem, janela `HH:MM`, dias da semana e situação; toda turma nasce com a aula padrão que cobre o dia.
- O salvamento aceita lista simples de alunos (falta em todas as aulas) ou lista com aulas específicas.
- A presença continua implícita: quem não tem falta na aula esteve presente.

## Consequências

- O aluno que sai no meio da aula fica ausente apenas nas aulas perdidas.
- A chamada é compartilhada: duas pessoas da coordenação editam o mesmo registro, com conflito de revisão.
- A aula com faltas registradas não é excluída, apenas desativada.
- A grade do mês distingue falta integral de presença parcial em evolução futura.
