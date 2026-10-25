# ADR-055: saídas antecipadas na Chamada Parcial

## Estado

Aceita.

## Contexto

Repetir saídas na Chamada Parcial cria divergências e trabalho manual. É necessário incluir o histórico e manter a confirmação na SEDUC separada do cadastro da saída.

## Decisão

Projetar a saída como item `SAIDA` na consulta e na planilha da Chamada Parcial. O ajuste manual por aluno e dia prevalece; a saída prevalece sobre a chamada normal. A consulta não grava duplicatas. Remover a saída remove sua projeção e preserva ajustes independentes.

Contar apenas aulas encerradas até o horário registrado, excluindo faltas já salvas. Usar a turma e o conjunto de aulas da chamada salva mais recente do aluno no dia, quando disponíveis; nos demais casos, usar a grade vigente. Saídas antigas sem horário, sem grade válida, em feriados ou domingos exigem conferência. Zero aulas concluídas é diferente de horário desconhecido. A aula em andamento não conta como concluída.

A saída guarda a revisão, data, responsável e assinatura da conferência manual. O servidor confere novamente a origem e as aulas dentro de transação serializável; assinaturas ou revisões desatualizadas respondem 409. Mudanças da base invalidam a confirmação exibida. Criar, alterar ou remover uma personalização invalida a confirmação antiga da saída. A cópia JSON preserva os campos novos e aceita cópias antigas sem apagar a confirmação existente.

## Alternativas

Duplicar fisicamente as saídas em frequências parciais exigiria migrar o histórico e manter dois registros sincronizados. Reusar a confirmação da chamada normal confirmaria fontes diferentes com uma única ação.

## Consequências

O histórico aparece automaticamente, com a mesma edição e os mesmos filtros da Chamada Parcial. Confirmar significa conferir um lançamento manual, sem integração direta com a SEDUC. A chamada normal e seus relatórios continuam com as marcas registradas pela equipe.

Sem retrato histórico dos horários de início e fim, uma edição da grade pode alterar as aulas calculadas para uma saída antiga. A assinatura exige nova conferência e a equipe pode salvar uma personalização para fixar as aulas corretas. Não se infere atraso ou retorno do aluno a partir da saída.
