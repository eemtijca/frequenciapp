# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Enquanto a primeira versão pública não é lançada, a versão do projeto permanece fixada em `0.1.0`. A primeira release será a `v1.0.0`.

## [Não publicado]

### Adicionado

- Planilha de saídas agrupa os registros por turma e aluno, com desempate por data. Envios manuais e automáticos movem linhas completas criadas pelo app, preservando os demais campos e as posições de linhas manuais. Um envio sem registros novos também organiza a aba existente.

- O marcador P da Chamada passa a usar verde no texto e na borda, com fundo suave, no mesmo padrão dos indicadores de presença da aplicação.

- Chamada remove a orientação repetida abaixo dos alunos e simplifica a barra de salvamento para uma linha, com status curto, botão Salvar e descarte por ícone com confirmação. O horário salvo, os avisos de falha e conflito e as áreas de toque são preservados.

- Chamada apresenta linhas com fundos alternados, sem busca ou contagem de alunos no cabeçalho. Na chamada bloqueada, faltas comuns deixam de mostrar o seletor de justificativa; faltas justificadas mantêm o motivo. O acumulado passa a considerar apenas o mês consultado, preservando o histórico dos relatórios.

- Círculos das turmas ficam menores, limitados a 64 pixels, preservando área confortável de toque. Os anéis passam a ter oito segmentos mais espessos, verdes após salvar a chamada.

- Turmas da Chamada passam a usar círculos compactos, somente com o nome e anel verde após salvar a chamada. A seleção mantém contorno azul, pendências e estados neutros continuam identificados, e os percentuais permanecem nos cabeçalhos de série e em Turmas.

- Chamada agrupa as turmas dentro de cada série em um painel recolhível chamado Turmas. O cabeçalho mantém porcentagem geral e barra em degradê; abrir e fechar preserva a seleção, os rascunhos e os percentuais por série e turma, com acesso por toque e teclado.

- Chamada reúne as séries em um único seletor fino, com extremidades arredondadas e porcentagem dentro. A escolha fecha a lista e mostra abaixo as turmas com barras de progresso, preservando seleção, cores, rascunhos e acesso por toque e teclado.

- Seletores da Chamada passam a usar retângulos com cantos arredondados, nome, porcentagem e barra de progresso, sem contagem visível de alunos. A série avança conforme as turmas são salvas; cada turma indica pendência ou conclusão. Seleção azul, temas, teclado e estados neutros permanecem acessíveis.

- Chamada Parcial agenda justificativas por início e fim com o catálogo da Chamada e calendário futuro exclusivo. Períodos de até 31 dias pulam domingos e feriados e recusam sobreposição sem gravar parte do lote. Motivos aparecem na primeira Chamada e corrigem apenas o aluno em chamadas salvas, com revisão e histórico preservados. A confirmação manual passa a se chamar Registro na SEDUC. A cópia JSON preserva os novos registros.

- A série selecionada na Chamada recebe anel externo azul de 2 pixels, com foco de teclado destacado e respeito ao alto contraste, preservando as cores dos segmentos de progresso.

- Seção Proteção de dados e LGPD em Sobre, com aprovação institucional e consentimento informados pela escola, salvaguardas existentes, orientação para solicitações e link para o tratamento dos dados.

- Configuração assistida da planilha de frequência, com diagnóstico mensal somente de leitura, acesso à conexão, revisão das turmas e do mês e situação da sincronização. A conferência distingue estrutura pronta de frequências efetivamente enviadas e mantém a prévia antes de gravar.

- FrequenciBI permite personalizar os painéis predefinidos, atualizar visões salvas, recuperar a análise do Explorador e escolher paleta, valores, legenda e dimensões. Atalhos de período usam o fuso da escola; painéis mantêm recortes independentes e a edição se adapta ao celular.

- Presenças parciais (S) visíveis no Painel, no Resumo dos Relatórios e no resumo do período personalizado, com coluna própria na tabela diária; nenhum dia volta a zerar em silêncio.

- FrequenciBI em `/bi`: painel curado, explorador com dez visualizações, painéis personalizáveis por toque e teclado, comparações, metas, notas, destaques locais e dicionário. Chave independente da sessão; preferências locais e retratos offline identificados, com importação e exportação de configurações sem segredo, CSV e PNG confirmados e limpeza por chave.

- FrequenciBI recebe leitura escolar paginada por chave independente da sessão, com escopos por série, turma, período e base. Gestão administra criação, edição, rotação, revogação e histórico das chaves, com senha e auditoria; segredo aparece uma vez e permanece fora da cópia escolar.

- Administração edita a turma selecionada diretamente em Horários, com o cadastro existente e edição rápida de disciplina ou janela pela grade. Toda gravação depende de ação explícita; edição rápida e cópia entre turmas têm conferência antes de salvar. A cópia preserva aulas ativas e desativadas, recusa ordens repetidas sem gravar parte da grade e mantém faltas e histórico. Gestão conta apenas as aulas ativas e confirma a ativação ou desativação.

- Sincronização dos feriados do ano em Gestão, Configurações, Escola, Calendário letivo. A consulta lê todas as páginas da base configurada e grava as datas no calendário. O botão fica bloqueado depois da gravação; uma nova sincronização exige a senha do administrador. Sem feriados importados, o botão permanece ativo. Datas com chamada salva e feriados cadastrados à mão são preservados.
- Horários no menu, após Chamada, com consulta semanal por turma e dia e visualização da semana completa. Gestão > Turmas configura ordem, início, fim, dias e disciplina por dia, reutilizando as aulas existentes, sem nomes de professores. A migração adiciona o mapa de disciplinas vazio às aulas; cópias JSON antigas continuam aceitas.

- Calendário letivo anual em Gestão, Configurações, Escola, com feriados por data e nome para todas as turmas. Feriados bloqueiam Chamada e Chamada Parcial, inclusive sábados liberados, deixam a cobertura neutra e suspendem avisos escolares. Datas com frequências salvas são recusadas sem alterar o histórico; a cópia JSON preserva o calendário por mesclagem. Abas mensais omitem feriados e só retiram colunas próprias após conferir ausência de valores, fórmulas e notas.

- Chamada permite desbloquear um sábado letivo por turma e data com as aulas ativas, sem alterar a grade semanal. A liberação acompanha rascunhos e chamadas salvas, mantendo justificativas, frequência parcial e travas de revisão. Sábados com chamada salva são enviados e preservados nas abas mensais; domingos e sábados sem registros continuam fora.

- Seletores circulares de séries e turmas na Chamada: pendência em vermelho, conclusão em verde e anel por série com fatias proporcionais aos alunos. O progresso acompanha a data consultada e o salvamento, trata rascunhos e conflitos como pendência e mantém estado neutro em falhas ou turmas sem participantes. Rótulos usuais de ano aparecem como série no seletor.

- Resumo dos Relatórios: três botões escolhem o ranking de alunos com mais faltas no mês, Todas as faltas (F + FJ, o padrão), Sem justificativa (só F) e Justificadas (só FJ), com os filtros de mês, série e turma e o detalhe de F e FJ por aluno.

- Painel externo aceita links privados do Zoho Analytics, além do Looker Studio, com rótulos neutros, guia de conexão à planilha de indicadores e validação restrita do endereço da visualização.

- Painel externo no Google Looker Studio: Gestão prepara uma planilha exclusiva com indicadores agregados de frequência, saídas e entradas, chamada parcial e RS, sem nomes ou textos livres; atualização manual e automática, recuperação de criação incerta e guia para conectar o relatório privado.

- Documentação interativa da API em `GET /api/docs` com Swagger UI, especificação OpenAPI 3.1 em `GET /api/docs/openapi.json` e referência em Markdown em `GET /api/docs/api.md`, com `operationId`, descrições, exemplos e erros por operação.

- Lint da especificação OpenAPI com Redocly CLI (`pnpm run lint:api`) no workflow de qualidade, com o ruleset em `redocly.yaml`.

- Índice `public/llms.txt` para agentes de IA, com o contrato, a referência e a orientação de uso seguro.

- Descoberta do índice para agentes de IA na raiz anônima: link oculto com o domínio que atendeu a requisição, `rel=alternate` no HTML e cabeçalho `Link` da resposta; o `robots.txt` libera a raiz, o `llms.txt` e a documentação da API.

- Tela de entrada com os links do repositório no GitHub e da documentação da API, e diálogo Sobre com os desenvolvedores, o repositório, a instituição e a licença, também aberto no menu lateral e na tela do diretor de turma.

- ADR-043 sobre a documentação interativa e o CSP por URL.

- Semente de demonstração ampliada para um ano letivo: nove turmas (1º ao 3º ano, A a C), 35 a 50 alunos por turma, grade de tempo integral com nove aulas, chamadas e faltas em cauda longa com crônicos, episódios e justificativas, saídas, entradas, frequências parciais, feriados e recessos do calendário e diretores de turma de exemplo. A semente é determinística, com perfis de volume (`SEED_PERFIL`), parâmetros (`SEED_ALUNOS`, `SEED_DIAS`, `SEED_ANO`, `SEED_SEMENTE`) e limpeza seletiva (`pnpm run seed:limpar`).

- Capturas do README com dados: o Painel e a Chamada passam a exigir a semente aplicada e a mostrar o último dia letivo com chamada, e entram o Resumo dos Relatórios, as Saídas e entradas e a aba Turmas da Gestão.

- Capturas do README com dados: o Painel e a Chamada passam a exigir a semente aplicada e a mostrar o último dia letivo com chamada, e entram o Resumo dos Relatórios, as Saídas e entradas e a aba Turmas da Gestão.

### Alterado

- Ícone do aplicativo novo, em duas cores sólidas, verde da marca e branco: um aluno de mochila entra entre as duas folhas abertas de um portão em arco, e um pé de oiti de copa grande fica ao lado, sobre fundo verde uniforme. O desenho vem da conversão em SVG da imagem de referência da revisão, usada como traçado sem retoques de forma, e fica em `design/icone/mestre.svg` com fundo sangrado e tudo o que importa dentro da zona segura do recorte redondo do Android. Os PNGs `any`, `maskable` e o ícone da tela inicial do iOS saem dele por `pnpm run icones:gerar`, e o favicon vetorial em `src/app/icon.svg` usa o mesmo traçado com contorno branco mais grosso, para 16 e 32 pixels. Os ícones `any` passam a ter cantos arredondados transparentes, no lugar do canto branco. A versão do service worker sobe para renovar o cache.

- Chamada e Chamada Parcial deixam de mostrar o número do aluno à esquerda do nome, o que libera espaço para os nomes no celular. A lista continua na ordem da chamada.

- Seletores da Chamada mais compactos, com seleção discreta e anéis que mantêm os segmentos por turma mesmo em 100%. As fatias concluídas ficam verdes e as pendentes vermelhas.

- Chamada Parcial volta à barra lateral, logo abaixo de Chamada, com seleção e aviso de alterações próprios no desktop e no celular.

- Painel externo sai da Gestão, mantendo o acesso ao FrequenciBI na navegação lateral.

- Painel, gráficos no celular: duas setas acima dos cartões, à direita, voltam e avançam um gráfico, com bloqueio nos extremos e sem cobrir os textos, sem criar seletor nem botões novos. Os gráficos vizinhos ao em exibição montam em tempo ocioso e a leitura da posição durante o deslize deixa de medir o layout e de criar temporizadores a cada evento, o que reduz os picos de quadro na troca de gráfico. Em medição com o processador 4 vezes mais lento (8 passadas frias de cada versão no Chromium), as tarefas longas caíram de 15 para 6 e o tempo de script, em mediana, cerca de 21%.

- Relatórios, Por aluno: a lista se agrupa em séries e turmas recolhíveis, com a contagem de alunos e os totais do mês na turma, e os seletores de série e turma dão lugar aos botões Série e Turma, que recolhem ou expandem todos os grupos do nível. A busca mantém abertos os grupos com resultado. O novo botão Emitir relatório fica ao lado, por enquanto só com um aviso de que a geração do relatório em PDF virá em breve.

- Horários: a edição passa para Gestão, Configurações, categoria Horários, e a aba Horários fica só para consulta, inclusive para a administração. Intervalo da manhã (09:00 às 09:20), almoço (11:50 às 13:00) e intervalo da tarde (14:40 às 14:55) aparecem como linhas na ordem do horário, na consulta diária, nos cartões por dia e na tabela da semana, no lugar do cartão separado do almoço.

- Consulta diária de Horários separa Manhã e Tarde em botões, com intervalo de almoço das 11:50 às 13:00. A edição bloqueia a troca de turno sem desativar o formulário; aulas cadastradas no intervalo continuam acessíveis e a semana completa permanece disponível.

- Gerenciamento de dependências migrado de npm para pnpm, com o `packageManager` fixado, `pnpm-lock.yaml` versionado e `pnpm-workspace.yaml` autorizando os scripts de build; `pg` passa a ser declarado e o estágio de execução do Dockerfile usa as dependências de produção do pnpm.

- Buscas de Alunos, Gestão, Chamada, Chamada Parcial e Grade reutilizam nomes e agrupamentos; a Gestão preserva os controles das linhas mantidas ao filtrar, relatórios por aluno não recalculam o mês a cada tecla, e a troca do ranking mantém os indicadores já calculados. Painel e Grade suspendem consultas ocultas e retomam ao abrir, preservando filtros. Seletores de horário rolam apenas as opções, listas buscáveis agrupam ajustes do teclado por quadro e confirmações ficam roláveis em telas baixas.

- No celular, o seletor de tema passa do menu lateral para o cabeçalho, ao lado do sino de notificações, e o menu lateral fica mais estreito (15 rem no máximo, antes 20 rem). No desktop, o seletor continua no cartão da pessoa, na barra lateral.

- Menu lateral do celular abre, fecha e troca de tela sem engasgos. O estado aberto fica num componente próprio, sem renderizar as telas montadas a cada toque; o painel lateral fica opaco e sem desfoque; o véu deixa de usar a trava de rolagem do Radix, que recalculava o estilo do app inteiro; e a nova tela renderiza depois do fechamento. Num celular emulado com CPU 4× mais lenta, a maior tarefa longa ao abrir cai de cerca de 230 ms para nenhuma.

- Navegação no celular passa da barra inferior para um menu lateral aberto pelo cabeçalho, com as mesmas seções, permissões e ações de conta da barra lateral do desktop. O menu reúne perfil, tema, senha, notificações e saída, fecha ao selecionar, usar Escape, tocar fora ou ampliar para desktop, e mantém foco, áreas seguras e rolagem própria. Chamada Parcial continua acessível somente pelo ícone da Chamada.

- Chamada bloqueia todo sábado por padrão, também quando a turma tem aula no sábado na grade, e só o botão Sábado letivo libera a chamada daquela turma e data; chamada salva e rascunho recuperado mantêm a liberação. A regra é da interface: a API não muda.

- Chamada Parcial deixa de ter item na navegação e passa a abrir por um botão só de ícone na linha do Resumo da Chamada, à direita do Desbloquear. A visão, o estado e a confirmação de alterações não salvas não mudam, e o botão Chamada da navegação fica destacado enquanto ela está aberta.

- Chamada: o botão Desbloquear (ou Bloquear) passa para a linha do Resumo, à direita dele, e o quadro com "Chamada bloqueada" e a frase de apoio deixa de aparecer. A lógica do bloqueio e o rótulo acessível do botão não mudam.

- Legendas dos gráficos diários mostram apenas o total de alunos em uma caixa com cantos arredondados; a cobertura completa permanece no nome acessível e no detalhe por apontamento. Círculos de quantidade e distribuição das faltas recebem fundo vermelho do tema, também no gráfico personalizado.

- Anel de cobertura das chamadas mostra uma fatia por turma com alunos ativos, proporcional ao tamanho da turma: verde para chamada salva e vermelho para pendente. Ao concluir todas, o anel fica inteiramente verde, sem divisões; o estado de cada turma também fica disponível para leitores de tela.

- Resumo do Painel concentra a infrequência do dia em um cartão e mostra Sem dados quando não há chamadas salvas. Cabeçalhos dos gráficos da escola e das séries deixam de repetir a quantidade de faltas já exibida nas roscas.

- Relatórios e Chamada Parcial deixam de repetir títulos e explicações na tela; os títulos permanecem acessíveis a leitores de tela. Chamada Parcial remove a contagem duplicada de registros e pendências e o rodapé de conexão da planilha. A posição na faixa de gráficos passa a ser anunciada somente por leitores de tela.

- Cobertura do dia no Painel passa a usar progresso circular, contagem compacta de alunos e status com ícones; turmas pendentes ficam recolhidas e podem ser consultadas por toque. A instrução de deslizar fica exclusiva para leitores de tela, e o aviso repetido de chamada bloqueada sai do fim da lista.

- Gráficos do Painel, Relatórios e diretores carregam Recharts sob demanda quando próximos da área visível; cartões fora de exibição aguardam a visita, com espaço reservado e falhas de download isoladas do restante da tela.

- Diálogo de envio à planilha (Relatórios, Grade, e Enviar todas as turmas na Gestão) mais enxuto: escolha de alcance em duas opções lado a lado, um único bloco por aba com os totais em caixas (sem zeros e com os dias resumidos), detalhes e opções recolhidos, e remoção de linhas e colunas sempre à vista (travada fora do modo completo), com as colunas de dia em caixas marcáveis (Marcar todas e Limpar).
- Saídas e entradas, Relatórios e Gestão: as informações de cada registro (por exemplo "Luto" e "O tio faleceu.", ou turma, horário e momento) aparecem em caixas arredondadas separadas, no lugar do ponto entre elas.
- Relatórios, Saídas e entradas, agrupamento Por aluno: o campo de busca por nome virou um seletor com a relação dos alunos da turma escolhida (ou de todas as turmas), com a opção Todos os alunos e filtro por texto na lista.
- Planilha de saídas passa a se chamar "Planilha de entradas e saídas" na Gestão, e a aba Entradas tem as mesmas sete colunas de Saídas (sem Código, com Responsável no lugar de Liberado por). Preparar e organizar a aba Entradas saíram da área Saídas e entradas e ficam nessa seção; preparar realinha a aba no formato anterior, preservando os registros.

- Textos de apoio mais curtos em Gestão, Alunos, Notificações, Saídas e Entradas; Relatórios por aluno deixa de repetir a descrição dos indicadores. Limites dos campos, rótulos acessíveis e orientações de privacidade e segurança permanecem disponíveis.

- CSP passa a ser montada por URL em `src/infra/csp.ts`, com `'unsafe-eval'` apenas na documentação interativa, exigido pela validação do "Try it out".

- O `postinstall` também copia os assets do Swagger UI para `public/vendor/swagger-ui`, e `@scarf/scarf` (telemetria transitiva) fica explicitamente negado nos scripts de instalação.

### Removido

- Integração por Apps Script, publicação manual, controles de token e endereço, rotas antigas e quatro campos do banco. As conexões existentes por Entrar com Google são preservadas; configurações do provedor antigo exigem seleção de arquivo pelo Google (ADR-033).

- Gradientes da interface (superfícies, controles, botões, estado selecionado e fatias das roscas): o acabamento de vidro segue o mesmo, com preenchimentos sólidos e brilho suave por sombra interna, e a classe sem uso `grafico-vidro` saiu da rosca do Painel.
- Resumo "Saídas por turma" e relatório semanal por aluno da aba Saídas; no lugar do resumo fica a lista simples das saídas do dia, com remoção para correção.

### Corrigido

- Saídas: com a leitura do dia falhando, a lista deixa de exibir as saídas do dia anterior sob a data escolhida; a mensagem de falha aparece sozinha, com o dia vazio.

- Gestão, planilhas: o tempo restante do modo completo acompanha o relógio do navegador minuto a minuto e não depende mais do relógio do servidor na primeira pintura.

- Chamada Parcial exibe Registro na SEDUC somente para faltas com justificativa e aplica a mesma regra aos filtros de pendência e confirmação. A mensagem de lançamento pendente deixa de ocupar as linhas dos alunos; confirmações anteriores e observações permanecem preservadas.

- Painel, gráficos no celular: o deslize para os lados que começava sobre um campo ou botão do cartão, como no gráfico personalizado, não movia a faixa, que voltava ao cartão de origem e dava a impressão de engasgo ao tentar voltar. O arrasto horizontal passa a valer como gesto pelos eventos de toque, e o teste de navegador cobre o deslize iniciado sobre o seletor de data.

- Conferência do mapa de frequência vinculada ao arquivo, credencial, revisão e estrutura lida, impedindo salvar leituras antigas ou adulteradas. Trocar de arquivo desliga a automação e encerra o modo completo; habilitar o envio automático exige configuração válida.
- Confirmações de frequência em abas antigas passam a identificar arquivo e aba estável. Trocar de planilha ou recriar uma aba com o mesmo nome mantém os dias pendentes no destino novo; sucessos antigos sem identificação exigem nova conferência conservadora, preservando o histórico.

- Organização das abas sem mês mostra aluno, data e células das pendências, permite conferir homônimos, incluir linhas de alunos históricos e escolher marcas divergentes com nova prévia e senha administrativa. Códigos estáveis reconhecem nomes corrigidos; destinos únicos sem código também são aceitos, sem associar códigos diferentes.

- FrequenciBI repete de forma limitada a conferência de acesso após falhas temporárias de rede, sem repetir recusas de chave ou limites de consultas. Falhas de revalidação também ficam visíveis durante uma consulta aberta.

- FrequenciBI corrige categorias duplicadas, ordem semanal, taxas por aluno, cobertura restrita ao escopo e atualização da comparação. Tabelas ajustam a paginação, mapas de calor preservam células após o centésimo grupo, séries mantêm lacunas sem base e PNG inclui legenda e resumo. A impressão aguarda os gráficos fora da tela.

- Retirada de abas antigas identifica as células com totais calculados e notas e mantém o botão de conclusão visível. A confirmação pode descartar esses complementos com autorização explícita e senha administrativa, preservando as frequências nos meses e bloqueando fórmulas em nomes ou datas. A prévia também vence quando notas ou fórmulas mudam sem alterar o resultado exibido.

- Histórico mensal da planilha permanece acessível, inclusive setembro e anos anteriores. A Gestão oferece links diretos por mês e turma e transfere as marcas das abas sem mês para os destinos preparados antes de retirá-las, com prévia, conferência de conteúdo e proteção contra divergências.

- Presenças omitidas no preenchimento inicial das listas históricas: a nova migração recupera alunos da turma de origem cadastrados até o salvamento ou a importação, sem reinterpretar chamadas posteriores nem remover faltas e confirmações. Os dias corrigidos ganham revisão e auditoria e ficam pendentes de reenvio às planilhas.

- Indicadores deixam de zerar quando a grade da turma ganha aulas depois do registro da chamada. Cada chamada guarda o retrato congelado das aulas previstas no dia, gravado no primeiro salvamento, e a derivação das marcas usa esse retrato em vez da grade atual; a migração reconstrói o retrato das chamadas existentes e o histórico não é reclassificado por edições de grade.

- Build da documentação interativa prepara o JavaScript e o CSS do Swagger UI também na Vercel, independentemente do postinstall em cache. A instalação usa a sintaxe do pnpm 12 e inclui as dependências de desenvolvimento; arquivos ausentes interrompem a compilação e o teste de navegador confere a renderização real da API.

- A documentação interativa deixa de repetir o título da API no topo da página: a descrição da especificação começa pela visão geral, e a guarda de unidade reprova a repetição do título.

- Horários no celular: o cartão do almoço deixava de aparecer inteiro ao rolar até o fim, com a borda inferior colada na borda da tela, e a página termina agora com folga. Semana completa e Editar horários passam a dividir uma linha, deixando a tela menos alta.

- As suítes usam o último dia com chamada como referência: os testes de entrega de push fixam o relógio em um dia útil, o contrato da agenda e o fluxo de desistência são ignorados aos domingos, e os cenários de ponta a ponta passam a usar o sábado quando hoje é domingo.

- O cenário de Calendário escolhe dias livres anteriores ao dia de referência: quando a execução cai em um dia útil, o feriado criado pelo próprio teste não desabilita o seletor de turma antes do clique.

- Feriado e chamada da mesma data salvos ao mesmo tempo não são mais aceitos os dois. As transações que gravam feriados (cadastro, remoção, sincronização e restauração da cópia) e as que salvam Chamada e Chamada Parcial travam a tabela de feriados antes de ler. Chamadas simultâneas continuam sem esperar umas pelas outras.

- A sincronização de feriados distingue a chave recusada da recusa da base: cada caso tem mensagem própria, e o motivo devolvido pela base entra no log sem repetir o token.

- Domingo não tem aula nem chamada. A API recusa salvar Chamada e Chamada Parcial em domingo, o calendário e as setas de dia da Chamada, da Chamada Parcial e do Painel pulam o domingo (aos domingos abrem no sábado anterior), a grade padrão de uma turma nova vai de segunda a sábado, a Gestão e a API de aulas não aceitam domingo e os lembretes de chamada pendente não o contam. Chamadas de domingo já salvas continuam nos relatórios e no histórico.

- Uma conferência concluída de saídas ou entradas libera a tentativa anterior mesmo quando as duas gravações caem no mesmo instante.

- Os anéis de cobertura usam título em uma linha, para a hidratação não descartar a página e o primeiro toque na navegação não se perder.

- A faixa de gráficos do Painel mantém o cartão em exibição quando a largura muda ou a visão é ocultada, inclusive ao passar do desktop para o celular e ao voltar de outra seção.

- Falha de leitura da Chamada mantém marcações e salvamento bloqueados em qualquer dia, preservando o rascunho local até uma consulta confirmada. Navegação e nova tentativa continuam disponíveis.

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

### Segurança

- A administração não redefine mais a própria senha pela Gestão, o que dispensava a senha atual e permitia a quem tivesse só a sessão abrir a cópia completa, criar chaves do FrequenciBI e destravar o modo completo. A própria senha muda pela troca com a senha atual.

- Redefinir a senha de uma conta pela Gestão encerra todas as sessões e assinaturas de aviso dela, como já fazia a desativação, que passa a remover também as assinaturas. Antes, um acesso comprometido continuava valendo por até 30 dias depois da redefinição.

- A troca da própria senha confere a senha atual com até cinco tentativas em 15 minutos por conta.

- O limite de tentativas de entrada por dispositivo usa o último endereço de `X-Forwarded-For`, escrito pelo proxy, e não mais o primeiro, que o cliente podia trocar a cada tentativa.

- O PostgreSQL do Docker Compose é publicado só no loopback do host, sem expor a senha fixa na rede; em produção, o `AUTH_SECRET` de exemplo do `.env.example` é recusado na partida; a documentação interativa deixa de guardar no navegador as credenciais digitadas em Authorize.

- No FrequenciBI, chave com lista vazia de séries ou turmas recusa também os catálogos (justificativas, liberadores e feriados), e o CSV neutraliza fórmulas também nas células de lista.

- O teste das guardas da API passa a recusar rotas fora de `route.ts`, manipuladores exportados de outra forma, guarda só em comentário, guarda sem a recusa e server actions.

- Documentação LGPD alinhada ao código: código do aluno nas planilhas, terceiro arquivo com a frequência por aluno e dia, e-mails da equipe na auditoria, IP nas tentativas de entrada, nomes históricos retidos, exclusão de diretores e exportações do FrequenciBI sem ZIP.

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
