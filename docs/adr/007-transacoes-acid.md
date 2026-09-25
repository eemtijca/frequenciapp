# ADR-007: transações serializáveis com repetição automática

## Estado

Aceita.

## Contexto

O salvamento da chamada escreve em duas tabelas (a chamada e suas faltas) e depende da lista atual de alunos da turma. Sem transação, uma falha no meio deixaria a chamada sem faltas ou com faltas de alunos que já mudaram de turma. Com concorrência de dois aparelhos, é preciso garantir que exatamente um salvamento vença e o outro receba conflito claro.

## Decisão

- Toda escrita multi-linha passa por transação interativa com isolamento `Serializable` (`src/infra/transacoes.ts`).
- A validação das faltas contra os alunos ativos da turma acontece dentro da transação, no mesmo snapshot da escrita.
- Conflitos de serialização (P2034) são refeitos automaticamente até três vezes com pausa crescente; ao esgotar, viram conflito 409 com a versão vigente.
- Duplicidades de índice único na corrida (P2002) seguem o mesmo caminho de conflito 409.
- O controle de revisão (concorrência otimista) permanece: `revisao N` atualiza apenas se a versão vigente for N.
- Restrições `ON DELETE RESTRICT` nas relações que não podem ficar órfãs (turmas com alunos ou chamadas, professores com chamadas), e cascata onde a dependência é fraca (sessões, atribuições, faltas).

## Consequências

- Atomicidade, consistência, isolamento e durabilidade garantidos pelo PostgreSQL, com verificação em teste de corrida concorrente (dois salvamentos paralelos: um 200, um 409).
- A camada de aplicação não precisa de bloqueio manual: o banco arbitra e o helper repete.
- Serializable custa mais repetições sob contenção extrema; o volume de uma chamada por professor torna o custo irrelevante.
- Mensagens de erro de integridade são traduzidas em português claro (ADR-009).
