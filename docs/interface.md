# Interface

Decisões de interface do FrequenciApp. O princípio é o mesmo do fluxo original: a coordenação em sala quer marcar faltas o mais rápido possível, com uma mão, sem decoração no caminho.

## Estrutura

- **Página única** com troca de visões por botões e navegação inferior no celular: Painel, Chamada, Saiu mais cedo e Relatórios para todos, mais Alunos (consulta) para a coordenação ou Gestão para a administração. No desktop, barra lateral fixa com a mesma navegação, o cartão da pessoa, o tema e as ações empilhadas (trocar senha e sair), e o conteúdo ocupa toda a largura, com troca de visão instantânea. O cabeçalho traz identidade, tema de três opções (sistema, claro e escuro) e menu de perfil. A área de saídas some quando o recurso é desligado na Gestão.
- **Painel**: seletor de data com setas, chips de Escola e séries, cartões de alunos, presentes, faltas (F + FJ), justificadas, infrequência e saídas, rosca de faltas por série ou por turma com legenda de contagem e percentual, detalhe por setor no formato "1º ano A: 3 faltas" em fundo opaco, cards por série e a cobertura do dia com as turmas pendentes.
- **Chamada**: seletor de turma por toque com contagem, barra de data com setas de dia, rótulo amigável (data, dia da semana e selo Hoje) e seletor próprio que abre em popover ancorado, no desktop e no celular, com calendário do mês, teclado e atalho Hoje, sem permitir dia futuro; atalho para voltar a hoje, cartões clicáveis de faltas, justificadas e presentes que filtram a lista, taxa de infrequência, busca por nome e a lista de alunos com divisórias finas. Cada aluno marcado ganha o seletor de justificativa do catálogo; escolher um código transforma a falta em FJ e o código Outros aceita observação. O acumulado do aluno aparece na linha e no resumo de faltas. No modo por aula, as aulas do dia aparecem como referência e cada aluno marcado ganha o botão Aulas, com chips para registrar a saída no meio da aula. No desktop, a lista fica à esquerda e o painel de turma, data, resumo e salvamento à direita, fixo durante a rolagem.
- **Saiu mais cedo**: formulário com data, turma, busca e seleção de aluno com contador, momento da saída, justificativa do catálogo (sempre obrigatória), texto opcional de até 100 caracteres quando a saída é durante a aula e observação para Outros nos intervalos e almoço, com responsável pela liberação escolhido na equipe ativa (padrão quem está usando). O texto aparece na lista do dia e nos relatórios. Aviso de que o registro é separado da chamada, saídas do dia por turma com remoção para correção e relatório semanal por aluno com filtro de duas ou mais.
- **Relatórios**: sub-abas de Histórico, Grade e Por aluno. O Histórico lista as chamadas do mês com filtro de série e o resumo inclui FJ. A Grade consulta por turma de origem nos modos dia, semana de aula, período personalizado e mês, com células P, F, FJ e S (no modo por aula), busca por aluno, primeira coluna fixa, coluna Total com o acumulado de F + FJ e legenda. A Grade exporta a turma de origem em CSV, com todos os alunos ativos do período e proteção contra fórmula, e, com a integração ativa, envia o período para o Google Planilhas com prévia obrigatória. Por aluno reúne faltas, justificadas, saídas e dias com registro no mês, com o acumulado de todo o histórico e o detalhe dos dias e das saídas.
- **Buscas**: toda lista longa tem barra de busca com rótulo acessível e limpar. O Histórico filtra por série, turma, dia e autoria; a Grade e o relatório por aluno, por aluno e filtros; a Chamada aceita nome do aluno ou turma de origem; a Gestão, por nome ou e-mail.
- **Controles**: seletor de período acessível com teclado (setas, Home, End, PageUp e PageDown), filtro para listas longas e botão de exibir/ocultar em todo campo de senha; formulários em modal centralizado no celular e no desktop, e o seletor de período sempre em popover ancorado ao gatilho.
- **Entrada**: campos com largura confortável no celular, opção "Manter conectado neste dispositivo" (marcada por padrão) e e-mail lembrado no dispositivo para a próxima visita; a senha fica com o gerenciador do navegador.
- **Alunos** (coordenação): lista de consulta com agrupamento por turma atual ou por turma de origem, origem ou turma atual destacada quando difere, e o cadastro na Gestão.
- **Gestão** (administração): abas curtas de Séries, Turmas, Alunos, Equipe e Configurações, com deslize curto do conteúdo no desktop e troca por botões no celular, formulários em diálogo, aulas por turma e ações de editar, desativar e excluir com confirmação. A própria conta aparece marcada, sem ações perigosas. Alunos permite selecionar vários e definir a turma de origem de uma vez, sem mover ninguém de turma. Configurações liga e desliga os recursos (chamada por aula e saída antecipada), edita o catálogo de justificativas em ordem alfabética (adicionar, renomear, ativar, desativar e excluir sem uso), reúne a cópia de segurança em JSON, com o resultado da importação, e a integração opcional com o Google Planilhas, com token, estrutura, mapa, criação de aba para turma sem aba, envio do mês de todas as turmas, situação com chamadas alteradas e último erro, modo completo por prazo com Estender e cópias de segurança.

## Fluxo de um toque

Na lista da Chamada, a linha inteira do aluno é o alvo: um toque marca falta, um segundo toque devolve a presença. O indicador F ou FJ à direita e o fundo levemente avermelhado confirmam o estado; o seletor de justificativa fica logo abaixo da linha marcada. Todos os alunos começam presentes, então o movimento comum é tocar apenas nos ausentes, como na caderneta de papel. Alvos de toque têm no mínimo 48 pixels de altura na lista e 44 nas ações secundárias.

Enquanto uma ação de rede está em andamento, o controle fica ocupado e ignora novos toques, para o toque duplo acidental não duplicar chamadas, cadastros, arquivos ou envios. Alternâncias locais, como marcar falta e trocar filtros, continuam respondendo a cada toque. Um toque acidental repetido em ações sem resposta de rede também é absorvido por uma janela curta.

## Tema e paleta

- Papel neutro quente de fundo, tinta grafite e um único acento verde institucional para presença e ações primárias.
- O vermelho é estritamente semântico: aparece somente onde comunica falta ou erro.
- Tema claro e escuro com preferência do sistema e troca manual persistida; as duas variações mantêm contraste AA.
- Raio de canto único (14 px) em cartões, botões e campos; uma única família de forma em toda a interface.
- Tipografia Plus Jakarta Sans para interface e JetBrains Mono com numerais tabulares para ordens, contagens e datas, para que colunas não dancem ao mudar de 9 para 10.

## Estados e retorno

- PWA: instalável na tela inicial, atalhos para Chamada e Painel, página própria quando a internet cai, faixa de offline dentro do aplicativo e aviso com botão Atualizar quando há versão nova.
- Carregamento com esqueleto do shell na primeira visita e mensagens locais nas regiões, sem bloquear a visão inteira.
- Salvamento com estado explícito na barra fixa: nova chamada, alterações por salvar, salvando, salva na nuvem com hora e autoria.
- Erros em painel inline com ação de tentar de novo; conflito de revisão com a versão vigente e recarga assistida; sessão expirada volta para a tela de entrada.
- Rascunho em `sessionStorage` enquanto houver marcações não salvas, recuperado ao voltar para o mesmo dia e turma, com aviso quando o rascunho é mais antigo que a versão salva.
- Aviso de saída da página quando há marcações por salvar e confirmação ao sair da conta nessa situação.
- Confirmação explícita para descartar marcações, sair com a chamada em aberto e remover saídas.
- Toasts em todas as ações, no topo da tela: sucesso em verde e erro em vermelho, com título curto e descrição em linguagem simples. Toda mensagem diz o que aconteceu, o que mudou e o que fazer agora; falhas repetíveis oferecem "Tentar de novo".
- Operações longas da planilha e da cópia de segurança mostram um aviso de andamento com o mesmo identificador até virarem sucesso ou erro, com contagens no resultado.

## Acessibilidade

- HTML semântico: `main`, `nav`, `aside`, `section`, listas e tabelas com `caption` e `scope`.
- Atalho para pular para o conteúdo e foco movido para o painel ativo na troca de visão; painéis inativos com `inert`.
- Alvos de toque grandes, com `aria-pressed` nas linhas de aluno e `aria-current` na navegação.
- Rótulos visíveis ou `sr-only` em todos os campos e botões de ícone; o botão de exibir senha alterna entre "Mostrar senha" e "Ocultar senha".
- Seletor de período com foco no dia ou mês escolhido ao abrir, navegação por setas, Home, End, PageUp e PageDown, `aria-pressed` na célula ativa e foco devolvido ao gatilho ao fechar.
- Foco visível em todos os interativos; contraste AA em texto e controles nos dois temas.
- Barras de estado usam `aria-live="polite"` para anunciar salvamentos.
- `prefers-reduced-motion` respeitado: transições e animações decorativas param quando o sistema pede, mas spinners e esqueletos de carregamento continuam animando para comunicar espera.
- Áreas seguras respeitadas no topo, nas laterais e na base, inclusive no aplicativo instalado.

## Movimento

Animações discretas, todas com propósito de confirmar estado:

- Troca de visão pelos botões da navegação, no celular e no desktop; o indicador da barra inferior marca a visão ativa. Cada visão tem rolagem vertical própria e estado preservado.
- Listas com aparição direta, sem animação de entrada.
- Indicador da navegação: no celular é um elemento único sob o botão ativo; no desktop a aba ativa recebe uma pílula com mola curta.
- Abas da Gestão e dos Relatórios: troca por toque, botões e teclado; no desktop o conteúdo faz um deslize curto de 0,15 s.
- Marca P/F/FJ da chamada troca com mola rápida (escala e opacidade), confirmando o toque sem chamar atenção.
- Botões, chips, abas e controles respondem ao toque encolhendo de leve por 150 ms; com movimento reduzido, a escala some e só a cor responde.
- Diálogos seguem as animações padrão do Radix; a barra de salvamento da Chamada flutua como um painel arredondado com sombra no fim da rolagem, para o cartão da lista terminar visível e arredondado.

Nada de parallax, rotação ou animação decorativa: o design permanece o mesmo, o movimento só explica o que mudou.

## Convenção editorial

- Textos curtos, em português, sem exclamações e sem gíria de marketing.
- Números de contagem com singular e plural corretos ("1 falta", "2 faltas").
- Sem travessão em qualquer texto da interface: ponto, vírgula ou parênteses cumprem o papel. O guarda editorial em `tests/unit/texto-editorial.test.ts` mantém a regra verificada por teste.
