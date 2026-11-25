// Paleta de falta e falta justificada: separação para daltonismo e contraste,
// lidos do tema Material UI nos dois esquemas para uma troca de cor não regredir.
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import {
  contraste,
  deltaE,
  hexParaRgb,
  hslParaRgb,
  lerHsl,
  oklchParaRgb,
  piorSeparacao,
  type Rgb,
} from "../../helpers/cor";

/** Separação mínima sob daltonismo simulado, em ΔE OKLab ×100. */
const SEPARACAO_DALTONISMO = 8;
/** Separação mínima para visão típica. */
const SEPARACAO_NORMAL = 15;
/** Marca gráfica contra a superfície (WCAG, componentes não textuais). */
const CONTRASTE_MARCA = 3;
/** Texto pequeno (WCAG AA). */
const CONTRASTE_TEXTO = 4.5;

function paleta(esquema: "light" | "dark") {
  const atual = tema.colorSchemes[esquema]?.palette;
  if (!atual) throw new Error(`Esquema ${esquema} ausente no tema`);
  return atual;
}

function cor(valor: string | undefined, rotulo: string): Rgb {
  if (!valor) throw new Error(`Cor ${rotulo} ausente no tema`);
  return valor.startsWith("#") ? hexParaRgb(valor) : hslParaRgb(...lerHsl(valor));
}

describe.each([
  { tema: "light", nome: "claro" },
  { tema: "dark", nome: "escuro" },
] as const)("paleta de faltas no tema $nome", ({ tema: esquema }) => {
  const atual = paleta(esquema);
  const falta = cor(atual.falta.main, "falta.main");
  const justificada = cor(atual.justificada.main, "justificada.main");
  const papel = cor(atual.background.paper, "background.paper");

  it("separa falta e falta justificada também para daltonismo", () => {
    expect(piorSeparacao(falta, justificada).valor).toBeGreaterThanOrEqual(SEPARACAO_DALTONISMO);
    expect(deltaE(falta, justificada)).toBeGreaterThanOrEqual(SEPARACAO_NORMAL);
  });

  it("destaca as marcas da superfície do papel", () => {
    expect(contraste(falta, papel)).toBeGreaterThanOrEqual(CONTRASTE_MARCA);
    expect(contraste(justificada, papel)).toBeGreaterThanOrEqual(CONTRASTE_MARCA);
    expect(contraste(cor(atual.alerta.main, "alerta.main"), papel)).toBeGreaterThanOrEqual(
      CONTRASTE_MARCA,
    );
  });

  it("mantém o texto da falta justificada legível", () => {
    const texto = cor(atual.justificada.texto, "justificada.texto");
    expect(contraste(texto, papel)).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    expect(
      contraste(texto, cor(atual.justificada.fraco, "justificada.fraco")),
    ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    expect(
      contraste(cor(atual.justificada.contrastText, "justificada.contrastText"), justificada),
    ).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
  });
});

it("recusaria o par anterior, verde e vermelho na mesma luminosidade", () => {
  const falta = oklchParaRgb(0.5, 0.16, 27);
  const verde = oklchParaRgb(0.5, 0.11, 160);
  const pior = piorSeparacao(falta, verde);
  expect(pior.deficiencia).toBe("deutan");
  expect(pior.valor).toBeLessThan(SEPARACAO_DALTONISMO);
});
