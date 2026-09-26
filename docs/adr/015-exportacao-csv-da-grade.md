# ADR-015: exportação CSV da grade por turma de origem

## Status

Aceita.

## Contexto

A reorganização do 3º ano exige que a frequência das turmas atuais seja entregue por turma de origem, inclusive fora do aplicativo. O aplicativo original enviava a frequência para uma planilha do Google por integração externa; a reconstrução evita dependências externas por padrão.

## Decisão

A Grade ganha a exportação CSV da turma de origem no período exibido, com todos os alunos ativos, colunas de dia, faltas, justificadas e total, separador `;`, BOM UTF-8 e proteção contra injeção de fórmula. O mesmo dataframe alimenta a integração opcional com o Google Planilhas.

## Consequências

- A escola consegue alimentar qualquer sistema externo sem serviço contratado.
- O arquivo abre no Excel pt-BR e no Google Planilhas sem ajuste manual.
- O formato passa a ser contrato testado; mudanças de coluna exigem atualização da documentação e dos testes.
