// Tokens de layout do Material Design 2: breakpoints, larguras, barras,
// gaveta, tabelas, diálogos, cartões, campos, botões, ícones e listas.
export const BREAKPOINTS = {
  xs: 0,
  sm: 600,
  md: 905,
  lg: 1240,
  xl: 1440,
} as const;

export const TOKENS_LAYOUT = {
  breakpoints: BREAKPOINTS,
  largura: {
    leitura: 840,
    gestao: 1040,
    excepcional: 1280,
  },
  gaveta: 256,
  barra: {
    celular: 56,
    desktop: 64,
  },
  navegacao: 48,
  tabela: {
    cabecalho: 56,
    linha: 52,
    padding: 16,
  },
  dialogo: {
    larguraMaxima: 560,
    padding: 24,
    raio: 10,
  },
  cartao: {
    padding: 16,
    raio: 16,
  },
  campo: {
    medio: 56,
    pequeno: 40,
    raio: 12,
    foco: 3,
  },
  botao: {
    pequeno: 36,
    medio: 40,
  },
  icone: 24,
  alvoToque: 48,
  lista: {
    umaLinha: 48,
    duasLinhas: 64,
    tresLinhas: 72,
  },
  espacamentos: [4, 8, 16, 24, 32, 40, 48],
} as const;

export const RAIOS = {
  controle: TOKENS_LAYOUT.campo.raio,
  dialogo: TOKENS_LAYOUT.dialogo.raio,
  pilula: 999,
} as const;

export type TokensLayout = typeof TOKENS_LAYOUT;
