# ADR-024: OAuth e Sheets API para frequência e saídas

A conexão e as exigências de Apps Script descritas nesta decisão são históricas e foram substituídas pela [ADR-033](033-integracao-exclusiva-com-google-planilhas.md).

## Estado

Aceita.

## Contexto

A conexão por Apps Script exige copiar código, criar um token e publicar uma implantação em cada planilha. A administração quer escolher a planilha diretamente no aplicativo e dispensar a publicação manual de script. A integração existente já tem prévia, mapa, modo conservador, modo completo, marcadores e cópias de segurança.

## Decisão

- Adicionar OAuth 2.0 no servidor, com estado assinado, PKCE e token de atualização cifrado com uma chave derivada de `AUTH_SECRET`.
- Usar Google Picker para a escolha explícita da planilha e o escopo `drive.file`. Somente o token de acesso breve chega ao navegador para abrir o seletor.
- Ler e alterar as planilhas de frequência e de saídas pela Google Sheets API. O aplicativo mantém a lógica de planejamento e faz uma última leitura de valores, fórmulas, marcadores e assinatura antes de escrever.
- Criar os marcadores novos com visibilidade `DOCUMENT`, para que acompanhem linhas e colunas e possam ser lidos pelo projeto Google Cloud da integração.
- Enviar alterações em lotes sem repetição automática. Antes de operações destrutivas, duplicar a aba como cópia oculta; a restauração mantém o identificador da aba original.
- Manter a conexão por Apps Script para instalações existentes nas duas finalidades. Nenhuma mudança é feita em `gas/Codigo.gs` nesta decisão.

## Consequências

- A instalação nova exige configurar uma vez o projeto Google Cloud, a tela de autorização, as APIs, o cliente OAuth e a chave do Picker. Depois disso, a troca de planilha não exige uma nova implantação.
- O modo conservador relê a planilha imediatamente antes da escrita e protege fórmulas e células ocupadas observadas. A Sheets API não oferece uma condição de escrita que confira novamente o conteúdo da célula durante o lote. Uma edição simultânea entre leitura e gravação continua possível; o registro de resultado parcial e a conferência manual continuam necessários quando a resposta não chega.
- A rotação de `AUTH_SECRET` exige reconectar a conta Google para obter outro token de atualização. A planilha escolhida e o token OAuth não entram na cópia JSON.
- Marcadores de uma implantação Apps Script anterior com visibilidade limitada ao projeto podem não aparecer ao novo projeto Google Cloud. Antes de usar o modo completo numa planilha já integrada, é preciso conferir o mapa e os marcadores no teste com uma cópia sintética.
