# Interface

Decisões de interface do Chamada. O princípio é o mesmo do fluxo original: o professor em sala quer marcar faltas o mais rápido possível, com uma mão, sem decoração no caminho.

## Estrutura

- **Página única** com navegação inferior no mobile: Chamada, Histórico e Originais para todos, mais Alunos (consulta) para professores ou Gestão para administradores. Cabeçalho fixo com identidade, papel, tema, troca de senha e saída.
- **Chamada**: seletor de turma por toque com contagem, data com setas de dia e seletor nativo, resumo clicável de faltas e presentes que também filtra a lista, busca por nome e a lista de alunos com divisórias finas.
- **Histórico**: mês por seletor nativo e lista de chamadas com dia, turma, contagem de faltas e hora do último salvamento; abrir uma chamada a leva de volta à Chamada.
- **Originais**: pílulas de turma de origem, mês, grade com primeira coluna fixa e legenda; células com F, ponto de presença ou vazia.
- **Alunos** (professor): lista de consulta agrupada por turma com origem destacada quando difere da atual; o cadastro mora na Gestão.
- **Gestão** (administrador): abas curtas de Séries, Turmas, Alunos e Professores, com formulários em diálogo, ações de editar, desativar e excluir com confirmação, e pílulas de turma na conta de cada professor.

## Fluxo de um toque

Na lista da Chamada, a linha inteira do aluno é o alvo: um toque marca falta, um segundo toque devolve a presença. O indicador F à direita e o fundo levemente avermelhado confirmam o estado. Todos os alunos começam presentes, então o movimento comum é tocar apenas nos ausentes, como na caderneta de papel. Alvos de toque têm no mínimo 48 pixels de altura na lista e 44 nas ações secundárias.

## Tema e paleta

- Papel neutro quente de fundo, tinta grafite e um único acento verde institucional para presença e ações primárias.
- O vermelho é estritamente semântico: aparece somente onde comunica falta ou erro.
- Tema claro e escuro com preferência do sistema e troca manual persistida; as duas variações mantêm contraste AA.
- Raio de canto único (14 px) em cartões, botões e campos; uma única família de forma em toda a interface.
- Tipografia Geist para interface e Geist Mono com numerais tabulares para ordens, contagens e datas, para que colunas não dancem ao mudar de 9 para 10.

## Estados e retorno

- PWA: instalável na tela inicial, página própria quando a internet cai e aviso com botão Atualizar quando há versão nova do aplicativo.
- Carregamento com mensagem local, sem bloquear a visão inteira.
- Salvamento com estado explícito na barra fixa: nova chamada, alterações por salvar, salvando, salva na nuvem com hora e contagem.
- Erros em painel inline com ação de tentar de novo; conflito de revisão com a versão vigente e recarga assistida.
- Rascunho em `sessionStorage` enquanto houver marcações não salvas, recuperado ao voltar para o mesmo dia e turma, com aviso quando o rascunho é mais antigo que a versão salva.
- Aviso de saída da página quando há marcações por salvar.
- Confirmação explícita para descartar marcações e para excluir alunos.

## Acessibilidade

- HTML semântico: `main`, `nav`, `section`, listas e tabelas com `caption` e `scope`.
- Alvos de toque grandes, com `aria-pressed` nas linhas de aluno e `aria-current` na navegação.
- Rótulos visíveis ou `sr-only` em todos os campos e botões de ícone.
- Foco visível em todos os interativos; contraste AA em texto e controles nos dois temas.
- Barras de estado usam `aria-live="polite"` para anunciar salvamentos.
- `prefers-reduced-motion` respeitado por MotionConfig: as animações de transição, entrada de lista e troca de marca param quando o usuário pede.

## Movimento

Animações discretas com Motion, todas com propósito de confirmar estado:

- Troca de visão com entrada e saída de 240 ms, curva de desaceleração suave, mantendo a rolagem restaurada.
- Indicador da navegação inferior desliza para a aba ativa com mola curta.
- Marca P/F da chamada troca com mola rápida (escala e opacidade), confirmando o toque sem chamar atenção.
- Listas entram com deslocamento de 6 a 8 px e opacidade; a grade de Originais repete a entrada quando muda de turma.
- Diálogos seguem as animações padrão do Radix; a barra de salvamento não se move.

Nada de parallax, rotação ou animação decorativa: o design permanece o mesmo, o movimento só explica o que mudou.

## Convenção editorial

- Textos curtos, em português, sem exclamações e sem gíria de marketing.
- Números de contagem com singular e plural corretos ("1 falta", "2 faltas").
- Sem travessão em qualquer texto da interface: ponto, vírgula ou parênteses cumprem o papel. O guarda editorial em `tests/unit/texto-editorial.test.ts` mantém a regra verificada por teste.
