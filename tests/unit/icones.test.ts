// Ícones do aplicativo: os arquivos do manifest existem com o tamanho declarado e os desenhos não usam recursos frágeis.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const ler = (relativo: string) => readFileSync(path.join(RAIZ, relativo));

interface IconeManifest {
  src: string;
  sizes: string;
  purpose: string;
}

const manifest = JSON.parse(ler("public/manifest.webmanifest").toString("utf8")) as {
  icons: IconeManifest[];
};

// IHDR do PNG: largura e altura nos bytes 16 a 23, tipo de cor no byte 25 (2 = RGB, 6 = RGBA).
function cabecalhoPng(arquivo: Buffer) {
  expect(arquivo.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { largura: arquivo.readUInt32BE(16), altura: arquivo.readUInt32BE(20), cor: arquivo[25] };
}

describe("ícones do manifest", () => {
  it.each(manifest.icons.map((icone) => [icone.src, icone] as const))(
    "%s tem o tamanho declarado",
    (_src, icone) => {
      const { largura, altura } = cabecalhoPng(ler(path.join("public", icone.src)));
      expect(`${largura}x${altura}`).toBe(icone.sizes);
    },
  );

  it("declara os ícones any e maskable nos dois tamanhos", () => {
    for (const proposito of ["any", "maskable"]) {
      expect(
        manifest.icons.filter((icone) => icone.purpose === proposito).map((icone) => icone.sizes),
      ).toEqual(["192x192", "512x512"]);
    }
  });

  it("mantém opacos os ícones de fundo sangrado, que o sistema recorta", () => {
    for (const arquivo of [
      "icon-mascara-192.png",
      "icon-mascara-512.png",
      "apple-touch-icon.png",
    ]) {
      expect(cabecalhoPng(ler(path.join("public", arquivo))).cor).toBe(2);
    }
    expect(cabecalhoPng(ler("public/apple-touch-icon.png")).largura).toBe(180);
  });
});

describe("desenhos vetoriais do ícone", () => {
  const PROIBIDOS = /<(text|filter|image|foreignObject|script|style)\b|font-family|href=/i;

  it.each([
    ["design/icone/mestre.svg", "0 0 512 512"],
    ["src/app/icon.svg", "0 0 64 64"],
  ])("%s é quadrado, sem texto, filtro, imagem embutida ou script", (arquivo, caixa) => {
    const svg = ler(arquivo).toString("utf8");
    expect(svg).toContain(`viewBox="${caixa}"`);
    expect(svg).not.toMatch(PROIBIDOS);
  });

  const VERDE = "#17784d";
  const BRANCO = "#ffffff";

  it.each(["design/icone/mestre.svg", "src/app/icon.svg"])(
    "%s usa só verde e branco, sólidos e sem transparência",
    (arquivo) => {
      const svg = ler(arquivo).toString("utf8");
      const cores = new Set(
        (svg.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map((cor) => cor.toLowerCase()),
      );
      expect([...cores].sort()).toEqual([VERDE, BRANCO].sort());
      expect(svg).not.toMatch(/Gradient|opacity|rgba?\(|hsla?\(|mask|filter/i);
    },
  );

  it("mantém nos PNGs gerados só as duas cores do desenho, fora a suavização das bordas", async () => {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(ler("public/icon-mascara-512.png"))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alvos = [
      [0x17, 0x78, 0x4d],
      [0xff, 0xff, 0xff],
    ];
    let puros = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (alvos.some((a) => a.every((v, k) => data[i + k] === v))) puros++;
    }
    // Mais de 95% dos pixels são exatamente verde ou branco; o resto é a borda suavizada.
    expect(puros / (data.length / info.channels)).toBeGreaterThan(0.95);
  });

  it("mantém o desenho branco dentro da zona segura das máscaras circulares do Android", async () => {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(ler("public/icon-mascara-512.png"))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Círculo de 40% da largura (raio 204,8 px em 512), a zona segura da especificação de ícones maskable.
    const centro = (info.width - 1) / 2;
    const raioSeguro = info.width * 0.4;
    let fora = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        const branco = data[i] === 0xff && data[i + 1] === 0xff && data[i + 2] === 0xff;
        if (branco && Math.hypot(x - centro, y - centro) > raioSeguro) fora++;
      }
    }
    expect(fora).toBe(0);
  });

  it("pré-cacheia no service worker todos os ícones do manifest", () => {
    const sw = ler("public/sw.js").toString("utf8");
    for (const icone of manifest.icons) expect(sw).toContain(icone.src);
  });
});
