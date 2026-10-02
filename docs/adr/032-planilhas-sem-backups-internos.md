# ADR-032: planilhas sem abas internas de backup

## Estado

Implementada para revisão.

## Contexto

As cópias ocultas aparecem no seletor de abas do Google Planilhas no celular e duplicam dados no arquivo conectado. A escola solicita manter as abas normais e remover as cópias geradas pela integração.

## Decisão

Não duplicar abas ao organizar, enviar alterações destrutivas, remover ou restaurar. Manter consultas e restauração das cópias antigas enquanto existirem. Disponibilizar limpeza administrativa com prévia assinada, senha, frase de confirmação e auditoria mínima. Reconhecer somente nomes com prefixo e carimbo de backup e marcador de cópia no nível da aba. Revalidar a lista no aplicativo e no adaptador antes da exclusão. Preservar abas normais e pelo menos uma aba visível.

As exclusões não admitem repetição automática. A conexão Google recebe a mudança com o aplicativo; o provedor legado exige publicar o Apps Script 7 e registrar a versão pelo teste de conexão. A versão antiga é bloqueada antes de ações que poderiam recriar cópias.

## Consequências

Não há restauração automática do estado anterior às mudanças destrutivas. A limpeza apaga definitivamente as cópias selecionadas. O histórico de versões e a exportação do Google continuam opções para recuperar alterações manuais. O backup JSON ou ZIP do aplicativo contém seu banco, sem substituir a exportação dos formatos e fórmulas da planilha.
