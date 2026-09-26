# ADR-013: grade por período e cópia de segurança em JSON

## Estado

Aceita.

## Contexto

A consulta por turma de origem existia apenas no mês civil. O aplicativo de referência oferece dia, semana de aula e período personalizado, além do mês, com uma coluna de faltas acumuladas de todo o histórico. Também não havia um jeito de levar os dados para outra instalação sem acesso operacional ao PostgreSQL.

## Decisão

- A Grade passa a aceitar quatro modos de período: dia, semana de aula (segunda a sexta), período personalizado e mês, com limite de segurança de 366 dias na consulta.
- A API expõe `de` e `ate` para frequências, e a Grade busca o período fora do mês carregado sem depender do estado compartilhado.
- A grade mostra P, F, FJ e S (no modo por aula), o selo de saída no dia e a coluna Total com as faltas acumuladas (F + FJ) de todo o histórico.
- A Gestão ganha a seção de cópia de segurança: exportar e importar JSON, restrita à administração, com auditoria.
- A importação mescla sem sobrescrever: registros ausentes são criados, iguais são contados como idênticos e divergentes permanecem como estão, com o resultado informado na tela.

## Alternativas descartadas

- Exportar apenas as frequências: sem séries, turmas e alunos a cópia não é reimportável em uma instalação limpa.
- Importação que sobrescreve: arriscaria perder correções feitas depois da cópia.
- Exportar contas e hashes de senha: amplia o risco sem necessidade; a cópia cobre apenas dados escolares.

## Consequências

- A Grade responde às mesmas perguntas do aplicativo de referência, mantendo a primeira coluna fixa e a busca por aluno.
- A cópia JSON serve para migração assistida e conferência, sem substituir o backup operacional por `pg_dump`.
- O acumulado exibido na Grade e na Chamada depende de uma consulta agregada, que separa faltas simples de justificadas.
