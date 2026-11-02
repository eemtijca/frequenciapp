import { describe, expect, it } from "vitest";
import { contidoNosLimites } from "../../ponta-a-ponta/helpers/geometria";

const viewport = { left: 0, top: 0, right: 320, bottom: 720 };

describe("contidoNosLimites", () => {
  it("aceita uma diferença subpixel compatível com a razão observada de 0.9999999403953552", () => {
    // A razão observada não revela o retângulo real: este é um exemplo compatível de 320 px.
    const desvio = 320 * (1 - 0.9999999403953552);
    expect(
      contidoNosLimites({ left: -desvio, top: 0, right: 320 - desvio, bottom: 100 }, viewport),
    ).toBe(true);
  });

  it.each([
    { left: -0.501, top: 0, right: 100, bottom: 100 },
    { left: 0, top: -0.501, right: 100, bottom: 100 },
    { left: 0, top: 0, right: 320.501, bottom: 100 },
    { left: 0, top: 0, right: 100, bottom: 720.501 },
  ])("rejeita recorte maior que meio pixel em qualquer lado: %j", (elemento) => {
    expect(contidoNosLimites(elemento, viewport)).toBe(false);
  });

  it("aceita exatamente meio pixel nos quatro lados", () => {
    expect(
      contidoNosLimites({ left: -0.5, top: -0.5, right: 320.5, bottom: 720.5 }, viewport),
    ).toBe(true);
  });

  it("rejeita uma caixa sem área", () => {
    expect(contidoNosLimites({ left: 0, top: 0, right: 0, bottom: 100 }, viewport)).toBe(false);
  });
});
