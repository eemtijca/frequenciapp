# ADR-081: Material UI e o tema dos templates oficiais

- Status: aceita
- Data: 2026-11-20
- Substitui em parte os ADRs 061 e 062.
- Issue: [#532](https://github.com/eemtijca/frequenciapp/issues/532)

## Contexto

A interface anterior combinava Tailwind CSS v4, Radix UI, componentes no padrão shadcn, quatro CSS Modules, CSS global e componentes próprios em `src/components/ui`. Cada visão definia a própria largura máxima, o próprio padding, o próprio cartão e o próprio controle. O mapa `LARGURAS` de `src/components/aplicacao.tsx`, as larguras locais do FrequenciBI, a tabela artesanal da Grade e os diálogos próprios mostravam a falta de um sistema único.

O resultado era inconsistência visual entre telas, revisão mais difícil, custo de manutenção alto e comportamento desigual de foco, contraste e responsividade. A issue #532 determinou a reformulação visual e estrutural de toda a interface com Material UI v9 e o tema customizado dos templates oficiais, preservando domínio, API, banco, autenticação e regras de negócio.

## Decisão

### Base tecnológica

- Adotar `@mui/material@9.5.0`, `@mui/icons-material@9.5.0` e `@mui/material-nextjs@9.5.0`.
- Adotar `@mui/x-charts@9.18.1` e `@mui/x-date-pickers@9.18.0`, sem pacotes Pro.
- Adotar `@emotion/react`, `@emotion/styled` e `@emotion/cache` na linha 11.14 e `dayjs` 1.11.23.
- Usar `AppRouterCacheProvider` de `@mui/material-nextjs/v16-appRouter`, com nonce da CSP.
- Renderizar `InitColorSchemeScript` como primeiro filho do `body`, com `attribute="data-mui-color-scheme"`, `defaultMode="system"` e nonce.
- Usar `CssBaseline enableColorScheme`, `ThemeProvider` com `disableTransitionOnChange` e `suppressHydrationWarning` no `html`.

### Tema e identidade

- O tema deriva de `shared-theme/AppTheme.tsx` e `shared-theme/themePrimitives.ts` no tag `v9.5.0`.
- `cssVariables.colorSchemeSelector` é `data-mui-color-scheme` e `cssVariables.cssVarPrefix` é `template`.
- `colorSchemes` define os temas claro e escuro. `theme.applyStyles` e `theme.vars` substituem decisões por `theme.palette.mode` durante a renderização.
- A tipografia é Inter, carregada por `next/font/google` com a variável `--font-inter`.
- `shape.borderRadius` é 8. Cartões não têm sombra. Menus, popovers, diálogos e avisos usam a sombra base do template.
- O azul da marca do template é substituído pelo verde institucional. A escala `brand` vai de 50 a 900 e está detalhada no [design system](../design-system.md).
- No tema claro, `primary.main` é `brand.700`, `primary.light` é `brand.500` e `primary.dark` é `brand.900`. No tema escuro, `primary.main` é `brand.400`, `primary.light` é `brand.300` e `primary.dark` é `brand.700`.
- `info` e o token `justificada` continuam azuis. `falta` continua vermelha. `warning` continua âmbar. `error` continua vermelha. `success` continua verde e precisa ser distinguível da marca.
- O verde institucional não substitui as cores semânticas. Falta, falta justificada, alerta, sucesso, informação, aviso e erro mantêm tokens e significados próprios.
- O logotipo e os ícones do PWA recebem o novo verde. Os PNGs continuam sendo gerados a partir de `design/icone/mestre.svg`.

### Layout e componentes

- O layout segue o Material Design 2 com o visual do template.
- Breakpoints: `xs: 0`, `sm: 600`, `md: 905`, `lg: 1240` e `xl: 1440`.
- Larguras de conteúdo: 840 para leitura e formulários, 1040 para gestão e relatórios e 1280 como exceção documentada para Grade, Relatórios largos e FrequenciBI.
- A gaveta tem 256 px e fica permanente a partir de 905 px e modal abaixo disso.
- A barra superior tem 56 px no celular e 64 px no desktop.
- O item de navegação tem 48 px de altura e 16 px de padding.
- Tabelas usam cabeçalho de 56 px, linhas de 52 px e padding de célula de 16 px.
- Diálogos têm no máximo 560 px, padding de 24 px, raio de 10 px e tela cheia no celular para formulários longos.
- Cartões usam padding de 16 px e raio de 8 px. Não existe cartão dentro de cartão.
- Campos médios têm 56 px e campos pequenos têm 40 px. Botões pequenos têm 36 px e botões médios têm 40 px.
- Todo alvo de toque tem no mínimo 48 dp, mesmo quando a caixa visual é menor.
- O espaçamento segue a grade de 8 dp, com valores permitidos de 4, 8, 16, 24, 32, 40 e 48 dp. `theme.spacing(1)` continua 8 px.
- Toda tela usa `LayoutPagina` e `LayoutConteudo`. Cabeçalho, seções, cartões, formulários, tabelas e diálogos usam os componentes compartilhados de `src/components/layout/`.
- Cores, espaçamentos e variantes vêm de `theme.vars`, `sx` e dos tokens de `src/theme/layout.ts`. Nenhuma tela define largura máxima própria, grid próprio, margem arbitrária ou `position: absolute` fora de overlays.
- O foco visível usa contorno de 3 px com o primário translúcido e deslocamento de 2 px.

### Gráficos, datas e horas

- Painel, Relatórios, Diretor e Horários usam MUI X Charts, com carregamento sob demanda e alternativa textual ou tabela de apoio.
- Recharts permanece restrito a `src/components/bi/**` por decisão de escopo, com regra de ESLint e teste estático contra importações fora do BI.
- Date Pickers e Time Pickers usam `AdapterDayjs` e locale `pt-br`, com horário de 24 horas no formato `HH:mm`.
- O `SeletorPeriodo` permanece próprio, com primitivas MUI, porque carrega regras de domingo, feriado, resumo semanal e calendário de segunda a sábado.
- Datas civis trafegam como `YYYY-MM-DD` e são convertidas sem passar por UTC.

### Acessibilidade, PWA e SSR

- A migração preserva teclado, foco, rótulos, `aria-current`, `aria-pressed`, `aria-live`, `caption`, `scope` e descrições de gráficos.
- Diálogos prendem o foco e devolvem o foco ao gatilho. Menus e gavetas seguem o mesmo contrato.
- Texto normal mantém 4,5:1. Componentes, bordas funcionais e foco mantêm 3:1.
- A interface respeita `prefers-reduced-motion`, `forced-colors`, zoom de 200% e alvos de 48 dp.
- O PWA atualiza `manifest.webmanifest`, `theme-color`, `offline.html`, `global-error.tsx` e a versão do service worker quando os assets pré-cacheados mudam.
- A CSP existente cobre o Emotion com `style-src 'self' 'unsafe-inline'`. Nenhum `unsafe-eval` é adicionado.

### Coexistência e remoção

- Durante a migração, o tema MUI e os componentes novos coexistem com o CSS antigo.
- `AppRouterCacheProvider` usa `enableCssLayer` enquanto Tailwind existir, e `globals.css` declara a ordem `theme, base, mui, components, utilities`.
- Telas migradas importam apenas de `src/components/ui/mui/` e `src/components/layout/`.
- Ao final, Tailwind, Radix UI, lucide-react, sonner, next-themes, motion, CSS Modules, `postcss.config.mjs`, `components.json` e `src/lib/utils.ts` são removidos.
- O `globals.css` só permanece se houver regra global que `CssBaseline` e `GlobalStyles` não cubram, reduzido ao mínimo e documentado.

## Alternativas consideradas

- Manter shadcn, Radix e os componentes próprios e apenas padronizar tokens. Foi rejeitada porque preservaria as quatro camadas visuais, o custo de manutenção e a divergência entre telas, contrariando a issue #532.
- Usar o tema padrão do Material Design. Foi rejeitada porque a issue exige o tema customizado dos templates oficiais, com o verde institucional no lugar do azul, e o tema padrão não entrega a identidade visual aprovada.
- Migrar todas as telas de uma vez, sem coexistência. Foi rejeitada porque a interface tem mais de 140 arquivos TSX e a migração sem etapa intermediária impediria revisão commit a commit, aumentaria o risco de regressão funcional e dificultaria a aprovação visual de Entrada, Painel e Chamada.
- Trocar o Recharts do FrequenciBI por MUI X Charts. Foi rejeitada porque o BI tem gráficos, mapa de calor e personalização próprios, e a issue limita a migração visual do BI sem redesenhar a lógica dos gráficos.
- Usar Data Grid Pro, Tree View Pro ou Charts Pro. Foi rejeitada porque a issue determina operação sem licença paga.

## Consequências

- O tema fica centralizado em `src/theme/` e o layout em `src/components/layout/`, reduzindo decisões visuais repetidas nas telas.
- A base ganha dependências novas de MUI, Emotion e Day.js, com custo de bundle e de atualização.
- O stack antigo sai do `package.json`, do código e dos testes, incluindo Tailwind, Radix, lucide-react, sonner, next-themes e motion.
- A validação visual passa a ser obrigatória em 320, 360, 390, 600, 768, 905, 1024, 1240, 1440 e 1920 px, nos temas claro, escuro e sistema, com zoom de 200%, `prefers-reduced-motion`, `forced-colors` e navegação apenas por teclado.
- A acessibilidade melhora com componentes MUI, mas o residual de contraste, leitores de tela e casos extremos fica em issue de acompanhamento.
- O PWA precisa de novo `theme-color`, atualização do `offline.html`, do `global-error.tsx` e da versão do service worker.
- O First Load JS deve ser medido antes e depois. A meta é aumento de até 10% ou justificativa aprovada na revisão.
- Testes de componente, ponta a ponta, PWA e contraste precisam acompanhar cada fase.
- O verde da marca pode se confundir com o verde de sucesso. A separação é validada por teste de contraste e de daltonismo nos dois temas.
- O botão verde usa `brand.700` com texto `brand.50` no tema claro, porque `brand.600` com branco fica em torno de 4,25:1. No tema escuro, o botão verde usa `brand.300` com texto escuro.
- A documentação de interface, as capturas e os ADRs 061 e 062 precisam refletir o novo contrato.

## Licença e origem dos templates

Os templates oficiais da MUI no tag `v9.5.0` são distribuídos sob a licença MIT, com copyright de 2014 da Call-Em-All. O texto integral está em [LICENSE no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/LICENSE).

Arquivos derivados de `shared-theme`, `dashboard`, `sign-in-side` e `crud-dashboard` devem manter no cabeçalho:

- a origem, com o caminho do arquivo e o tag `v9.5.0`;
- a menção à licença MIT e ao copyright da Call-Em-All;
- a indicação de que o arquivo foi adaptado ao português, ao domínio do FrequenciApp e às regras editoriais do repositório.

A adaptação não copia dados fictícios dos templates, nomes de pessoas, marcas ou textos de demonstração. O código copiado é traduzido, tipado e integrado aos componentes do projeto. Os pacotes comunitários usados são MIT. Nenhum recurso Pro é instalado.

## Relação com os ADRs 061 e 062

O [ADR-061](061-superficies-controles-e-temas.md) centralizou superfícies, controles e temas em tokens de `globals.css` e `superficies.css`, com raio de 16 px e linha inferior nos campos. O [ADR-062](062-controles-de-superficie-suave.md) ajustou o acabamento semiflat, o fio de baixo contraste e o foco visível.

O ADR-081 substitui em parte os dois:

- os tokens de cor e superfície passam para o tema MUI e para `theme.vars`;
- os campos passam a ser `outlined`, com 56 ou 40 px, raio de 8 px e contorno completo;
- o raio global passa a 8 px, com 10 px em diálogos e 999 px em chips;
- o foco passa a 3 px, com o primário translúcido do template;
- o CSS global e os CSS Modules deixam de ser a fonte do contrato visual.

Os ADRs 061 e 062 permanecem válidos como registro histórico do período anterior à migração. A marcação de substituição parcial nos próprios arquivos é feita na fase de documentação, sem alterar o histórico das decisões.

## Issue de acompanhamento de acessibilidade

A issue de acompanhamento é aberta na fase de testes, com o título sugerido `[Melhoria]: refina a acessibilidade após a migração para Material UI`, as etiquetas `enhancement`, `area: interface` e `triagem`, e vínculo `Refs #532`.

O escopo inclui contraste de estados e textos secundários, foco em componentes compostos, leitores de tela, `forced-colors`, zoom de 200%, alvos de toque e eventuais regressões. Nenhuma barreira conhecida pode ser removida sem registro na issue.

## Referências

- [Issue #532](https://github.com/eemtijca/frequenciapp/issues/532), consultada em 2026-11-20: escopo, decisões fechadas, contrato visual, acessibilidade e licença.
- [Coleção de templates no tag v9.5.0](https://github.com/mui/material-ui/tree/v9.5.0/docs/data/material/getting-started/templates): origem da composição visual.
- [Apresentação dos templates no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/templates.md): temas customizado e padrão, com modos claro e escuro.
- [AppTheme.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/AppTheme.tsx): `cssVariables`, `colorSchemes`, `ThemeProvider` e customizações.
- [themePrimitives.ts no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/themePrimitives.ts): Inter, tipografia, raio 8, paleta, sombras e temas claro e escuro.
- [inputs.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/inputs.tsx): botões de 36 e 40 px, foco de 3 px, campos e interruptores.
- [dataDisplay.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/dataDisplay.tsx): chips, tabelas e ícones.
- [feedback.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/feedback.tsx): diálogos com raio 10, alertas e progresso.
- [navigation.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/navigation.tsx): navegação, abas e menus.
- [surfaces.tsx no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/docs/data/material/getting-started/templates/shared-theme/customizations/surfaces.ts): cartões, papéis e superfícies.
- [Licença MIT no tag v9.5.0](https://github.com/mui/material-ui/blob/v9.5.0/LICENSE): permissão de uso, cópia e adaptação com manutenção do aviso.
- [Integração com Next.js App Router](https://mui.com/material-ui/integrations/nextjs/), versão 9.5.0: `AppRouterCacheProvider` e `v16-appRouter`.
- [InitColorSchemeScript](https://mui.com/material-ui/react-init-color-scheme-script/), versão 9.5.0: primeiro filho do `body`, atributo e prevenção de piscar.
- [Variáveis de tema CSS](https://mui.com/material-ui/customization/css-theme-variables/overview/), versão 9.5.0: `theme.vars` e variáveis por esquema de cor.
- [Tema escuro](https://mui.com/material-ui/customization/dark-mode/), versão 9.5.0: `useColorScheme`, `colorSchemes` e persistência.
- [Breakpoints](https://mui.com/material-ui/customization/breakpoints/), versão 9.5.0: valores customizados em `theme.breakpoints.values`.
- [Grid](https://mui.com/material-ui/react-grid/), versão 9.5.0: 12 colunas, `spacing` e breakpoints.
- [Text Field](https://mui.com/material-ui/react-text-field/), versão 9.5.0: variantes, `InputAdornment` e senha com mostrar e ocultar.
- [Table](https://mui.com/material-ui/react-table/), versão 9.5.0: `stickyHeader`, `scope` e acessibilidade.
- [Dialog](https://mui.com/material-ui/react-dialog/), versão 9.5.0: `maxWidth`, `fullScreen`, `role="alertdialog"` e foco.
- [MUI X Charts](https://mui.com/x/react-charts/), versão 9.18.1: gráficos comunitários.
- [MUI X Date Pickers](https://mui.com/x/react-date-pickers/), versão 9.18.0: adaptadores e localização.
- [Grade responsiva do Material Design 2](https://m2.material.io/design/layout/responsive-layout-grid.html): colunas, margens e gutters usados como referência estável.
- [Recharts](https://recharts.org/): exceção restrita ao FrequenciBI.
