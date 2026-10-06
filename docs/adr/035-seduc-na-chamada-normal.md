# ADR-035: Confirmação da Seduc por aluno na chamada normal

Estado: aceita. Data: 2026-10-03.

## Contexto

A equipe precisa lembrar quais alunos da chamada normal já tiveram frequência lançada no sistema da Seduc. A Chamada Parcial já oferece confirmação manual, mas seus registros são independentes. Uma confirmação global da turma perderia a conferência individual.

## Decisão

- Guardar a confirmação por frequência e aluno em `alunos_chamada`, com data, identidade e nome histórico do responsável. A chave mantém o vínculo com a lista salva mesmo depois de transferência.
- Exibir a chave Seduc ao lado de cada nome, com rótulo acessível "Registrado na Seduc". Habilitar somente depois de salvar e bloquear a chamada. O lançamento externo continua manual.
- Conferir a revisão da chamada e uma revisão própria da confirmação em transação serializável. Confirmar ou desmarcar não altera a frequência, sua autoria, seu horário ou sua revisão, nem dispara envio ao Google.
- Ao salvar a chamada, comparar por aluno as aulas, justificativas e observações anteriores e novas. Uma alteração efetiva limpa somente a confirmação desse aluno e incrementa sua revisão própria. O salvamento sem mudança preserva a confirmação.
- Recusar uma confirmação baseada em frequência ou confirmação antigas, com recarga da interface. Não repetir a ação com outra revisão sem nova conferência.
- Incluir confirmação e autoria na cópia JSON como campo opcional da versão 1. Cópias antigas continuam válidas. A mesclagem restaura chamadas novas e relata divergências de confirmação nas existentes, sem sobrescrever.

## Alternativas

Um estado apenas no navegador não sobreviveria à troca de dispositivo. Usar a revisão da chamada para cada confirmação criaria conflitos entre alunos diferentes e alteraria indevidamente o horário da chamada. Compartilhar a confirmação com a Chamada Parcial confundiria registros distintos.

## Consequências

A migração é aditiva: alunos de chamadas antigas começam sem confirmação. Administração e coordenação podem confirmar; diretores mantêm suas permissões de consulta. Correções exigem conferência somente dos alunos afetados. A exclusão da conta responsável anula a referência, preservando nome e data históricos.

## Adendo 2026-10-05

A conferência da Seduc passa a ficar somente na Chamada Parcial. A decisão de exibir a chave na Chamada normal fica substituída; armazenamento, autoria, revisão própria e cópias existentes permanecem compatíveis.

A lista efetiva combina a chamada salva com personalizações por aluno e dia. Presentes da base aparecem como Dia inteiro; F, FJ e S preservam a situação registrada, sem presumir presença em dias não salvos. Um ajuste por dia inteiro, turno ou aulas prevalece antes do filtro de turma e exige confirmação própria. Ao personalizar a partir da base, a revisão da chamada protege a criação concorrente e sua turma é preservada. Remover o ajuste volta à base disponível com RS pendente. Faltas e indicadores da coordenação não são alterados.

A terceira planilha usa essa lista e o código estável `chamada:<alunoId>:<dia>`, reconhecendo UUIDs antigos sem duplicar linhas. A migração acrescenta apenas `DIA_INTEIRO` ao enum; não copia frequências nem apaga confirmações anteriores. A consulta antiga de parciais continua retornando somente os ajustes gravados.
