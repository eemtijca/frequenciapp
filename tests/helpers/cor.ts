// Cor para testes de paleta: OKLCH para sRGB, simulação de daltonismo
// (Machado, Oliveira e Fernandes, 2009), distância em OKLab e contraste WCAG.

export type Rgb = [number, number, number];
export type Deficiencia = "protan" | "deutan" | "tritan";

/** Matrizes de severidade máxima, aplicadas em RGB linear. */
const MATRIZES: Record<Deficiencia, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function limitar(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

function paraLinear(canal: number): number {
  return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
}

function deLinear(canal: number): number {
  const valor = limitar(canal);
  return valor <= 0.0031308 ? 12.92 * valor : 1.055 * valor ** (1 / 2.4) - 0.055;
}

/** Lê "oklch(L C h)" ou "oklch(L C h / alfa)"; o alfa é ignorado. */
export function lerOklch(texto: string): [number, number, number] {
  const partes = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(texto);
  if (!partes) throw new Error(`Cor fora do formato oklch: ${texto}`);
  return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
}

/** OKLCH para sRGB (0 a 1), cortando o que sai da gama. */
export function oklchParaRgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    deLinear(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1),
    deLinear(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1),
    deLinear(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1),
  ];
}

/** sRGB a partir de "#rrggbb". */
export function hexParaRgb(hex: string): Rgb {
  const valor = (inicio: number) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
  return [valor(1), valor(3), valor(5)];
}

function paraOklab(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map(paraLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Como a cor aparece para quem tem a deficiência, em severidade máxima. */
export function simular(rgb: Rgb, deficiencia: Deficiencia): Rgb {
  const linear = rgb.map(paraLinear);
  const matriz = MATRIZES[deficiencia];
  return matriz.map((linha) =>
    deLinear(linha.reduce((soma, peso, indice) => soma + peso * (linear[indice] ?? 0), 0)),
  ) as Rgb;
}

/** Distância perceptual em OKLab, na escala ×100. */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = paraOklab(a);
  const [l2, a2, b2] = paraOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

/** Menor distância entre as duas cores nas três deficiências simuladas. */
export function piorSeparacao(a: Rgb, b: Rgb): { deficiencia: Deficiencia; valor: number } {
  const deficiencias: Deficiencia[] = ["protan", "deutan", "tritan"];
  return deficiencias
    .map((deficiencia) => ({
      deficiencia,
      valor: deltaE(simular(a, deficiencia), simular(b, deficiencia)),
    }))
    .reduce((pior, atual) => (atual.valor < pior.valor ? atual : pior));
}

function luminancia(rgb: Rgb): number {
  const [r, g, b] = rgb.map(paraLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores. */
export function contraste(a: Rgb, b: Rgb): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}
