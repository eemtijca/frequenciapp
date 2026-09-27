// Paleta de falta e falta justificada: separação para daltonismo e contraste,
// lidos do globals.css nos dois temas, para uma troca de cor não regredir.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contraste, deltaE, lerOklch, oklchParaRgb, piorSeparacao, type Rgb } from "../helpers/cor";

const CSS = readFileSync(path.resolve("src/app/globals.css"), "utf8");

/** Separação mínima sob daltonismo simulado, em ΔE OKLab ×100. */
const SEPARACAO_DALTONISMO = 8;
/** Separação mínima para visão típica. */
const SEPARACAO_NORMAL = 15;
/** Marca gráfica contra a superfície (WCAG, componentes não textuais). */
const CONTRASTE_MARCA = 3;
/** Texto pequeno (WCAG AA). */
const CONTRASTE_TEXTO = 4.5;

function bloco(seletor: string): string {
  const inicio = CSS.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`Bloco ${seletor} ausente no globals.css`);
  return CSS.slice(inicio, CSS.indexOf("}", inicio));
}

function token(tema: string, nome: string): Rgb {
  const achado = new RegExp(`--${nome}:\\s*([^;]+);`).exec(bloco(tema));
  if (!achado?.[1]) throw new Error(`Token --${nome} ausente em ${tema}`);
  return oklchParaRgb(...lerOklch(achado[1]));
}

describe.each([
  { tema: ":root", nome: "claro" },
  { tema: ".dark", nome: "escuro" },
])("paleta de faltas no tema $nome", ({ tema }) => {
  const falta = token(tema, "falta");
  const justificada = token(tema, "justificada");
  const card = token(tema, "card");

  it("separa falta e falta justificada também para daltonismo", () => {
    expect(piorSeparacao(falta, justificada).valor).toBeGreaterThanOrEqual(SEPARACAO_DALTONISMO);
    expect(deltaE(falta, justificada)).toBeGreaterThanOrEqual(SEPARACAO_NORMAL);
  });

  it("destaca as duas marcas da superfície do card", () => {
    expect(contraste(falta, card)).toBeGreaterThanOrEqual(CONTRASTE_MARCA);
    expect(contraste(justificada, card)).toBeGreaterThanOrEqual(CONTRASTE_MARCA);
  });

  it("mantém o texto da falta justificada legível", () => {
    const texto = token(tema, "justificada-texto");
    expect(contraste(texto, card)).toBeGreaterThanOrEqual(CONTRASTE_TEXTO);
    expect(contraste(texto, token(tema, "justificada-fraca"))).toBeGreaterThanOrEqual(
      CONTRASTE_TEXTO,
    );
    expect(contraste(token(tema, "justificada-foreground"), justificada)).toBeGreaterThanOrEqual(
      CONTRASTE_TEXTO,
    );
  });
});

it("recusaria o par anterior, verde e vermelho na mesma luminosidade", () => {
  const falta = oklchParaRgb(0.5, 0.16, 27);
  const verde = oklchParaRgb(0.5, 0.11, 160);
  const pior = piorSeparacao(falta, verde);
  expect(pior.deficiencia).toBe("deutan");
  expect(pior.valor).toBeLessThan(SEPARACAO_DALTONISMO);
});
