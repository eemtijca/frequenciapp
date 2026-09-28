# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Guia de contribuição ampliado com fluxo de issues, convenções de commit e pull request, política de revisão, releases e contribuições assistidas por IA.
- Templates de pull request e de issues (Bug e Melhoria) no padrão do GitHub.
- Rulesets de revisão e qualidade na branch `main`.
- Código invisível do aluno em cada linha da planilha de frequência (script na versão 3): o envio acha o aluno pelo código, sem trocar nem duplicar alunos (ADR-023).

### Corrigido

- O envio para a planilha lê a aba até a última linha e cria a linha de aluno novo depois dela, sem gravar sobre outra linha quando o esquema salvo está defasado.
- O mapa da planilha recusa duas abas para a mesma turma original.

### Modificado

- Workflows renomeados para `qualidade.yml`, `testes.yml` e `migracoes.yml`, com o padrão de nomes em português.
