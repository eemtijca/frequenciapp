# ADR-061: superfícies, controles e temas

- Status: aceita
- Data: 2026-11-02
- Substitui as exceções por tema descritas no ADR-054 e no PR #359.
- Substituído em parte pelo ADR-062 quanto à superfície e ao contorno de controles e campos.

## Contexto

A linguagem de blocos suaves foi aplicada com regras específicas para o tema claro em vários arquivos. O mesmo controle podia ter fundo transparente e borda `#d9ddda` no claro e fundo `--secondary` sem borda visível no escuro. Campos claros usavam `#737373`, enquanto campos escuros usavam branco a 20%. O resultado foi perda de paridade entre os temas, contraste insuficiente em alguns estados e manutenção espalhada por cinco folhas de estilo.

## Decisão

- Toda cor de superfície, controle, borda, foco, seleção e gráfico é definida por tokens em `src/app/globals.css`.
- `src/app/superficies.css` é a única folha de componentes compartilhados.
- Controles neutros usam fundo suave e borda de 1 px nos dois temas.
- Campos usam superfície de cartão e a mesma borda funcional dos controles.
- O raio padrão é 16 px em cartões e controles, 12 px em superfícies internas e 999 px em pílulas.
- Estados desabilitados usam `--superficie-desabilitada`, `--borda-desabilitada` e `--texto-desabilitado`, sem `opacity` global. O texto desabilitado mantém 4,5:1 e a superfície fica visualmente distinta do controle habilitado.
- O estado expandido de seletores e divulgações usa o mesmo tratamento de seleção dos controles selecionados.
- Texto normal deve ter 4,5:1; fronteira de controle e foco, 3:1; estados desabilitados precisam continuar legíveis.
- Peças internas de um controle composto, como séries e turmas do seletor de turmas, podem usar o anel de seleção como contorno e não repetem a borda do controle externo.
- Nenhum CSS de componente pode conter `html:not(.dark)`, `html.light`, hexadecimal ou `oklch` fixo.
- As cores de gráfico são derivadas de `--primary`, `--falta` e `--foreground`, para manter a mesma relação perceptual nos dois temas.
- A validação visual com Playwright descartável, em desktop e mobile, faz parte da definição de pronto.

## Consequências

- Uma mudança de tema passa a acontecer em um único lugar.
- Os componentes de tela não precisam mais escolher cores ou exceções de tema.
- A matriz de contraste e a validação visual substituem os testes de cor exata por tela.
- O CSS compartilhado fica menor, mas exige disciplina para não voltar a criar regras locais de cor.
- O contrato precisa ser verificado por teste e revisão de diff.
