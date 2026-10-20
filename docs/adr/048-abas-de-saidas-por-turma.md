# ADR-048: consultas de saídas por turma

## Estado

Aceito.

## Contexto

A ordenação da aba única não oferece o acesso separado por turma solicitado pela escola. Dividir o registro de escrita em várias abas exigiria migrar históricos e mudar as regras de correção, remoção e identificação das linhas existentes.

## Decisão

A aba original continua como base de registro. Cada envio com coluna Turma prepara consultas por turma, identificadas por marcadores próprios vinculados ao código da origem e ao rótulo da turma. Fórmulas FILTER, SORT e VSTACK mostram as linhas correspondentes sem duplicar o histórico. Os nomes são escapados como literais; nomes de abas também respeitam os limites do Google.

A preparação e a escrita são enviadas no mesmo lote atômico. A tentativa durável e a trava de movimentações continuam vigentes. A criação pode ocorrer mesmo sem registros novos em um envio manual. Repetições reutilizam as consultas; abas manuais com o mesmo nome são preservadas. Nenhuma aba é apagada automaticamente. A estrutura das consultas é conferida por assinatura antes de novos envios, e consultas não podem receber o mapa de origem.

## Consequências

As consultas acompanham os registros da base no próprio Google, inclusive alterações feitas fora do app e saídas de meses anteriores. A base permanece acessível para edição e preserva notas e formatos individuais que as fórmulas não replicam. Uma turma sem saídas recebe o cabeçalho e uma linha vazia.

O recálculo das consultas fica a cargo do Google Planilhas. Alterações manuais que apaguem a fórmula ou ocupem sua área de expansão precisam de conferência na planilha. Trocas de colunas exigem revisar as consultas; a integração não sobrescreve essas abas. Respostas de rede perdidas permanecem sem confirmação, exigindo conferência manual antes de retomar a automação.
