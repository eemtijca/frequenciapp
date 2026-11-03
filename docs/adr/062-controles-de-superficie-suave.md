# ADR-062: controles de superfície suave

- Status: aceita
- Data: 2026-11-03
- Substitui parcialmente o ADR-054 e o ADR-061.

## Contexto

Os controles compartilhados usavam uma borda de 1 px em toda a volta, com `--input` como cor funcional. Nos temas claro e escuro, essa borda era o elemento mais evidente da interface, inclusive em campos, seletores, datas, botões secundários, abas e divulgações.

A primeira tentativa removeu o contorno e deixou apenas um preenchimento tonal. No tema claro, o preenchimento quase desaparecia sobre o cartão branco. Ao reforçá-lo, os controles passaram a competir com o botão principal e a interface ficou pesada. No tema escuro, o preenchimento claro causava brilho excessivo.

A solução final é semiflat: fundo quase igual ao cartão para os controles passivos, um fio de 1 px de baixo contraste para delimitar a área clicável e destaque sólido apenas para a ação principal.

## Decisão

- Botões, seletores, campos de data e horário, abas, interruptores e divulgações usam `--superficie-controle` ou `--superficie-campo` com um fio de 1 px em `--borda-controle`.
- O tema claro usa 4% do foreground sobre o cartão para a superfície e 18% para o fio. O tema escuro usa 6% e 18%, respectivamente.
- Campos de texto e textarea mantêm fundo do cartão e apenas uma linha inferior de 1 px em `--linha-campo`, com contraste de 3:1. O login aprovado não muda.
- Primários e destrutivos continuam sólidos e sem borda. As ações ghost continuam transparentes.
- O trilho das abas usa `--superficie-trilho`, com 8% do foreground no claro e 10% no escuro. A pílula ativa usa `--selecionado-fundo`.
- O estado selecionado usa fundo de 16% de primário no claro e 22% no escuro, com texto em `--accent-foreground`, sem borda visível.
- O estado desabilitado usa uma superfície próxima do cartão, texto apagado e `--borda-desabilitada`.
- O estado inválido usa fundo avermelhado, linha inferior semântica e a mensagem textual do formulário.
- O foco visível continua em `:focus-visible`, com anel de 2 px, deslocamento de 2 px e contraste de 3:1.
- Controles não recebem sombra nem gradiente. A sombra permanece restrita a diálogos, popovers, menus e toasts.
- As misturas são resolvidas em cores sólidas com `color-mix`, sem transparência de superfície.
- Em `forced-colors`, as bordas e os contornos voltam com `ButtonText`, `CanvasText` e `Highlight`, porque o modo de alto contraste do sistema depende deles.
- Cartões, diálogos e popovers apenas informativos mantêm a borda discreta de `--border`.

## Alternativas

- Manter apenas o preenchimento tonal, sem fio: no tema claro, o controle desaparece ou precisa de um cinza pesado.
- Manter a borda de 1 px com 3:1: resolve a affordance, mas recria o contorno forte que motivou a mudança.
- Usar preenchimento escuro nos campos: atende ao contraste, mas deixa a interface visualmente pesada e distante da identidade atual.
- Usar transparência real: criaria composição de camadas e repintura, contrariando o ADR-054.

## Consequências

- O contrato visual fica concentrado em `src/app/superficies.css` e nos tokens de `src/app/globals.css`.
- Os testes de interface medem o fio em torno de 1,5:1, o texto em 4,5:1 e a linha de campo e o foco em 3:1.
- O tema claro deixa de ter blocos cinza pesados e o tema escuro deixa de ter superfícies claras que ofuscam.
- A ação principal continua sendo o único bloco sólido e vibrante da tela.
- O CSS de componentes não usa transparência de superfície nem sombra em controles.
- A documentação de interface e as capturas de tela precisam acompanhar o novo acabamento.
