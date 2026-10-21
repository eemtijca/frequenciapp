# ADR-051: ordem das turmas no almoço

## Estado

Aceita.

## Contexto

A aba Horários mostra a grade de aulas, mas não a ordem em que as turmas vão ao almoço. A coordenação precisava consultar essa ordem por dia da semana, e a administração precisava mantê-la sem duplicar a grade. A ordem é uma configuração escolar, não uma aula, e pode ter horário próprio.

## Decisão

- A ordem fica na tabela `ordens_almoco`, com chave composta (`dia_semana`, `turma_id`), unicidade de (`dia_semana`, `posicao`), dia de 1 (segunda) a 6 (sábado), posição a partir de 1, horário opcional em `HH:MM` e exclusão em cascata com a turma.
- A leitura `GET /api/ordem-almoco` vale para qualquer sessão e devolve os seis dias, com lista vazia quando não há definição.
- A escrita `PUT /api/ordem-almoco/{dia}` substitui a ordem do dia inteiro, exige administração, origem confiável e auditoria. Lista vazia limpa o dia; turma repetida, horário inválido ou horário fora da ordem são recusados.
- A Gestão ordena as turmas e define o horário opcional; a aba Horários mostra a ordem do dia consultado e relê quando a Gestão altera.
- A cópia JSON exporta a ordem e a importação mescla por dia sem sobrescrever: dia vazio recebe a cópia, dia já definido é comparado e divergência vira conflito.

## Alternativas

- Guardar a ordem na grade de horários: misturaria aula e intervalo, e a exclusão de uma aula mudaria a ordem do almoço.
- Guardar uma lista JSON em `configuracoes`: perderia a integridade referencial com a turma e a exclusão em cascata.

## Consequências

- Uma tabela, duas rotas e uma seção na Gestão a mais para manter.
- A ordem é consultiva: não altera a grade, as faltas ou a frequência.
- A migração é aditiva e não reescreve dados existentes; cópias antigas continuam válidas.
