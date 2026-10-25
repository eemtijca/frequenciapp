# ADR-054: interface plana sem desfoque

- Status: aceita
- Data: 2026-10-24
- Substitui o acabamento de vidro descrito na interface e nas ADRs de identidade visual anteriores.

## Contexto

A interface usava superfícies de vidro com `backdrop-filter`, reflexos, brilho interno e sombras em camadas. O acabamento funcionava bem em desktop, mas em celulares de faixa intermediária o desfoque de camadas persistentes e a repintura de barras fixas durante a rolagem aumentavam o custo por quadro. A identidade visual não depende do desfoque: a paleta, a tipografia, o verde institucional, os estados semânticos e a hierarquia continuam reconhecíveis com superfícies sólidas.

## Decisão

- Remover todo `backdrop-filter` e `-webkit-backdrop-filter` do aplicativo.
- Remover reflexos, brilho interno e transparência de superfície.
- Usar preenchimento sólido, borda de 1 px e raio único de 14 px em cartões, controles, botões e estados selecionados.
- Usar sombra apenas em camadas flutuantes, como diálogos, popovers, menus e toasts.
- Remover gradientes decorativos. Barras de progresso usam cor sólida.
- Manter a paleta, a tipografia, o espaçamento, os ícones e o movimento com propósito.
- Manter foco visível, contraste AA, alvos de toque, cores forçadas e movimento reduzido.
- Não usar a cor como único sinal de estado. Indicadores com faixas de cor também exibem rótulo textual e `aria-valuetext`.

## Consequências

- A rolagem deixa de recalcular desfoque em barras fixas e cabeçalhos.
- O CSS fica menor e mais simples, sem variáveis de reflexo e brilho.
- O aplicativo perde o efeito de vidro, mas mantém a identidade geral e a legibilidade.
- `prefers-reduced-transparency` deixa de ter um bloco específico, porque não há transparência de superfície.
- Diálogos e popovers continuam separados do conteúdo por sombra e borda.
- Capturas de tela e documentação de interface precisam ser atualizadas.
