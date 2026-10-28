# ADR-060: restauração das turmas de origem

- Status: aceita
- Data: 2026-10-28

## Contexto

A 3ª série passa por um remanejamento temporário: os alunos mudam de turma atual e mantêm a turma de origem, que a Grade e a planilha de frequência continuam usando. Quando o remanejamento termina, a administração precisava editar aluno por aluno para devolvê-los. A mesma diferença entre turma atual e origem também aparece numa transferência permanente, dentro da série ou entre séries, porque mudar a turma de um aluno preserva a origem.

## Decisão

- Gestão, Alunos, ganha Restaurar origens, com a rota `POST /api/alunos/restaurar-origens`, restrita à administração com origem confiável e auditoria.
- O recorte é a série, dos dois lados: entram só os alunos cuja turma atual e cuja turma de origem pertencem à série escolhida e são diferentes. Quem cruzou de série, em qualquer sentido, não é tocado. O diálogo lista apenas as séries com alunos nessa situação.
- Ativos e inativos entram. Um inativo deixado na turma do remanejamento ficaria nela para sempre e voltaria para a turma errada se fosse reativado; o efeito de devolvê-lo é o mesmo de um ativo.
- A prévia mostra quantos alunos voltam a cada turma e de quais turmas saem. O pedido leva a prévia inteira, aluno por aluno, com a turma atual e a de origem que foram conferidas. Dentro da transação, o servidor recalcula a relação e só aplica se ela for exatamente a mesma; a mesma contagem com outros alunos é recusada com 409, sem alterar nada.
- Repetir uma prévia que já foi aplicada, como depois de uma resposta perdida, devolve 200 com `jaAplicado: true` e não grava nada.
- A transação começa com `LOCK TABLE alunos IN SHARE ROW EXCLUSIVE MODE`. Como em `travarCalendario`, `LOCK TABLE` não abre o snapshot do SERIALIZABLE: a restauração espera quem já está gravando alunos e lê o que essas transações gravaram, e quem grava alunos depois espera a restauração terminar. Uma trava consultiva por `SELECT pg_advisory_xact_lock` não serviria aqui, porque o próprio `SELECT` já abriria o snapshot antes da espera. As outras rotas não mudam: a Chamada só lê alunos e não espera.
- Numa única transação, a turma atual de cada aluno volta a ser a de origem e só as turmas que perdem ou recebem alunos são renumeradas, pela mesma regra de Reorganizar turmas: ativos pelo nome e inativos no fim. Antes do commit, duas consultas conferem que ninguém da série ficou fora da origem e que nenhuma turma afetada tem numeração repetida; se algo falhar, nada é gravado.
- A auditoria registra uma linha de resumo (`aluno.restaurar_origens`, `serie:<id>:alunos:N:turmas:M`) e uma linha por aluno atingido (`aluno.restaurar_origem`, `aluno:<id>:de:<turma>:para:<turma>:ordem:<antes>:<depois>`), só com identificadores. O trecho de turma aparece em quem voltou, e o de ordem em quem teve a numeração alterada. Com isso, a operação pode ser reconstruída a partir da trilha.

## Efeitos por tipo de dado

| Dado                                                        | Efeito                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faltas, chamadas salvas e lista do dia                      | Não mudam: a chamada guarda a turma e a lista no próprio registro.                                                                                 |
| Grade e planilha de frequência                              | Não mudam: agrupam pela turma de origem, que a restauração não altera.                                                                             |
| Entradas atrasadas e registros parciais                     | Não mudam: guardam a turma do evento.                                                                                                              |
| Saídas, relatório de saídas e entradas e planilha de saídas | Passam a aparecer na turma de origem, porque a saída não guarda a turma e é agrupada pela turma atual do aluno no momento da consulta ou do envio. |
| Chamada dos próximos dias                                   | Segue a turma atual restaurada, com a numeração nova das turmas afetadas.                                                                          |

O diálogo avisa a reorganização das turmas afetadas e o reagrupamento das saídas antes da confirmação. O aviso é geral: ele não conta nem lista as saídas dos alunos da prévia.

## Alternativas

- Restaurar todas as séries de uma vez: devolveria também transferências permanentes de outras séries.
- Conferir só a quantidade da prévia: aceitaria um conjunto diferente com a mesma contagem.
- Assinar a prévia com HMAC numa rota de leitura própria: a lista conferida já é a autoridade e cabe no limite do corpo (até 1.000 alunos); a assinatura acrescentaria uma rota sem mudar o que o servidor compara.
- Excluir os inativos: deixaria o cadastro com alunos na turma do remanejamento e manteria a série marcada como fora da origem.
- Manter a numeração e acrescentar os alunos no fim da turma: a chamada ficaria fora da ordem alfabética até uma reorganização manual.
- Selecionar alunos um a um, como em Definir origem: exigiria escolher dezenas de alunos para uma volta que é sempre da série inteira.
- Exigir uma frase digitada, como no modo completo da planilha: nenhum dado é apagado, a prévia é por série e o botão diz quantos alunos serão restaurados, como em Reorganizar turmas, que também não pede frase.
- Uma chave em Configurações para mostrar o botão: o botão só fica habilitado quando há aluno remanejado dentro da própria série, e a semântica da turma de origem é a mesma nas demais telas. A decisão de tornar o recurso opcional fica para quando houver escola que use a turma de origem com outro sentido.

## Consequências

- Turmas e séries intocadas mantêm a numeração, inclusive os alunos que não se moveram nas turmas fora da prévia.
- A trava vale para a tabela inteira de alunos, não só para a série: duas restaurações de séries diferentes, a importação, a edição de aluno e Reorganizar turmas esperam umas pelas outras. A transação é curta, com duas atualizações em lote e duas conferências, e escritas simultâneas em alunos são raras numa escola; uma trava por série exigiria travas de linha em todas as rotas que gravam alunos.
- A prévia aceita até 1.000 alunos. Com 1.000 itens, o corpo JSON enviado pelo diálogo tem cerca de 152 kB, 76% do limite de 200 kB das rotas; uma série com mais de 1.000 alunos teria mais de vinte turmas de 50. Passar desse tamanho exigiria dividir a restauração ou subir o limite do corpo desta rota, como já fazem as rotas de importação de cópia.
- Uma transferência permanente dentro da própria série também volta; nesse caso, a origem precisa ser ajustada antes, em Definir origem. Transferências entre séries ficam como estão.
- A restauração não deve substituir Definir origem quando a escola usa a turma de origem como turma de entrada do ano letivo.
- Enquanto a saída não guardar a turma do registro, qualquer mudança de turma, inclusive esta, reagrupa as saídas antigas do aluno.
