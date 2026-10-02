# ADR-033: integração exclusiva com Google Planilhas por OAuth

- Status: aceita
- Data: 2026-10-02
- Substitui a conexão da ADR-016 e ADR-019, a manutenção do provedor antigo na ADR-024 e as exigências de implantação de script nas ADR-023 e ADR-032.

## Contexto

A administração usa Entrar com Google. Manter publicação manual de Apps Script, endereço, segredo compartilhado e versão de implantação duplica a configuração e os caminhos de envio sem necessidade.

## Decisão

- Frequência, saídas e entradas usam somente OAuth, Google Picker e Sheets API. O token de atualização permanece cifrado no servidor.
- Remover o script, seu cliente, controles de conexão antigos, rotas de gerar/revelar token e testar implantação e a variável de liberação de endpoint local. As rotas removidas respondem 404; configurações com endpoint são recusadas.
- Remover do banco provedor, endpoint, token compartilhado e versão de script. Conexões Google, arquivo escolhido, mapa e preferências permanecem intactos. Configurações do provedor antigo são desligadas e perdem arquivo e mapa, mas conservam uma autorização Google já obtida para permitir nova seleção do arquivo.
- Preservar chamada, histórico, envio automático, prévias, modo conservador, desbloqueio do modo completo e limpeza de backups antigos. Não criar novas abas de backup.
- Normalizar os marcadores nativos `DimensionRange` do Google (`dimension`, `startIndex`, `endIndex`) para as posições internas de linha e coluna. Índice inicial omitido corresponde a zero.
- Testes de API e navegador usam respostas HTTP sintéticas de OAuth e Sheets API. Um módulo carregado exclusivamente no servidor de testes redireciona somente tokens sintéticos para `127.0.0.1`, mantendo os endereços fixos do cliente de produção. Nenhum dado escolar ou segredo real participa dos testes.

## Consequências

A administração mantém uma única forma de conexão. Instalações que usavam apenas o provedor antigo precisam selecionar a planilha por Entrar com Google antes de ativar o envio. Remover o código do aplicativo não apaga implantações externas do projeto Google nem abas da escola.

A Sheets API não oferece escrita condicionada ao valor anterior de uma célula. As prévias, releituras e a orientação de conferência após resposta perdida continuam necessárias; nenhuma escrita é repetida automaticamente.
