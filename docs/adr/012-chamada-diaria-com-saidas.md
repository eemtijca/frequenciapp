# ADR-012: chamada diária com faltas justificadas, saídas antecipadas e recursos opcionais

## Estado

Aceita. Convive com a [ADR-010](010-frequencia-unica-com-aulas.md), que continua válida quando o recurso de chamada por aula está ligado.

## Contexto

A coordenação usa o aplicativo para uma chamada única diária, no modelo do aplicativo de referência: uma frequência por turma e dia, todos presentes por padrão, com falta simples ou falta justificada. A saída do aluno mais cedo é um registro separado da chamada, com momento, justificativa e responsável pela liberação. Ao mesmo tempo, a base de aulas já construída precisa continuar viva para quando o registro por aula for usado, sem reescrever o domínio.

## Decisão

- A chamada do dia grava falta simples (F) ou falta justificada (FJ), com um código do catálogo único de justificativas, usado também na saída antecipada.
- A saída antecipada vira a tabela `saidas_antecipadas`, com aluno, dia, momento, justificativa, observação, responsável pela liberação e autoria; uma por aluno e dia, com remoção para correção.
- O momento da saída usa a lista da escola: 1ª a 9ª aula, 1º intervalo, 2º intervalo e Almoço.
- A tabela `configuracoes` controla recursos: `frequenciaPorAula` (padrão desligado) e `saidaAntecipada` (padrão ligado). Trocar o modo não remove dados.
- O domínio deriva P, F, FJ e S (parcial, apenas no modo por aula) e concentra o catálogo, os momentos e os cálculos de acumulado.
- As regras do aplicativo de referência passam a valer: turma de origem nas agregações, última confirmação por aluno e dia em transferências e presença nunca inventada em dia sem chamada.

## Alternativas descartadas

- Substituir a tabela `faltas` por uma marca por aluno e dia: apagaria o histórico por aula e impediria o modo por aula sem uma nova migração estrutural.
- Justificativa como texto livre: dificultaria relatórios e agregações; o catálogo com código é estável e traduzível.
- Saída antecipada alterando a presença do dia: contraria a orientação de que o registro é separado da chamada.

## Consequências

- A chamada passa a somar F e FJ nos indicadores, e o acumulado por aluno separa os dois.
- A saída antecipada tem relatório semanal próprio, com filtro de duas ou mais.
- O modo por aula continua disponível e testado; a Gestão liga e desliga sem perder dados.
- A frequência continua única por turma e dia, com revisão e conflito, como na ADR-010.
