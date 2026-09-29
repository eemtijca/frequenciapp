# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Adicionado

- Ação própria na Gestão para marcar ou desfazer desistência, mantendo o aluno na Chamada com marcação bloqueada, histórico preservado e gráfico de desistentes no Painel.
- Selo `DESISTENTE` ao lado do nome na Chamada, com botão bloqueado; no CSV e na planilha pela Sheets API, a célula do nome recebe somente `DESISTENTE`, com prévia, vínculo por aluno, cópia de segurança e atualização incremental.
- Envio da chamada à planilha ao salvar, por chave na Gestão (desligada por padrão): só preenche célula vazia e cria a coluna do dia, sem repetir depois de envio sem confirmação (ADR-025).
- Integração opcional com Google Planilhas por OAuth 2.0, seletor de planilhas e Sheets API para chamadas e saídas, sem publicação manual de Apps Script (ADR-024).
- Guia de contribuição ampliado com fluxo de issues, convenções de commit e pull request, política de revisão, releases e contribuições assistidas por IA.
- Templates de pull request e de issues (Bug e Melhoria) no padrão do GitHub.
- Rulesets de revisão e qualidade na branch `main`.
- Lista de cada chamada gravada (`alunos_chamada`): mover um aluno de turma não reescreve os dias já salvos, e a consolidação pela turma original continua certa (ADR-022).
- Turma original em círculo ao lado do nome na Chamada das turmas reorganizadas.
- Importação e exportação da relação de alunos em CSV, com schema padrão (`turma_atual;ordem;nome;turma_original`), validação por linha na hora e prévia que mantém o histórico de cada aluno.
- Envio incremental à planilha de frequência: por padrão só os dias alterados desde o último envio confirmado de cada turma, uma turma por requisição com andamento na tela; o período inteiro fica como opção de conferência.
- Script da planilha na versão 4: leitura por faixas de colunas, assinatura na leitura, vinculação e preenchimento em lote e tempos por etapa no registro de execuções.
- Código invisível do aluno em cada linha da planilha de frequência (script na versão 3): o envio acha o aluno pelo código, sem trocar nem duplicar alunos (ADR-023).

### Corrigido

- No Painel, cada botão mostra só o seu escopo: Escola tem um único gráfico, a série escolhida deixa de exibir os gráficos das outras séries e o gráfico de desistentes passa para um quarto botão, Desistentes.
- Troca de turma pela edição do aluno agora informa que a turma de origem e as chamadas anteriores são preservadas e coloca o aluno no fim da ordem da turma de destino.
- Indicadores de infrequência deixam de incluir alunos desistentes a partir da data da desistência; importação de CSV não os desativa por ausência na relação.
- Diretor de turma cadastrado hoje não fica mais com a tela vazia: a Gestão informa desde quando ele acompanha a turma (data retroativa no cadastro e na edição, sem data futura), e a mensagem sem chamada explica que o acompanhamento começou naquele dia.
- A Sheets API consulta os vínculos por `developerMetadata.search` quando a resposta da estrutura omite os marcadores de linha, e registra falhas de leitura anteriores ao lote como falha sem escrita, com motivo técnico.
- O registro do envio à planilha por Sheets API guarda o motivo técnico da recusa ou da falta de resposta (código HTTP, mensagem do Google e lote), sem dados de alunos, para diagnosticar turmas sem confirmação. A tela segue sem termos técnicos.
- A leitura pela Sheets API reconhece marcadores de linhas e colunas já gravados, evitando propor novamente vínculos de alunos em envios posteriores.
- Na edição de um aluno, mudar a turma não altera mais a turma de origem mostrada no formulário.
- O envio para a planilha lê a aba até a última linha e cria a linha de aluno novo depois dela, sem gravar sobre outra linha quando o esquema salvo está defasado.
- O mapa da planilha recusa duas abas para a mesma turma original.
- As ações da aba Alunos na Gestão cabem na tela do celular, sem botão cortado.
- O envio seguinte à criação de uma coluna de dia não pede mais Revisar estrutura: o esquema da aba é atualizado depois do envio.
- Envio sem resposta (timeout, 504 ou queda de rede) fica registrado como parcial, com orientação para conferir a aba, e não é repetido automaticamente.

### Modificado

- O Painel distribui as faltas do dia pela turma atual, como a chamada aconteceu.
- Workflows renomeados para `qualidade.yml`, `testes.yml` e `migracoes.yml`, com o padrão de nomes em português.
