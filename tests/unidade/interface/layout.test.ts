// Tokens de layout da fundação visual: breakpoints, larguras e medidas do
// Material Design 2, conferidos contra a seção 5.4 do plano.
import { describe, expect, it } from "vitest";
import { BREAKPOINTS, RAIOS, TOKENS_LAYOUT } from "@/theme/layout";
import { tema } from "@/theme/tema";

describe("tokens de layout", () => {
  it("usa os breakpoints customizados", () => {
    expect(BREAKPOINTS).toEqual({ xs: 0, sm: 600, md: 905, lg: 1240, xl: 1440 });
    expect(tema.breakpoints.values).toEqual(BREAKPOINTS);
  });

  it("fixa as larguras de conteúdo, gaveta e barra", () => {
    expect(TOKENS_LAYOUT.largura).toEqual({ leitura: 840, gestao: 1040, excepcional: 1280 });
    expect(TOKENS_LAYOUT.gaveta).toBe(256);
    expect(TOKENS_LAYOUT.barra.celular).toBe(56);
    expect(TOKENS_LAYOUT.barra.desktop).toBe(64);
    expect(TOKENS_LAYOUT.navegacao).toBe(48);
  });

  it("fixa as medidas de tabela, diálogo e cartão", () => {
    expect(TOKENS_LAYOUT.tabela).toEqual({ cabecalho: 56, linha: 52, padding: 16 });
    expect(TOKENS_LAYOUT.dialogo).toEqual({ larguraMaxima: 560, padding: 24, raio: 10 });
    expect(TOKENS_LAYOUT.cartao).toEqual({ padding: 16, raio: 8 });
    expect(RAIOS.controle).toBe(8);
    expect(RAIOS.dialogo).toBe(10);
  });

  it("fixa as medidas de campos, botões, ícones e alvos de toque", () => {
    expect(TOKENS_LAYOUT.campo).toEqual({ medio: 56, pequeno: 40, raio: 8, foco: 3 });
    expect(TOKENS_LAYOUT.botao).toEqual({ pequeno: 36, medio: 40 });
    expect(TOKENS_LAYOUT.icone).toBe(24);
    expect(TOKENS_LAYOUT.alvoToque).toBe(48);
  });

  it("fixa as alturas de lista e a grade de espaçamento", () => {
    expect(TOKENS_LAYOUT.lista).toEqual({ umaLinha: 48, duasLinhas: 64, tresLinhas: 72 });
    expect(TOKENS_LAYOUT.espacamentos).toEqual([4, 8, 16, 24, 32, 40, 48]);
  });
});
