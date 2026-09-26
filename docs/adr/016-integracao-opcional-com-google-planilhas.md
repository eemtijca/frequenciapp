# ADR-016: integração opcional com Google Planilhas via Apps Script

## Status

Aceita.

## Contexto

A escola precisa que a planilha de frequência por turma de origem receba os dados sem trabalho manual, mas o aplicativo não deve depender de terceiros em runtime nem expor dados de alunos sem controle. A planilha já existe e tem dados, então a escrita precisa respeitar o conteúdo atual.

## Decisão

Integração opcional, desligada por padrão, por um Web App do Google Apps Script publicado na conta da escola:

- o servidor do aplicativo chama o script; o navegador nunca fala com o Google;
- token compartilhado guardado em Script Properties e no banco, fora da cópia JSON;
- endpoint restrito a `script.google.com/macros/s/.../exec`;
- o aplicativo lê o esquema da planilha, mapeia abas por turma de origem e salva uma assinatura, revalidada antes de cada escrita;
- no modo padrão, só célula vazia e sem fórmula é preenchida; divergências são listadas;
- o Apps Script aplica as mesmas invariantes, mesmo se o aplicativo pedir diferente.

## Consequências

- A escrita é idempotente e conservadora, adequada a uma planilha com dados.
- A integração tem um ponto de falha externo opcional, com mensagens claras e sem bloquear o aplicativo.
- O script precisa ser republicado a cada mudança, com a versão conferida pelo aplicativo.
- `docs/lgpd.md` e `docs/seguranca.md` descrevem o envio opcional para a conta da escola.
