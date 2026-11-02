import { describe, expect, it } from "vitest";
import { varianteDoDiaLegivel, type MedidaTexto } from "../ponta-a-ponta/helpers/visibilidade-dia";

const visivel = (): MedidaTexto => ({
  texto: "seg",
  alfaTexto: 1,
  estilos: [{ display: "inline", visibility: "visible", opacity: 1 }],
  caixas: [{ largura: 25, altura: 15, corte: 0 }],
});

describe("variante do dia legível", () => {
  it("rejeita opacidade efetiva quase nula entre ancestrais", () => {
    const medida = visivel();
    medida.estilos = [{ display: "inline", visibility: "visible", opacity: 0.01 }];
    medida.estilos.push({ display: "block", visibility: "visible", opacity: 0.001 });
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
  });

  it("aceita uma variante visível com texto correto e geometria completa", () => {
    expect(varianteDoDiaLegivel([visivel()], "seg")).toBe(true);
  });

  it("rejeita a única variante com opacidade zero", () => {
    const medida = visivel();
    medida.estilos = [{ display: "inline", visibility: "visible", opacity: 0 }];
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
  });

  it("rejeita opacidade zero em um ancestral", () => {
    const medida = visivel();
    medida.estilos.push({ display: "block", visibility: "visible", opacity: 0 });
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
  });

  it("rejeita display none e visibilidade oculta em ancestral", () => {
    for (const estilo of [
      { display: "none", visibility: "visible", opacity: 1 },
      { display: "block", visibility: "hidden", opacity: 1 },
    ]) {
      const medida = visivel();
      medida.estilos.push(estilo);
      expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
    }
  });

  it("só exige uma variante e aceita opacidade efetiva suficientemente alta", () => {
    const oculta = visivel();
    oculta.estilos.push({ display: "none", visibility: "visible", opacity: 1 });
    const exibida = visivel();
    exibida.estilos.push({ display: "block", visibility: "visible", opacity: 0.98 });
    expect([oculta, exibida].some((medida) => varianteDoDiaLegivel([medida], "seg"))).toBe(true);
  });

  it("rejeita cor transparente ou alfa desconhecido", () => {
    for (const alfaTexto of [0, 0.1, null, NaN]) {
      expect(varianteDoDiaLegivel([{ ...visivel(), alfaTexto }], "seg")).toBe(false);
    }
  });

  it("combina alfa do texto e opacidade acumulada no limiar", () => {
    const medida = visivel();
    medida.estilos.push({ display: "block", visibility: "visible", opacity: 0.98 });
    medida.alfaTexto = 0.98;
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(true);
    medida.alfaTexto = 0.96;
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
    medida.alfaTexto = 0.95;
    medida.estilos.pop();
    expect(varianteDoDiaLegivel([medida], "seg")).toBe(true);
  });

  it("exige que todos os trechos do texto correto sejam medidos", () => {
    const primeiro = { ...visivel(), texto: "se" };
    const segundo = { ...visivel(), texto: "g" };
    expect(varianteDoDiaLegivel([primeiro, segundo], "seg")).toBe(true);
    segundo.caixas = [];
    expect(varianteDoDiaLegivel([primeiro, segundo], "seg")).toBe(false);
  });

  it("rejeita texto errado ou vazio, ausência de caixas, área nula e recorte", () => {
    const casos: MedidaTexto[] = [
      { ...visivel(), texto: "ter" },
      { ...visivel(), texto: " " },
      { ...visivel(), caixas: [] },
      { ...visivel(), caixas: [{ largura: 0, altura: 15, corte: 0 }] },
      { ...visivel(), caixas: [{ largura: 25, altura: 0, corte: 0 }] },
      { ...visivel(), caixas: [{ largura: 25, altura: 15, corte: 1 }] },
      { ...visivel(), caixas: [...visivel().caixas, { largura: 25, altura: 15, corte: 1 }] },
    ];
    for (const medida of casos) expect(varianteDoDiaLegivel([medida], "seg")).toBe(false);
  });
});
