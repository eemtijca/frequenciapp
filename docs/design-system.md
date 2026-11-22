# Design system

Contrato visual do FrequenciApp depois da migração para Material UI v9. A decisão e as alternativas estão no [ADR-081](adr/081-material-ui-e-tema-dos-templates.md). O comportamento das telas continua descrito em [interface.md](interface.md).

## Princípios

- Uma única fonte de verdade para cor, tipografia, espaçamento, largura, raio e elevação.
- Material Design 2 como referência de layout e Material UI v9 como implementação mantida.
- Verde institucional na marca, sem substituir as cores semânticas de falta, justificada, alerta, sucesso, informação, aviso e erro.
- Toda tela usa os mesmos componentes de página, cartão, formulário, tabela e diálogo.
- Acessibilidade faz parte do componente, não é um ajuste posterior.
- Nenhuma tela define largura, grid, cor ou espaçamento próprios.

## Grade responsiva

A grade segue o Material Design 2, com 4, 8 ou 12 colunas, margens laterais e gutters fixos por faixa.

| Faixa           | Colunas | Margem               | Gutter | Corpo               |
| --------------- | ------- | -------------------- | ------ | ------------------- |
| 0 a 599 px      | 4       | 16 px                | 16 px  | fluido              |
| 600 a 904 px    | 8       | 32 px                | 24 px  | fluido              |
| 905 a 1239 px   | 12      | flexível             | 24 px  | 840 px              |
| 1240 a 1439 px  | 12      | flexível, até 200 px | 24 px  | entre 840 e 1040 px |
| 1440 px ou mais | 12      | flexível, até 200 px | 24 px  | 1040 px             |

Regras:

- A grade-base é de 8 dp.
- Os espaçamentos de composição são 4, 8, 12, 16, 24, 32, 40 e 48 dp. `theme.spacing(1)` vale 8 px.
- Reserve pelo menos 12 px entre um trilho de abas visível e o início do painel. A grade diária de Horários mantém 16 px entre as abas Manhã/Tarde e o cartão de aulas para separar a navegação da grade. Cabeçalhos de página e seção têm 8 px entre o título e a descrição. Em um cabeçalho compacto empilhado, reserve 12 px entre o texto e sua ação. Essas folgas não alteram a altura dos controles, as linhas de tabela nem a relação entre rótulo e campo.
- O gutter é 16 px no celular e 24 px nas demais faixas.
- A margem lateral é 16 px no celular, 32 px no tablet e flexível até 200 px no desktop.
- O conteúdo não acompanha a largura da janela sem limite. Ele usa uma das larguras de conteúdo.
- Tabelas largas podem rolar na horizontal, com a primeira coluna fixa. Nunca se comprime uma coluna para caber.
- Formulários usam uma coluna no celular e duas no desktop, com gap de 24 px.

## Breakpoints e larguras

| Token | Valor | Uso                                 |
| ----- | ----- | ----------------------------------- |
| `xs`  | 0     | celular                             |
| `sm`  | 600   | tablet pequeno                      |
| `md`  | 905   | gaveta permanente e conteúdo de 840 |
| `lg`  | 1240  | conteúdo de 1040                    |
| `xl`  | 1440  | margens flexíveis até 200 px        |

Larguras de conteúdo:

| Largura | Uso                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------- |
| 840 px  | leitura, formulários, Chamada, Chamada Parcial, Horários, Saídas e Entradas, Alunos e Minhas turmas |
| 1040 px | Gestão e Relatórios                                                                                 |
| 1280 px | exceção documentada para Grade, Relatórios largos e FrequenciBI                                     |

A largura de 1280 px é a única exceção. Nenhuma outra tela cria `max-w-*`, `w-[...]`, `maxWidth` local ou contêiner próprio. A escolha é feita pela prop `largura` de `LayoutConteudo`.

## Tipografia

A família é Plus Jakarta Sans, carregada por `next/font/google` com a variável `--font-jakarta`. A pilha de fallback é `var(--font-jakarta), "Plus Jakarta Sans", sans-serif`. Valores monoespaçados usam JetBrains Mono em `--font-jetbrains-mono`.

| Variante    | Tamanho | Peso | Altura de linha | Uso                                      |
| ----------- | ------- | ---- | --------------- | ---------------------------------------- |
| `h1`        | 48 px   | 600  | 1.2             | título de entrada e destaque excepcional |
| `h2`        | 36 px   | 600  | 1.2             | título de página                         |
| `h3`        | 30 px   | 400  | 1.2             | seção ampla                              |
| `h4`        | 24 px   | 600  | 1.5             | indicador principal e título de cartão   |
| `h5`        | 20 px   | 600  | padrão          | subtítulo de seção                       |
| `h6`        | 18 px   | 600  | padrão          | título de bloco                          |
| `subtitle1` | 18 px   | 400  | padrão          | apoio de título                          |
| `subtitle2` | 14 px   | 500  | padrão          | rótulo de grupo                          |
| `body1`     | 14 px   | 400  | 1.5             | texto corrente                           |
| `body2`     | 14 px   | 400  | 1.5             | texto secundário                         |
| `caption`   | 12 px   | 400  | padrão          | legenda, ajuda e metadado                |
| `button`    | 14 px   | 500  | padrão          | rótulo de botão, sem caixa alta          |

Regras:

- `h1` usa `letter-spacing` de -0.5 px e é reservado à Entrada e a destaques excepcionais.
- Cada página tem um único `h1` ou `h2` visível, conforme a hierarquia do documento.
- `textTransform` é `none`. Nenhum botão ou aba usa caixa alta automática.
- Números de tabela, contadores, datas, percentuais e indicadores usam `font-variant-numeric: tabular-nums`.
- O texto corrente não desce abaixo de 14 px. Texto de 12 px fica restrito a legenda, ajuda e metadado.

## Cores e semântica

### Escala verde

| Token       | HSL                  | Uso principal                                            |
| ----------- | -------------------- | -------------------------------------------------------- |
| `brand.50`  | `hsl(158, 55%, 96%)` | fundo suave e texto sobre verde escuro                   |
| `brand.100` | `hsl(158, 50%, 92%)` | fundo de destaque                                        |
| `brand.200` | `hsl(158, 45%, 82%)` | borda e estado suave                                     |
| `brand.300` | `hsl(158, 45%, 66%)` | `primary.main` no tema escuro e texto escuro sobre verde |
| `brand.400` | `hsl(158, 50%, 49%)` | `primary.main` no tema escuro                            |
| `brand.500` | `hsl(158, 55%, 42%)` | `primary.light` no tema claro                            |
| `brand.600` | `hsl(158, 55%, 35%)` | estado e apoio do botão verde                            |
| `brand.700` | `hsl(158, 60%, 28%)` | `primary.main` no tema claro e fundo do botão verde      |
| `brand.800` | `hsl(158, 65%, 18%)` | texto e contraste                                        |
| `brand.900` | `hsl(158, 70%, 10%)` | texto e contraste máximo                                 |

### Papéis semânticos

| Papel         | Cor                  | Uso                                   |
| ------------- | -------------------- | ------------------------------------- |
| `primary`     | verde institucional  | marca, seleção e foco                 |
| `secondary`   | verde institucional  | compatibilidade com ações já migradas |
| `falta`       | vermelho             | falta sem justificativa               |
| `justificada` | azul próprio         | falta justificada e informação        |
| `alerta`      | âmbar                | atenção, limite e benefício           |
| `success`     | verde do template    | confirmação e conclusão               |
| `info`        | azul separado        | informação neutra                     |
| `warning`     | laranja do template  | aviso e atenção                       |
| `error`       | vermelho do template | erro e ação destrutiva                |

Regras:

- O tema claro usa fundo `#f6f6f6`, papel branco e texto grafite. O escuro usa fundo `#141413`, papel `#1f1e1d` e texto claro.
- `divider` separa superfícies e seções. `bordaControle` delimita campos: precisa de contraste suficiente mesmo em repouso.
- `secondary` usa a mesma família verde, com contraste validado.
- `justificada` e `info` usam azul próprio e nunca o verde da marca.
- `success` usa a escala verde do template e precisa ser distinguível de `primary` em ambos os temas.
- `warning` e `alerta` usam a escala laranja e âmbar do template.
- `error` e `falta` usam a escala vermelha. O vermelho é estritamente semântico e não decora a interface.
- Nenhuma cor é escrita diretamente no componente. Cores vêm de `theme.vars.palette` e dos tokens de `src/theme/paleta.ts`.

### Contraste

- Texto normal tem no mínimo 4,5:1.
- Texto grande, componentes, bordas funcionais, ícones e foco têm no mínimo 3:1.
- A ação principal usa o verde sólido `brand.700` com texto `brand.50` nos dois temas. O anel de foco é independente do preenchimento.
- `success` é comparado com `primary`, não com um passo isolado da escala.
- `justificada` é comparada com `primary` e com `falta` nos dois temas, inclusive sob simulação de daltonismo.
- O contorno sólido de foco usa a cor primária do tema e deve atingir 3:1 contra o fundo adjacente.
- Nenhum estado usa cor como único sinal. Falta, justificada, alerta e sucesso também têm rótulo textual, ícone ou padrão.

## Botões

| Variante MUI      | Aparência                  | Uso                                               |
| ----------------- | -------------------------- | ------------------------------------------------- |
| `primary` contido | verde institucional sólido | ação principal, como Entrar ou Salvar             |
| `inherit` contido | fundo e contorno neutros   | ação de apoio que precisa de ênfase intermediária |
| `error` contido   | vermelho semântico         | ação destrutiva, como Excluir                     |
| `outlined`        | contorno e fundo do papel  | ação secundária                                   |
| `text`            | sem fundo em repouso       | ação discreta, como Voltar ou Fechar              |

Regras:

- Nas primitivas compartilhadas, use `principal` ou `neutro` para explicitar a função. Os nomes `primario` e `secundario` mantêm a compatibilidade dos chamadores que ainda serão revisados.
- Altura pequena de 36 px e altura média de 40 px.
- O alvo de toque é de 48 dp, mesmo quando a caixa visual tem 36 dp.
- O foco visível tem 3 px, com a cor primária e deslocamento de 2 px.
- Não há sombra em repouso.
- `textTransform` é `none`.
- Cada região tem uma única ação principal. Duas ações contidas verdes na mesma região não são permitidas.
- Em carregamento, o botão fica ocupado, ignora toque duplo e mantém o rótulo legível.
- O botão de ícone tem rótulo acessível e área de toque de 48 dp.
- O botão com `href` usa `NextLink` por dentro. `href` e `onClick` não coexistem.

## Campos e formulários

- `TextField` usa `variant="outlined"`.
- Altura média de 56 px e pequena de 40 px.
- Fundo do papel, borda funcional de 1 px e raio de 12 px. Cartões usam raio de 16 px.
- O rótulo fica acima do campo, com `FormLabel`. O placeholder é exemplo, não rótulo.
- Texto de apoio e erro ficam abaixo, com `FormHelperText`.
- O foco tem contorno de 3 px.
- Não existe a linha inferior única do tema anterior.
- O erro usa `error` e `helperText`, com `aria-describedby` ligando o campo à mensagem.
- O campo obrigatório é identificado no rótulo e no texto de apoio.
- O campo desabilitado mantém contraste e não usa `opacity` global.
- O campo de senha tem botão Mostrar e Ocultar com rótulo alternado.
- O campo de busca tem `InputAdornment` no início e botão de limpar no fim, com rótulo acessível.
- O formulário usa `FormControl`, `FormLabel`, `TextField` e `FormHelperText`.
- No celular, o formulário tem uma coluna. No desktop, tem duas colunas com gap de 24 px.
- As ações ficam alinhadas à direita no rodapé. Cancelar é `text` ou `outlined`.

## Tabelas

- `TableContainer` usa `Paper` ou `Card`.
- O cabeçalho tem 56 px.
- As linhas têm 52 px.
- O padding de célula é 16 px.
- Números ficam alinhados à direita e usam numerais tabulares.
- A tabela tem `caption` acessível e cabeçalhos com `scope`.
- A primeira coluna fica fixa em tabelas largas, como Grade, Relatórios e Gestão.
- O cabeçalho fica fixo em listas longas, com `stickyHeader`.
- No celular, a tabela vira cartões ou rola na horizontal com a primeira coluna fixa.
- Nunca se comprime uma coluna para caber. O conteúdo mantém a largura mínima legível.
- Cada linha de cartão no celular é um cartão de primeiro nível. Não existe cartão dentro de cartão.
- A ordenação e os filtros têm rótulo acessível e estado anunciado.

## Diálogos e sobreposições

- Largura máxima de 560 px.
- Padding de 24 px.
- Raio de 10 px, conforme o template.
- `DialogTitle`, `DialogContent` e `DialogActions` ficam separados.
- No celular, formulários longos usam `fullScreen`.
- A ação destrutiva ou de decisão usa `role="alertdialog"`, com `aria-labelledby` e `aria-describedby`.
- O foco fica contido no diálogo e retorna ao gatilho ao fechar.
- O botão de fechar tem rótulo acessível.
- O conteúdo rola internamente quando necessário, sem esconder as ações.
- Popovers e menus são ancorados ao gatilho, com a sombra base do template.
- Nenhum diálogo define posicionamento, largura ou animação próprios.
- `position: absolute` ou `fixed` só existe em overlays, barras fixas e elementos de sobreposição previstos.

## Layout e navegação

| Item                      | Medida                             |
| ------------------------- | ---------------------------------- |
| Barra superior no celular | 56 px                              |
| Barra superior no desktop | 64 px                              |
| Gaveta                    | 256 px                             |
| Item de navegação         | 48 px de altura e 16 px de padding |
| Lista de uma linha        | 48 px                              |
| Lista de duas linhas      | 64 px                              |
| Lista de três linhas      | 72 px                              |
| Ícone                     | 24 px                              |

Regras:

- A gaveta é permanente a partir de 905 px e modal abaixo disso. No desktop, ela reserva seus 256 px uma vez, ao lado do conteúdo.
- A barra superior tem `Toolbar` com a altura da faixa.
- O item ativo usa `aria-current="page"` e o destaque verde suave. Se a seção ativa estiver recolhida, a categoria visível assume essa indicação até a seção reaparecer.
- O menu móvel contém o foco. Escape, o botão Fechar menu e toque fora devolvem o foco a Abrir menu. Escolher um destino final ou ampliar para desktop leva o foco ao título ativo. Avisos de pendência e ações da conta transferem o foco ao próprio diálogo.
- O conteúdo começa depois de um espaçador de `Toolbar`, sem `margin-top` mágico.
- A faixa offline fica abaixo da barra superior e acima do conteúdo.
- A barra de salvamento fica dentro do fluxo do conteúdo, como rodapé fixo com safe area, e nunca flutua sobre a lista sem reservar espaço.
- Cartões não têm sombra. A sombra base fica restrita a menus, popovers, diálogos e avisos.

### Componentes de composição

| Componente         | Papel                                                     |
| ------------------ | --------------------------------------------------------- |
| `LayoutPagina`     | shell com barra, gaveta, `main` e faixa offline           |
| `LayoutConteudo`   | largura de leitura, gestão ou larga, com margem da grade  |
| `CabecalhoPagina`  | título, descrição curta e ações da página                 |
| `SecaoConteudo`    | assunto com título, descrição, ações e conteúdo           |
| `GradeCartoes`     | grade de 12 colunas para indicadores e gráficos           |
| `FormularioPadrao` | formulário de uma ou duas colunas com rodapé de ações     |
| `TabelaPadrao`     | tabela com caption, cabeçalho fixo e primeira coluna fixa |
| `DialogoPadrao`    | diálogo de 560 px com título, conteúdo, alerta e ações    |
| `EstadoVazio`      | ícone, título, descrição e ação para listas sem dados     |

Regras de composição:

- Toda tela usa `LayoutPagina`.
- Toda página usa `LayoutConteudo`.
- `CabecalhoPagina` aparece uma vez por página.
- Indicadores e gráficos usam `GradeCartoes`. Nenhuma tela monta `display: grid` próprio.
- Formulários usam `FormularioPadrao`. Nenhuma tela monta grid de formulário próprio.
- Tabelas usam `TabelaPadrao`.
- Diálogos usam `DialogoPadrao`.
- Listas vazias usam `EstadoVazio`.

## Padrões por tela

### Entrada

- Layout `sign-in-side`, com conteúdo de marca e destaques à esquerda e cartão de entrada à direita no desktop.
- No celular, a marca, o título e o formulário ficam em uma coluna, centralizados.
- Fundo neutro sem gradiente e seletor de tema no canto superior direito.
- Campos de e-mail ou identificador, senha, manter conectado e aviso de erro.
- Links do repositório, documentação da API, Sobre, privacidade e FrequenciBI.
- Nenhum login social, texto de demonstração ou dado fictício.

### Painel

- Cabeçalho com data, setas, Hoje e Atualizar tela.
- Cartões de Infrequência e Cobertura do dia lado a lado.
- Um cartão de gráfico por vez, com seletor de gráfico e botões Anterior e Próximo.
- Ordem dos gráficos: Escola, séries, Personalizado e Desistentes.
- Gráficos em MUI X, com legenda e descrição acessível.
- Estados de carregamento, erro, feriado e sem dados.
- Atualização automática a cada minuto e ao voltar para a aba, sem tentar sem rede.

### Chamada

- No desktop, seletor de turma em cartão lateral de 3 ou 4 colunas e lista em 8 ou 9 colunas.
- No celular, o seletor fica acima da lista.
- Linhas de aluno de 52 a 64 px, com P, F, FJ e D e `aria-pressed`.
- A linha inteira é o alvo de toque. O alvo mínimo é 48 dp.
- Barra de salvamento como rodapé fixo dentro do conteúdo, com safe area e estados Não iniciada, Em andamento, Alterações não salvas, Salvando, Falha e Conflito.
- Diálogos de confirmação, desbloqueio e sábado letivo usam `DialogoPadrao`.
- Resumo semanal em cartões e seções recolhíveis.
- Nenhuma barra flutuante fora do fluxo e nenhum cartão aninhado.

### Chamada Parcial

- Cabeçalho sem subtítulo, com título e ação de enviar para a planilha.
- Painel único com turma, data, última atualização e Voltar para hoje.
- Busca e filtro de situação junto da lista, com contagem de resultados.
- Controles lado a lado quando houver espaço e empilhados em telas estreitas.
- Tabela no desktop e cartões no celular, com nome, situação, registro e ações.
- Formulário de personalização com Dia inteiro, Manhã, Tarde ou aulas e justificativa antecipada.
- Confirmação antes de salvar e preservação do comportamento de `colunas-parcial`.

### Horários

- Consulta diária e semanal, com Manhã e Tarde.
- Intervalos, almoço e ordem do almoço aparecem na ordem do horário.
- Cartão Provas bimestrais acima da grade, agrupado por data, com disciplina, horário e a marca hoje.
- Tabela no desktop e cartões por dia no celular.
- A edição de horários fica na Gestão e usa `TimePicker` em 24 horas.
- Aviso de alterações pendentes ao navegar ou sair.

### Saídas e Entradas

- Abas Saídas e Entradas, com a aba ativa na URL.
- Data e última atualização agrupadas, com folga de 8 px. Só o trilho das abas divide espaço com a ação Planilha.
- Formulário com busca de aluno e ação de registro no rodapé. Abaixo de 905 px usa uma coluna; a partir de 905 px, Turma e Aluno, Momento e Horário só ficam lado a lado se cada campo tiver pelo menos 240 px. A justificativa ocupa toda a largura.
- Histórico do dia em uma seção distinta, com contagem após a leitura bem-sucedida, alunos separados por divisores e remoção confirmada. O histórico de saídas começa bloqueado; o de entradas mantém o filtro por turma.
- `SecaoConteudo` e `EstadoVazio` compõem o histórico. A região de status permanece montada e anuncia a contagem após a leitura. Durante o carregamento ou uma falha, a lista, a contagem e as ações de remoção ficam ocultas. Tentar novamente consulta apenas o dia e, em Entradas, a turma selecionada.
- Na revisão, os rótulos e valores se empilham abaixo de 600 px; em telas mais largas ficam lado a lado.
- Resumo de domingo com todas as turmas e registro do dia.
- Envio para Google Planilhas com prévia e confirmação.

### Relatórios

- Sub-abas Resumo, Histórico, Grade, Por aluno e Saídas e Entradas.
- Filtros de mês, série, turma e período.
- Rankings de faltas, justificadas e sem justificativa.
- Gráfico diário com tabela de dados e visualizações lado a lado no desktop.
- Grade com P, F, FJ e S, primeira coluna fixa, total e exportação CSV.
- Por aluno com agrupamento por série e turma.
- Relatório de saídas e entradas independente do mês das outras abas.
- Gráficos em MUI X e tabelas no padrão de 56 e 52 px.

### Alunos

- Lista agrupada por turma atual ou por turma de origem.
- Cabeçalho compacto com contagem e última atualização, próximo do agrupamento e da busca por nome.
- Nomes longos quebram sem corte. Origem ou turma atual aparece quando difere; a situação é indicada por texto.
- Consulta apenas para a coordenação, sem ação de escrita.
- O cadastro e a importação ficam na Gestão.

### Gestão

- Séries, Turmas, Alunos, Equipe, Diretores e Configurações são destinos da mesma gaveta lateral. O retorno de nível fica no topo e a seleção do destino usa `aria-current`.
- Formulários em diálogo e tabelas com ações.
- Séries e Turmas mantêm `TabelaPadrao`: nomes longos quebram sem corte, Ordem e Aulas respeitam a largura legível do conteúdo, e as ações podem ocupar mais de uma linha no celular sem perder a identificação do registro nem reduzir os alvos de toque.
- Nova série, Nova turma e Reorganizar turmas ficam no cabeçalho dos respectivos cadastros. Os estados sem registros mantêm os atalhos secundários Criar série e Criar turma, quando aplicáveis. Editar, excluir e abrir Horários ficam junto da linha correspondente.
- No editor de Turmas, o seletor Série mostra tanto o rótulo selecionado quanto as opções por inteiro. Títulos longos do editor e das confirmações de exclusão quebram dentro do diálogo.
- Em Alunos, Novo aluno tem a maior ênfase no cabeçalho. Importar, exportar, definir e restaurar origem ficam no mesmo contexto, separados das ações de cada linha.
- Alunos mantém `TabelaPadrao` em região de rolagem local acessível por teclado. Só Aluno fica fixo na horizontal; nomes quebram e as ações podem ocupar duas linhas no celular. Não há ganho demonstrado de Data Grid Community nesse cadastro.
- O diálogo de cadastro e edição de aluno ocupa a tela no celular. Os seletores mantêm a busca e mostram os rótulos completos das turmas selecionadas e das opções.
- Equipe e Diretores mantêm uma única tabela. Abaixo de 600 px de largura útil, identificação e ações se empilham no mesmo registro, sem reduzir o alvo de toque. Nomes, e-mails, identificadores e vínculos podem quebrar em mais de uma linha. Nova conta e Novo diretor são as ações principais de seus cadastros.
- Nas listas de Equipe e Diretores, papel, situação e validade são comunicados também por texto. Os diálogos quebram títulos longos; emitir, regenerar e revogar a palavra-chave mantêm o diretor identificado e os passos de confirmação existentes.
- Configurações mantém o título no conteúdo, sem uma segunda navegação. Escola, Horários, Planilhas, Acesso e avisos e Dados ficam na gaveta; grupos com várias seções expandem ali. A gaveta móvel permanece aberta nessas trocas de nível e de expansão.
- A navegação anima apenas a lista na troca de nível, sem repetir a entrada ao reabrir a gaveta, ampliar a tela ou reativar movimento. A preferência Animações da interface, no perfil, persiste no navegador: Sistema segue o dispositivo e Ativadas ou Desativadas prevalecem quando escolhidas explicitamente. Sem movimento, a troca e o foco são imediatos e o carregamento mantém uma indicação estática. Desativar durante o fechamento da gaveta ou de um aviso de pendência conclui a transição em curso sem esperar a duração anterior. Ver [ADR-082](adr/082-navegacao-lateral-gestao.md).
- Rascunho único, revisão, conflito e confirmação antes de salvar.
- Em Horários, Provas usa data, início, fim, disciplina e seleção de turmas por série, com checkbox tri-state e contagem.
- A gravação das provas é imediata, fora do rascunho único.
- O layout segue o CRUD do template, sem cartão aninhado e sem ação administrativa perdida.

### Minhas turmas

- Shell próprio do diretor, sem a navegação da equipe.
- Chips das turmas e seletor de mês sem mês futuro.
- Três indicadores: alunos acompanhados, em risco e ausência da turma.
- Gráfico de barras horizontais por aluno e gráfico semanal da turma.
- Tabela alternativa com os mesmos números e o selo em risco.
- Nenhuma ação de escrita.
- Cada gráfico tem descrição acessível, legenda e dica ao tocar.

### FrequenciBI

- Moldura, filtros e controles em MUI.
- Editor com filtros, período, série, turma e medidas.
- Gráficos de rosca, linha, área, barras agrupadas, barras horizontais e dispersão.
- Mapa de calor próprio e tabela de apoio.
- Exportação preservada.
- Recharts permanece apenas neste módulo, conforme a exceção documentada.
- Nenhuma ação de escrita e nenhum dado real.

## Estados

- Carregamento: `Skeleton` no formato do conteúdo, sem bloquear a tela inteira.
- Erro: `Alert` com ação Tentar novamente e mensagem em linguagem simples.
- Vazio: ícone, título, descrição e ação, com `EstadoVazio`.
- Offline: `Alert` fixo abaixo da barra superior, com os dados atuais preservados.
- Falha regional: a região afetada mostra o aviso e o restante da tela continua utilizável.
- Avisos usam `Snackbar` e `Alert`, com `aria-live` e no máximo três visíveis.
- O aviso de sucesso fica no canto inferior direito no desktop e acima da barra de ações no celular.
- Nenhum estado usa apenas cor. Todo estado tem texto, ícone ou padrão.

## Acessibilidade

- HTML semântico com `main`, `nav`, `aside`, `section`, `header`, `footer`, listas e tabelas.
- Atalho para pular para o conteúdo.
- Foco visível em todos os controles, com 3 px e contraste de 3:1.
- Foco contido em diálogos, menus e gaveta modal.
- Retorno de foco ao gatilho.
- `aria-current` na navegação e `aria-pressed` nas linhas de aluno.
- `aria-live` em avisos e resultados assíncronos.
- Rótulos visíveis ou `sr-only` em todos os campos e botões de ícone.
- Botão de mostrar senha com rótulo alternado.
- Tabelas com `caption` e `scope`.
- Gráficos com `role="img"`, descrição e alternativa textual ou tabela de apoio.
- Contraste de 4,5:1 para texto e de 3:1 para componentes e foco.
- Alvo de toque de 48 dp.
- Zoom de 200% sem perda de conteúdo ou rolagem horizontal indevida.
- Navegação completa por teclado, sem armadilha de foco.
- `prefers-reduced-motion` reduz transições e não remove informação essencial.
- `forced-colors` usa as cores do sistema e mantém bordas, seleção e foco visíveis.
- Nenhum dado real em captura, teste ou exemplo.

## Proibições

- Tailwind CSS, classes utilitárias, `className` com utilitário e `tailwind-merge`.
- Radix UI e qualquer primitiva `@radix-ui/*`.
- `lucide-react`. Ícones vêm de `@mui/icons-material`, na variante Rounded.
- `sonner`. Avisos usam `Snackbar` e `Alert`.
- `next-themes`. O tema usa `useColorScheme` e `InitColorSchemeScript`.
- `motion`. Transições usam os componentes e as transições do MUI.
- Larguras locais, `max-w-*`, `w-[...]`, `maxWidth` por tela e contêiner próprio.
- Cartão dentro de cartão.
- `display: grid` próprio fora de `GradeCartoes` e `FormularioPadrao`.
- `position: absolute` ou `fixed` fora de overlays, barras fixas e elementos previstos.
- Margem, padding ou altura fora da grade de 8 dp.
- Cor hexadecimal, `oklch` ou `rgb` fixa no componente.
- Sombra em controles e gradientes nos botões.
- Posicionamento, largura ou animação própria de diálogo.
- Recharts fora de `src/components/bi/**`.
- Pacotes Data Grid Pro, Tree View Pro e Charts Pro.
- Texto de demonstração, login social e dados fictícios dos templates.

A violação de uma proibição é tratada como regressão de arquitetura, não como exceção visual. As regras de ESLint e os testes estáticos cobrem imports proibidos, larguras locais, grids próprios e classes Tailwind.

## Exceção do FrequenciBI

O Recharts permanece somente em `src/components/bi/**` porque os gráficos, o mapa de calor, as medidas e a personalização do BI têm lógica própria, fora do escopo da migração visual. A moldura, os filtros, os cartões, os controles e a tabela de apoio usam MUI.

A exceção é verificada por `no-restricted-imports` no ESLint e por teste estático. Nenhum outro módulo pode importar Recharts, mesmo que use apenas um gráfico simples. Um gráfico novo fora do BI usa MUI X Charts.

## Licença e origem dos templates

- Os templates oficiais da MUI no tag `v9.5.0` são MIT, com copyright de 2014 da Call-Em-All.
- O texto integral está em [LICENSE no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/LICENSE).
- Arquivos derivados de `shared-theme`, `dashboard`, `sign-in-side` e `crud-dashboard` mantêm no cabeçalho a origem, o tag, a licença MIT e a indicação de adaptação.
- O código copiado é traduzido, adaptado ao domínio e às regras editoriais do repositório.
- Nenhum dado, nome, marca ou texto de demonstração dos templates é reaproveitado.
- Nenhum recurso Pro é instalado.

A decisão completa, as alternativas e as consequências estão no [ADR-081](adr/081-material-ui-e-tema-dos-templates.md).

## Referências

- [ADR-081: Material UI e o tema dos templates oficiais](adr/081-material-ui-e-tema-dos-templates.md).
- [Issue #532](https://github.com/eemtijca/frequenciapp/issues/532): decisões de layout, medidas, cores, acessibilidade e licença.
- [AppTheme.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/AppTheme.tsx): variáveis CSS, esquemas de cor e provider.
- [themePrimitives.ts no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/themePrimitives.ts): tipografia, forma, paleta e sombras. O template usa Inter; o projeto mantém Plus Jakarta Sans e JetBrains Mono.
- [inputs.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/inputs.tsx): botões de 36 e 40 px, foco de 3 px e campos.
- [feedback.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/feedback.tsx): diálogo com raio 10, alerta e progresso.
- [dataDisplay.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/dataDisplay.tsx): chips, tabelas e ícones.
- [navigation.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/navigation.tsx): navegação, abas e menus.
- [surfaces.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/surfaces.ts): cartões e superfícies.
- [Breakpoints do MUI](https://mui.com/material-ui/customization/breakpoints/), versão 9.5.0: valores customizados em `theme.breakpoints.values`.
- [Grid do MUI](https://mui.com/material-ui/react-grid/), versão 9.5.0: 12 colunas, `spacing` e breakpoints.
- [Text Field do MUI](https://mui.com/material-ui/react-text-field/), versão 9.5.0: variante outlined, `InputAdornment` e senha com mostrar e ocultar.
- [Table do MUI](https://mui.com/material-ui/react-table/), versão 9.5.0: `stickyHeader`, `scope` e acessibilidade.
- [Dialog do MUI](https://mui.com/material-ui/react-dialog/), versão 9.5.0: `maxWidth`, `fullScreen`, `role="alertdialog"` e foco.
- [MUI X Charts](https://mui.com/x/react-charts/), versão 9.18.1: gráficos comunitários.
- [MUI X Date Pickers](https://mui.com/x/react-date-pickers/), versão 9.18.0: adaptadores, localização e campos de data e hora.
- [Grade responsiva do Material Design 2](https://m2.material.io/design/layout/responsive-layout-grid.html): referência de colunas, margens e gutters.
- [Recharts](https://recharts.org/): exceção restrita ao FrequenciBI.
