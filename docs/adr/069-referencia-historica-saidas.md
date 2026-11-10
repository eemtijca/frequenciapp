# ADR-069: referência histórica das saídas antecipadas

## Estado

Aceita em 2026-11-10.

## Contexto

A saída antecipada guardava apenas o aluno, o dia, o momento e o motivo. A turma e as aulas eram derivadas da matrícula e da grade vigentes no momento da consulta, então uma transferência ou uma mudança de grade reescrevia o passado. A Chamada Parcial precisa saber quais aulas já tinham terminado no horário da saída, e uma saída retroativa sem retrato não pode inventar essa informação.

## Decisão

- A saída passa a gravar a turma histórica, o nome da turma e um retrato versionado das aulas, com identificador, ordem, início e fim.
- Para o dia corrente, a referência vem da matrícula e da grade vigentes. Para uma data passada, a referência vem da chamada salva do aluno naquele dia, quando ela existe e tem retrato de aulas.
- Sem chamada salva com retrato, a saída retroativa só é criada com `confirmarHistorico: true` e `motivo` de 3 a 200 caracteres. A referência fica `DESCONHECIDA`, a auditoria registra o motivo e a conferência parcial usa a chamada salva ou a grade atual como estimativa sinalizada.
- A consulta de saídas e a Chamada Parcial preferem a referência gravada. Saídas antigas sem referência usam a chamada salva ou a grade atual como estimativa sinalizada.
- O filtro por turma nas listas e relatórios usa `turma_historica_id`, preservando a turma do momento do registro.
- Nenhuma aula é inferida a partir de identificadores de aulas antigas: o retrato guarda os horários completos.

## Alternativas

- Continuar derivando da matrícula atual: reescrevia o histórico após transferência.
- Reconstruir a grade pela chamada apenas com identificadores: não recuperava os horários e podia classificar aulas erradas.
- Recusar toda saída retroativa: impedia a correção legítima de um registro de papel.
- Aceitar retroativo sem referência e sem confirmação: escondia a incerteza e produzia conferência parcial enganosa.

## Consequências

- A migração `l06_referencia_historica_saidas` acrescenta as colunas e é aditiva.
- A saída retroativa sem chamada salva exige confirmação explícita e a conferência parcial é uma estimativa sinalizada.
- A interface de Saídas mostra o diálogo de motivo quando a referência não pode ser comprovada.
- A conferência parcial continua exigindo assinatura e revisão vigentes; a estimativa aparece na observação.
- O backup inclui os novos campos; a restauração preserva o retrato.
- Mudanças futuras na grade não alteram saídas já registradas.
