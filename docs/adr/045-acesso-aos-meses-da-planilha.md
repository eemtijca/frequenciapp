# ADR-045: acesso aos meses da planilha

## Estado

Aceito.

## Contexto

A exibição de um único mês ocultava os demais destinos. No Google Planilhas para celular, as abas ocultas dificultavam consultar o histórico, enquanto abas antigas sem mês continuavam misturadas às mensais. Retirá-las sem conferir o conteúdo poderia apagar registros manuais ainda ausentes das abas novas.

## Decisão

- Todos os meses preparados permanecem visíveis. A operação antiga de visibilidade é compatível, mas não oculta abas; o campo `ocultadas` permanece vazio.
- A Gestão consulta um catálogo leve de meses e oferece links diretos por turma. Abrir o catálogo não altera a planilha.
- A retirada de abas antigas é administrativa, por aba explicitamente vinculada no mapa salvo. O título sozinho não autoriza a retirada, e abas anteriores ao OAuth não precisam ter marcador de autoria. A prévia é assinada e vinculada ao administrador, arquivo, conexão, turma e conteúdo das abas envolvidas.
- Na confirmação, duas conferências precedem um único lote atômico que copia marcas para destinos vazios, revela os destinos e retira a origem. Fórmulas, notas, gráficos, conteúdo desconhecido, mesclagens e divergências impedem a retirada. Alunos usam código quando disponível; nomes exatos e únicos são a alternativa.
- A leitura integral inclui notas fora do intervalo de valores. Cada aba aceita até 2.000 linhas e 400 colunas em blocos de até 20.000 células. Abas maiores exigem conferência manual.
- A ação usa a trava da frequência. O efeito no Google fica fora da transação local; a atualização do mapa e a auditoria são transacionais. Nenhum registro de chamada no aplicativo é modificado.

## Consequências

O histórico continua acessível e abas antigas podem ser retiradas sem descartar marcas reconhecidas. Meses não preparados e estruturas ambíguas exigem ajuste antes de continuar. A ação explícita com prévia permite a retirada somente depois de preservar os registros; não substitui a remoção administrativa genérica em modo completo.

Não há repetição automática de escrita com resposta perdida. Nesse caso, a escola confere o Google e atualiza a estrutura na Gestão. A Sheets API não oferece gravação condicionada ao conteúdo lido; uma edição externa depois da última leitura ainda pode competir com o lote. Fórmulas externas que dependam da aba antiga exigem revisão pela escola antes da retirada.
