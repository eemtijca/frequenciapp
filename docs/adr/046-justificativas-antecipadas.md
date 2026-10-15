# ADR-046: justificativas antecipadas na Chamada Parcial

## Estado

Aceita.

## Contexto

A equipe precisa registrar uma justificativa que cobre o dia atual e dias futuros, sem antecipar presenças da turma e sem duplicar o catálogo de motivos. Presenças personalizadas e a chamada diária têm revisões e confirmações individuais na SEDUC.

## Decisão

Estender o registro parcial com o tipo JUSTIFICADA e o código do catálogo existente. Somente esse tipo aceita datas futuras, até 366 dias, e início e fim de até 31 dias civis. O intervalo exclui domingos e feriados e grava em transação serializável, com a mesma trava do calendário; qualquer sobreposição recusa o lote todo. Edições permanecem individuais. Observação fica restrita a Outros e 200 caracteres.

O agendamento não cria chamadas. Na primeira leitura do dia, a Chamada recebe propostas para os alunos ativos na turma atual. O cliente guarda os identificadores e revisões junto ao rascunho e confirma essa leitura ao salvar. Mudança nas propostas exige recarregar, sem sobrescrever o rascunho; lista confirmada permite correções explícitas. Clientes legados que omitem a confirmação recebem as propostas automaticamente na primeira gravação.

Se a Chamada já existe, a justificativa altera somente as faltas do aluno escolhido na chamada mais recente do dia, usando o retrato das aulas e preservando colegas e lista. Incrementa a revisão da Chamada e invalida apenas a confirmação desse aluno na SEDUC. Sem aulas de referência, recusa sem gravação parcial. A fila de frequência existente é acionada se habilitada; falhas posteriores à confirmação geram aviso sem incentivar repetição do registro.

Remover a personalização ou mudar para presença não apaga faltas já aplicadas à Chamada. O diálogo de remoção informa a preservação e direciona a correção ao registro diário. Transferências não mudam a turma histórica da personalização; propostas ainda não aplicadas seguem a turma atual. O catálogo não permite excluir motivos em uso, incluindo agendamentos. A cópia JSON mantém o código e aceita registros antigos sem ele.

## Consequências

O calendário futuro fica exclusivo da Chamada Parcial. A confirmação Registro na SEDUC continua manual e não envia dados ao sistema estadual. Não há novo destino externo nem integração com IA. A migração amplia o enum e acrescenta uma coluna anulável; dados anteriores são preservados.
