# ADR-040: indicadores agregados para Looker Studio

Decisão de integração externa sem alterar as planilhas operacionais ou publicar dados automaticamente.

## Status

Aceita.

## Contexto

A gestão precisa explorar gráficos estatísticos externos com as contas Google existentes. As planilhas de frequência contêm dados pessoais e não devem servir diretamente a relatórios de alcance maior. A Vercel Hobby já usa uma agenda no GitHub para recuperar envios operacionais.

## Decisão

Criar um arquivo Google privado separado, com quatro fontes agregadas por data, série e turma. Reutilizar o OAuth da frequência e o escopo drive.file, sem Apps Script, nova credencial ou permissões públicas. Excluir nomes, identificadores pessoais, observações e motivos, incluindo dados de saúde. A agregação reduz a exposição, mas não garante anonimização em grupos pequenos.

A configuração fica no modelo PainelIndicadores, fora da cópia JSON. Um UUID da instalação gravado nos metadados do arquivo e IDs estáveis das quatro abas impedem gravar em um destino operacional ou desconhecido. A criação fica reservada no banco antes do pedido externo; uma resposta incerta exige recuperação por endereço e verificação do marcador, sem repetir a criação.

As consultas usam um retrato consistente em RepeatableRead e selecionam somente campos necessários. Uma trava consultiva PostgreSQL exclusiva protege configuração, criação, recuperação e atualização entre instâncias. Nenhum efeito HTTP ocorre dentro de uma transação sujeita a repetição. As fontes são substituídas em um único batchUpdate, limitado a 2 MB antes da escrita. Datas são numéricas nativas, textos literais e contagens numéricas. Correções e exclusões não deixam linhas antigas ou duplicadas. Outras abas do arquivo permanecem intactas.

Uma etapa independente do workflow existente atualiza as fontes a cada cinco minutos, inclusive com a fila vazia ou com falha no processamento operacional. A agenda autenticada não cria arquivos, registra erros e avança o último sucesso somente depois da confirmação. Uma resposta de escrita perdida admite repetição idempotente. A configuração começa desativada.

O relatório Looker Studio é criado e compartilhado pela gestão usando o conector nativo Google Planilhas, uma fonte por aba. O aplicativo fornece o guia, salva um endereço HTTPS validado e abre o painel externo. Não cria relatório público nem promete atualização em tempo real.

## Consequências

Há uma nova migração e uma configuração administrativa recolhida. O painel depende da autorização Google e da agenda existente; falhas não bloqueiam registros escolares. O Looker mantém cache próprio. Agregados de saídas seguem a turma atual porque o modelo não guarda a turma histórica; frequências usam a lista histórica das chamadas, e aulas parciais contam apenas seleções explícitas. Um ano ativo de cada vez limita o volume e o custo. Apagar dados no app exige um envio posterior para remover a cópia externa, e arquivos exportados precisam de política própria de retenção.

## Verificação

Unidade cobre marcas, agrupamento, minimização, datas, fórmulas e propriedade do destino. API cobre permissões, recuperação, repetição segura, exclusões e agenda sem dependência da fila. Navegador cobre preparação e configuração em desktop e celulares, com banco e Google sintéticos.
