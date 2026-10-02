# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não publicado]

### Removido

- Integração por Apps Script, publicação manual, controles de token e endereço, rotas antigas e quatro campos do banco. As conexões existentes por Entrar com Google são preservadas; configurações do provedor antigo exigem seleção de arquivo pelo Google (ADR-033).

### Corrigido

- Leitura dos marcadores nativos de linha e coluna da Sheets API, preservando identificação do aluno e das dimensões criadas pela integração.

### Adicionado

- Envio automático à planilha ao registrar saídas e entradas, por interruptor em Gestão, Planilha de saídas (desligado por padrão): só acrescenta linhas, sem repetir depois de envio sem confirmação.
- Chamada com as turmas agrupadas em um botão por série, que expande e recolhe (apenas uma série aberta por vez); na Gestão, as turmas específicas da origem ficam numa seção recolhível.
- Opção Todas as turmas para organizar a apresentação ou corrigir cabeçalhos e datas das abas vinculadas, com uma confirmação, andamento e resultado por aba. As operações seguem em sequência e identificam falhas sem repetir a escrita automaticamente.

- Organização visual das planilhas de frequência, saídas e entradas, com cabeçalho destacado, colunas ajustadas, quebra de texto e linhas alternadas. Abas existentes recebem prévia e confirmação administrativas, preservando dados e fórmulas; o provedor legado usa o script na versão 5.

- Rolagem lateral dos gráficos do Painel, com encaixe por cartão, posição atual, navegação por teclado e altura adaptável. Os cartões Escola, séries, Personalizado e Desistentes substituem os botões superiores; o formulário personalizado preserva o estado ao deslizar.

- ZIP protegido por senha em todos os downloads, com AES-256 no navegador, confirmação e nomes genéricos. Cópia completa exige novamente a senha da administração; CSV registra preparação na auditoria sem nomes ou conteúdo. Formatos originais continuam disponíveis por escolha explícita (ADR-031).
- Preferências de notificações por conta, resumo e novas chamadas para diretores, aviso de chamadas pendentes para a coordenação e administração, e configuração de tipos e horários na Gestão. Agenda periódica por GitHub Actions compatível com Vercel Hobby, com confirmações independentes por tipo (ADR-030).
- Notificações Web Push voluntárias por dispositivo para diretores de turma, com teste de envio, aviso diário das chamadas acompanhadas, controle por vínculo vigente e configuração VAPID opcional (ADR-028).

- Botão Personalizado no Painel, após as séries, com calendário de início e fim, filtros de série e turma e gráfico de infrequência para até 366 dias. A taxa usa apenas os registros de aluno por dia com chamada salva, incluindo F e FJ.
- Horário da saída no formulário Saiu mais cedo, com o mesmo conjunto de campos das entradas; a planilha de saídas passa a levar `HH:MM · Momento`.
- Seletor de horário próprio em popover, coerente com o calendário, em todos os campos de horário. As abas Saídas e Entradas ficam no topo da área e a aba escolhida vai para a URL.

- Formulário de entradas no padrão das saídas, com calendário brasileiro, momento da entrada, justificativa por tipo ou texto e responsável pelo registro do catálogo, separado da autoria autenticada. Registros anteriores e cópias antigas permanecem compatíveis.

- Área Saídas e entradas com registro de chegadas atrasadas, horário e motivo, turma histórica, correção auditada e cópia JSON. As entradas podem ser enviadas com prévia à aba Entradas da planilha de saídas pela Sheets API (ADR-027).

- No Painel, o botão de uma série com alunos remanejados (como a 3ª série) ganha um segundo gráfico da infrequência do dia agrupada pela turma original, com as mesmas faltas do gráfico por turma atual.
- Bloqueio da Chamada após salvar cada dia e turma, com desbloqueio explícito para corrigir e novo bloqueio depois da correção.
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

- Envio ao salvar a chamada mantém as pendências por dia e turma de origem, mesmo depois do sucesso de outro dia. Células divergentes e fórmulas exigem revisão manual, marcações idênticas são confirmadas sem nova escrita e a recusa local de Apps Script antigo não bloqueia o envio seguinte como parcial.
- Consulta de saídas por período: `de` e `até` juntos ignoravam o início e traziam saídas de dias anteriores, inclusive no envio à planilha.
- Organização das planilhas pela conexão Google aguarda o limite temporário de leituras e repete apenas a leitura recusada, com pausas limitadas por aba e mensagem específica para recusa persistente. Cópias, exclusões e gravações não são repetidas.
- Datas da frequência em `dd/mm/aaaa` nas novas colunas e no CSV. A Gestão oferece prévia para retirar o título e a legenda acima da tabela e corrigir datas existentes, com cópia de segurança e preservação das chamadas, fórmulas e mapa das turmas. O provedor legado usa o Apps Script 6.

- Diretores de turma podem ativar notificações sem configuração manual de VAPID: o servidor prepara um par estável a partir de `AUTH_SECRET` e preserva pares explícitos existentes (ADR-029).
- Seletor de horário: tocar em uma hora agora atualiza o campo na hora e o destaque acompanha a escolha (antes só a coluna de minutos parecia responder); itens com 44 px de altura e texto maior para o toque em telas de 360 px.
- O gráfico do Painel por turma original aparece só nas séries indicadas em Origem na Chamada (a 3ª série), e não mais em qualquer série com aluno de origem diferente da turma atual.
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

- Um só botão da planilha, ao lado das abas Saídas e Entradas, envia as saídas e as entradas do mês juntas, com prévia e confirmação únicas.
- O botão da planilha passou para a linha das abas Saídas e Entradas, sem a faixa de título que sobrava. O Painel perdeu o botão de atualizar e se atualiza sozinho a cada minuto e ao voltar para a aba do navegador.
- Integrações de planilhas deixam de criar abas de backup. A Gestão oferece limpeza das cópias antigas com prévia e confirmação administrativa, preservando turmas e abas manuais. A conexão legada exige publicar o Apps Script 7.
- Painel sem o título e a data "Infrequência em ..." acima dos cartões; o título fica só para leitores de tela.
- Interface mais limpa: sem títulos e textos de apoio visíveis em Chamada, Saiu mais cedo, Entradas atrasadas, Grade e Gestão, nem os avisos fixos das abas Alunos, Equipe e Diretores e a explicação da Planilha de entradas. Os títulos ficam só para leitores de tela, e os avisos de exclusão e de palavra-chave seguem nos diálogos.
- A exibição da turma de origem e do asterisco na Chamada é configurável pela escola, com ativação e seleção de séries completas ou turmas específicas. Desativar preserva a seleção e os dados. A migração mantém a 3ª série já cadastrada selecionada; instalações novas começam com o recurso desligado.
- O Painel distribui as faltas do dia pela turma atual, como a chamada aconteceu.
- Workflows renomeados para `qualidade.yml`, `testes.yml` e `migracoes.yml`, com o padrão de nomes em português.
- Textos de Gestão > Configurações reduzidos, com descrições curtas, menos instruções repetidas e ajuda técnica do Apps Script recolhida. Títulos, estados, rótulos e avisos de confirmação permanecem disponíveis.
