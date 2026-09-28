# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Guia de contribuição ampliado com fluxo de issues, convenções de commit e pull request, política de revisão, releases e contribuições assistidas por IA.
- Templates de pull request e de issues (Bug e Melhoria) no padrão do GitHub.
- Rulesets de revisão e qualidade na branch `main`.
- Lista de cada chamada gravada (`alunos_chamada`): mover um aluno de turma não reescreve os dias já salvos, e a consolidação pela turma original continua certa (ADR-022).
- Turma original em círculo ao lado do nome na Chamada das turmas reorganizadas.
- Importação das relações de turma na Gestão, com prévia e aplicação que mantém o histórico de cada aluno.
- Código invisível do aluno em cada linha da planilha de frequência (script na versão 3): o envio acha o aluno pelo código, sem trocar nem duplicar alunos (ADR-023).

### Corrigido

- Na edição de um aluno, mudar a turma não altera mais a turma de origem mostrada no formulário.
- O envio para a planilha lê a aba até a última linha e cria a linha de aluno novo depois dela, sem gravar sobre outra linha quando o esquema salvo está defasado.
- O mapa da planilha recusa duas abas para a mesma turma original.

### Modificado

- O Painel distribui as faltas do dia pela turma atual, como a chamada aconteceu.
- Workflows renomeados para `qualidade.yml`, `testes.yml` e `migracoes.yml`, com o padrão de nomes em português.
