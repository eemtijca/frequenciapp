# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Enquanto a primeira versão pública não é lançada, a versão do projeto permanece fixada em `0.1.0`. A primeira release será a `v1.0.0`.

## [Não publicado]

### Adicionado

- Painel externo aceita links privados do Zoho Analytics, além do Looker Studio, com rótulos neutros, guia de conexão à planilha de indicadores e validação restrita do endereço da visualização.

- Painel externo no Google Looker Studio: Gestão prepara uma planilha exclusiva com indicadores agregados de frequência, saídas e entradas, chamada parcial e RS, sem nomes ou textos livres; atualização manual e automática, recuperação de criação incerta e guia para conectar o relatório privado.

### Alterado

- Chamada: o botão Desbloquear (ou Bloquear) passa para a linha do Resumo, à direita dele, e o quadro com "Chamada bloqueada" e a frase de apoio deixa de aparecer. A lógica do bloqueio e o rótulo acessível do botão não mudam.

- Anel de cobertura das chamadas mostra uma fatia por turma com alunos ativos, proporcional ao tamanho da turma: verde para chamada salva e vermelho para pendente. Ao concluir todas, o anel fica inteiramente verde, sem divisões; o estado de cada turma também fica disponível para leitores de tela.

- Resumo do Painel concentra a infrequência do dia em um cartão e mostra Sem dados quando não há chamadas salvas. Cabeçalhos dos gráficos da escola e das séries deixam de repetir a quantidade de faltas já exibida nas roscas.

- Relatórios e Chamada Parcial deixam de repetir títulos e explicações na tela; os títulos permanecem acessíveis a leitores de tela. Chamada Parcial remove a contagem duplicada de registros e pendências e o rodapé de conexão da planilha. A posição na faixa de gráficos passa a ser anunciada somente por leitores de tela.

- Cobertura do dia no Painel passa a usar progresso circular, contagem compacta de alunos e status com ícones; turmas pendentes ficam recolhidas e podem ser consultadas por toque. A instrução de deslizar fica exclusiva para leitores de tela, e o aviso repetido de chamada bloqueada sai do fim da lista.

- Gráficos do Painel, Relatórios e diretores carregam Recharts sob demanda quando próximos da área visível; cartões fora de exibição aguardam a visita, com espaço reservado e falhas de download isoladas do restante da tela.

- Diálogo de envio à planilha (Relatórios, Grade, e Enviar todas as turmas na Gestão) mais enxuto: escolha de alcance em duas opções lado a lado, um único bloco por aba com os totais em caixas (sem zeros e com os dias resumidos), detalhes e opções recolhidos, e remoção de linhas e colunas sempre à vista (travada fora do modo completo), com as colunas de dia em caixas marcáveis (Marcar todas e Limpar).
- Saídas e entradas, Relatórios e Gestão: as informações de cada registro (por exemplo "Luto" e "O tio faleceu.", ou turma, horário e momento) aparecem em caixas arredondadas separadas, no lugar do ponto entre elas.
- Relatórios, Saídas e entradas, agrupamento Por aluno: o campo de busca por nome virou um seletor com a relação dos alunos da turma escolhida (ou de todas as turmas), com a opção Todos os alunos e filtro por texto na lista.
- Planilha de saídas passa a se chamar "Planilha de entradas e saídas" na Gestão, e a aba Entradas tem as mesmas sete colunas de Saídas (sem Código, com Responsável no lugar de Liberado por). Preparar e organizar a aba Entradas saíram da área Saídas e entradas e ficam nessa seção; preparar realinha a aba no formato anterior, preservando os registros.

### Removido

- Integração por Apps Script, publicação manual, controles de token e endereço, rotas antigas e quatro campos do banco. As conexões existentes por Entrar com Google são preservadas; configurações do provedor antigo exigem seleção de arquivo pelo Google (ADR-033).

- Gradientes da interface (superfícies, controles, botões, estado selecionado e fatias das roscas): o acabamento de vidro segue o mesmo, com preenchimentos sólidos e brilho suave por sombra interna, e a classe sem uso `grafico-vidro` saiu da rosca do Painel.
- Resumo "Saídas por turma" e relatório semanal por aluno da aba Saídas; no lugar do resumo fica a lista simples das saídas do dia, com remoção para correção.

### Corrigido

- Abas mensais novas recebem os alunos em ordem alfabética. Envios de frequência posicionam alunos novos e transferidos pelo nome, movendo a linha inteira com marcas, fórmulas e vínculo do aluno, e conservando as posições de cabeçalhos e linhas manuais sem identificação.

- A prévia de envio é recalculada ao marcar remoções ou mudar opções, preserva as seleções durante a releitura e impede envio do plano anterior quando a leitura falha. No modo completo, confere o período inteiro para listar alunos transferidos mesmo sem chamadas pendentes. O modo conservador oferece o atalho Conferir linhas da turma e bloqueia a seleção de remoções; pedidos com a janela expirada são recusados.

- Saídas e Entradas passam a proteger envios manuais e automáticos entre instâncias, registrar a tentativa antes da escrita e pausar a automação de destinos sem confirmação. A retomada exige conferência posterior do período, e a prévia de Saídas deixa de valer após trocar o arquivo Google. Contagens incompletas e perda da proteção não confirmam sucesso. Entradas permite registrar a conferência de uma prévia sem linhas novas pela própria tela.

- Busca nos seletores permanece aberta e focada ao digitar e abrir o teclado no celular, incluindo a seleção de aluno nos Relatórios. Mantém filtro, seleção por toque e teclado, com limpeza da busca ao reabrir.

- Preparar aba Entradas reaplica o padrão visual de Saídas nas abas existentes, preservando os registros, e remove Sheet1 somente quando estiver vazia e houver uma aba de saídas configurada no mesmo arquivo.
- Seletor de data mantém o selo Hoje na coluna lateral da Chamada no desktop e prioriza a data e o selo antes do ícone nas larguras compactas.
- Leituras da Sheets API com limite (429), falha do Google (5xx) ou sem resposta passam a responder `GOOGLE_TEMPORARIO` (502/503), e o Preparar mês interrompe o lote uma vez e oferece "Tentar pendentes", em vez de repetir a falha em cada turma.
- Chamada Parcial mostra presença ou motivo da justificativa sob o nome, em retângulo arredondado, sem a indicação de origem Chamada ou Personalizada. O texto inclui o complemento de Outros e preserva a identificação de turnos e aulas personalizados.

- Reconexão Google preserva arquivo, mapa mensal e preferências, após conferir o acesso à planilha existente. Preparar mês interrompe falhas comuns de autorização, permite retomar turmas pendentes e recupera o mês após o retorno do Google. Falhas externas não encerram a sessão do aplicativo.

- Chamada Parcial exibe a lista da turma na ordem da chamada normal, com registro por aluno, busca e filtros. A chave da Seduc fica bloqueada até salvar; remover a frequência parcial mantém o aluno na lista.

- Avisos no celular e tablet ficam abaixo do cabeçalho, respeitando a área segura e mantendo o novo botão Gestão acessível durante as mensagens.

- Leitura dos marcadores nativos de linha e coluna da Sheets API, preservando identificação do aluno e das dimensões criadas pela integração.

### Adicionado

- Fila FIFO durável dos envios automáticos às planilhas (ADR-039): chamada salva, saída e entrada registradas entram na tabela `fila_planilha` antes da resposta e são processadas na ordem de chegada, um consumidor por vez, com retentativas (até cinco, com espera crescente) para falhas confirmadas, sem repetir envio sem confirmação. Agenda de cinco minutos pelo GitHub Actions (`fila-planilha.yml`, com `CRON_SECRET`) e seção Fila de envios automáticos na Gestão, com Processar agora, Descartar e Reenfileirar. Exige aplicar a migração `fila_planilha`.
- Botão único Reorganizar turmas em Gestão > Turmas: ordena os alunos ativos de todas as turmas por nome e renumera a chamada, com confirmação, preservação do histórico e inativos após os ativos.

- Navegação da planilha de frequência por mês: o preparo concluído mostra o mês escolhido e oculta outros meses e abas legadas vinculadas. Mostrar mês na planilha permite consultar meses anteriores e voltar ao corrente, preservando células, fórmulas e envios para abas ocultas.

- Abas mensais de frequência com nome do mês por extenso, sem Turma atual nem colunas de sábado e domingo. Preparar mês atualiza abas existentes preservando registros dos dias úteis e vínculos; envios mensais não recriam fins de semana. Preparo e envio compartilham proteção contra alterações simultâneas.
- Aba Saídas e entradas em Relatórios, com consultas por dia, semana de segunda a domingo e período personalizado, filtro por turma, totais e detalhes agrupados por turma. Preserva os registros de alunos inativos e a turma histórica das entradas.
- Agrupamento Por aluno em Relatórios, Saídas e entradas, com as saídas e as entradas de cada aluno no período, busca por nome e filtro de duas ou mais movimentações.

- Acabamento de vidro nas roscas do Painel, com reflexos discretos, centro circular, legendas legíveis e detalhes opacos, seguindo a tipografia e as cores da interface nos temas claro e escuro.

- Automação do schema de preview por pull request: o workflow cria, migra e remove `preview_pr_<n>`, mantém o fallback `preview` na `main`, oferece faxina semanal e, com token da Vercel, aponta a branch para o schema do pull request.

- Navegação dos gráficos no desktop com seleção direta e botões anterior e próximo, mantendo deslize e teclado.
- Resumo visual em Relatórios com filtros de mês, série e turma, comparação de infrequência entre séries ou turmas, evolução diária com tabela acessível e ranking de alunos por faltas. Dias sem chamada ficam sem taxa; carregamento e falhas não apresentam valores antigos.
- Configurações organizadas nas categorias Escola, Planilhas, Acesso e avisos, e Dados, preservando formulários e retorno do Google para a planilha correspondente.
- Largura máxima por tela no desktop, mantendo o conteúdo centralizado e evitando formulários e listas excessivamente esticados.

- Seletores de ano e turma da Chamada com hierarquia visual mais clara, contagens identificadas e acessíveis, áreas de toque maiores e seleção indicada por borda, fundo suave e ícone.

- Implantação em AWS, Azure e GCP com Terraform, com módulos em `infra/terraform/`, modo local nos emuladores do Floci, workflow `infra.yml` e documentação em `docs/implantacao-nuvem.md` (ADR-036).
- Sonda de prontidão em `HEALTHCHECK` na imagem Docker, usada pelo Docker e pelos emuladores de Container Apps.
- README reestruturado no padrão de repositórios de referência, com selos, sumário, demonstração, arquitetura, deploy, FAQ, suporte e créditos.
- Spec `tests/e2e/imagens.spec.ts` e comandos `capturas:readme` para gerar as capturas versionadas em `docs/imagens/`; capturas locais de validação passam a ficar em `docs/imagens/locais/`, fora do versionamento.
- Catálogo de etiquetas em `.github/labels.json` e script `npm run etiquetas:sync` para sincronizá-las pelo GitHub CLI.
- Workflow `etiquetas.yml`, que aplica etiquetas de área pelos caminhos e de tipo pelo título e valida título e etiquetas em pull requests.
- Templates de issue ampliados (Bug, Melhoria e Tarefa) e template de pull request com etiquetas, commits atômicos, ciclo de rascunho e uso de IA.
- Confirmação manual "Registrado na Seduc" por aluno e dia da chamada diária salva, com data e responsável, agora operada na Chamada Parcial. Correções desmarcam apenas os alunos afetados; confirmações são preservadas na cópia JSON (ADR-035).

- Chamada Parcial separada da chamada diária, com presença por turno ou aulas, revisão concorrente e confirmação manual "Registrado na Seduc". Correções reabrem a pendência; nomes históricos e confirmação entram na cópia JSON sem invalidar arquivos antigos (ADR-034).
- Terceira planilha Google para chamadas parciais, com aba própria, prévia obrigatória e atualização explícita somente de linhas identificadas pela integração.

- Envio automático à planilha ao registrar saídas e entradas, por interruptor em Gestão, Planilha de saídas (desligado por padrão): só acrescenta linhas, sem repetir depois de envio sem confirmação.
- Chamada com seletor segmentado de séries e as turmas da série ativa logo abaixo; a série e a turma escolhidas ficam em verde, tocar em outra série seleciona a primeira turma dela e tocar na ativa recolhe as turmas; na Gestão, as turmas específicas da origem ficam numa seção recolhível.
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

- Pool de conexões do runtime configurável por `POOL_MAX_CONEXOES` (padrão 10), sem depender de variável de plataforma; `/api/saude` prefere `COMMIT_SHA` e mantém os fallbacks existentes.

- Acabamento dos seletores da Chamada estendido à interface: cartões, controles, menus, diálogos, navegação e entrada compartilham reflexos discretos, bordas arredondadas e seleção verde suave. A tipografia Plus Jakarta Sans também passa a ser aplicada ao corpo e aos números tabulares. Transparência reduzida, alto contraste e cores de frequência são preservados.

- Chamada Parcial passa a reunir a chamada diária salva e os ajustes por dia inteiro, turno ou aulas, com confirmação RS concentrada nessa tela. Presentes aparecem como Dia inteiro; faltas preservam a situação da Chamada, sem alterar os registros da coordenação. A terceira planilha usa a mesma lista e mantém uma linha por aluno e dia, reconhecendo códigos antigos.

- Confirmação da Seduc com rótulo RS e descrição acessível completa, agora concentrada na Chamada Parcial para liberar a lista da Chamada diária.

- Indicadores de faltas, justificadas e presentes ficam dentro do resumo recolhível da Chamada, aberto pelo botão arredondado Resumo de hoje, com filtros preservados e identificação da data consultada.

- Seletores de ano e turma da Chamada com acabamento de vidro, reflexos discretos e confirmação circular, mantendo a paleta institucional, texto opaco e alternativas de acessibilidade.

- Guia de contribuição e AGENTS.md passam a exigir etiquetas em issues e pull requests, commits atômicos organizados em um único pull request e abertura somente com o trabalho finalizado.
- Gestão passa para o cabeçalho do celular, antes do sino. Chamada Parcial ocupa o lugar ao lado de Chamada na navegação inferior.

- Um só botão da planilha, ao lado das abas Saídas e Entradas, envia as saídas e as entradas do mês juntas, com prévia e confirmação únicas.
- O botão da planilha passou para a linha das abas Saídas e Entradas, sem a faixa de título que sobrava. O Painel perdeu o botão de atualizar e se atualiza sozinho a cada minuto e ao voltar para a aba do navegador.
- Integrações de planilhas deixam de criar abas de backup. A Gestão oferece limpeza das cópias antigas com prévia e confirmação administrativa, preservando turmas e abas manuais. A conexão legada exige publicar o Apps Script 7.
- Painel sem o título e a data "Infrequência em ..." acima dos cartões; o título fica só para leitores de tela.
- Interface mais limpa: sem títulos e textos de apoio visíveis em Chamada, Saiu mais cedo, Entradas atrasadas, Grade e Gestão, nem os avisos fixos das abas Alunos, Equipe e Diretores e a explicação da Planilha de entradas. Os títulos ficam só para leitores de tela, e os avisos de exclusão e de palavra-chave seguem nos diálogos.
- A exibição da turma de origem e do asterisco na Chamada é configurável pela escola, com ativação e seleção de séries completas ou turmas específicas. Desativar preserva a seleção e os dados. A migração mantém a 3ª série já cadastrada selecionada; instalações novas começam com o recurso desligado.
- O Painel distribui as faltas do dia pela turma atual, como a chamada aconteceu.
- Workflows renomeados para `qualidade.yml`, `testes.yml` e `migracoes.yml`, com o padrão de nomes em português.
- Textos de Gestão > Configurações reduzidos, com descrições curtas, menos instruções repetidas e ajuda técnica do Apps Script recolhida. Títulos, estados, rótulos e avisos de confirmação permanecem disponíveis.
