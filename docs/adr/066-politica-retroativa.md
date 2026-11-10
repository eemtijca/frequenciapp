# ADR-066: política de chamada retroativa com confirmação e auditoria

- Status: aceita
- Data: 2026-11-09

## Contexto

A chamada guarda a lista de alunos no primeiro salvamento para que transferências posteriores não reescrevam o histórico. Quando a primeira gravação acontece em uma data passada, o sistema não tem retrato da composição daquele dia. A tentativa anterior de resolver o problema recusava toda chamada retroativa sem lista comprovada, o que impedia a correção legítima de um diário de papel e não oferecia caminho para a equipe.

A escola também pode ter mais de uma chamada do mesmo aluno no dia, quando uma transferência acontece no meio do período. A escolha da chamada de referência não pode depender da última edição de outro aluno, e a classificação de faltas precisa usar o retrato de aulas da chamada, não a grade vigente.

## Decisão

- A chamada retroativa é permitida. A composição atual é comparada com a data antes de criar a frequência: turma criada depois da data, aluno cadastrado depois, aluno em outro vínculo sem desistência registrada ou situação desconhecida tornam a composição não comprovada.
- Quando a composição é compatível, a gravação segue sem confirmação adicional. Quando não é, a API responde 409 com o código `CONFIRMACAO_HISTORICA_NECESSARIA` e uma mensagem em português que pede a confirmação e o motivo.
- A confirmação usa os campos opcionais `confirmarHistorico` e `motivo`. O motivo é obrigatório com a confirmação, tem de 3 a 200 caracteres e não é aceito sem ela. A validação acontece na entrada da API com zod.
- Com a confirmação explícita, a mesma transação que cria a frequência grava uma linha em `confirmacoes_historicas`, com tipo `CHAMADA_RETROATIVA`, dia, turma, autor, nome do autor, motivo e a lista de alunos usada. O registro é único por frequência e tipo, então uma repetição não duplica a auditoria.
- A chamada existente prevalece. Se já houver frequência na turma e no dia, a lista gravada é o retrato da data e a edição não consulta a composição atual nem preenche o retrato de aulas ausente.
- A base da lista histórica é escolhida por `criadoEm DESC, id ASC` em todos os consumidores. A criação não muda quando outro aluno é editado, e o identificador desempata chamadas criadas no mesmo instante.
- A classificação de faltas usa o retrato de aulas da chamada. Falta fora do retrato continua integral, falta em parte das aulas registradas vira S e falta em todas vira F ou FJ. Sem retrato, a leitura é explicitamente uma estimativa pela grade atual; ausência de retrato não é tratada como zero.
- A aula referenciada por `aulas_chamada` não pode ser excluída. A FK passa a usar `ON DELETE RESTRICT`, e a aplicação recusa a exclusão com faltas ou com retrato de chamada, orientando a desativação.
- A migração antiga que reconstruiu listas não é reescrita. O diagnóstico em `scripts/banco/diagnosticar-listas-historicas.mjs` lê um extrato JSON autorizado, não abre banco e não corrige dados. Ele separa inconsistência estrutural de incerteza histórica; divergência cadastral é suspeita, nunca prova de matrícula.

## Alternativas

- Recusar toda chamada retroativa sem retrato: impedia a correção legítima de uma data passada e não deixava registro para a escola resolver a pendência.
- Preencher a lista histórica pela turma atual sem confirmação: inventava presença e escondia transferências.
- Reconstruir o retrato de aulas ausente pela grade atual: mudava a classificação de chamadas antigas depois de alterações na grade.
- Ordenar a base por `atualizadoEm`: uma edição de outro aluno trocava a chamada de referência sem relação com a matrícula.
- Excluir a aula com retrato em cascata: apagava o histórico de presença sem aviso.

## Consequências

- A equipe consegue lançar uma chamada de uma data passada com motivo registrado e lista preservada, sem sobrescrever chamadas existentes.
- A confirmação é recusada quando a composição pode ser comprovada, e a confirmação explícita sempre deixa auditoria. O motivo não substitui a conferência da lista.
- A auditoria cresce com o uso retroativo e é removida em cascata somente quando a própria frequência é removida. A autoria sobrevive à exclusão da conta, porque o nome é guardado no registro.
- A ordem estável muda a base escolhida em relação ao comportamento anterior, que preferia a chamada atualizada por último. A mudança é intencional e coberta por teste de transferência no mesmo dia com dois alunos.
- A interface da Chamada ainda pode exibir a grade atual quando a chamada antiga não tem retrato. O rótulo de estimativa é aplicado nas listas de conferência; a tela da Chamada precisa do mesmo aviso em uma alteração de interface própria.
- O diagnóstico não recupera listas já apagadas nem prova matrícula ausente. Ele apenas indica onde a composição precisa de conferência humana.
- A comparação automática cobre o vínculo atual e a turma de origem. Uma transferência em mais de uma etapa, um aluno excluído do cadastro ou uma matrícula sem registro anterior podem não ser detectados; nesses casos, a conferência da lista e a confirmação explícita continuam sendo a proteção prevista.
