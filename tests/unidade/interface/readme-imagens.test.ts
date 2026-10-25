// Guarda das capturas do README: largura controlada, arquivos existentes e peso razoável.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const LIMITE_README = 800;
const LIMITE_MOBILE = 320;
const LIMITE_GALERIA = 480;
const LIMITE_BYTES = 300 * 1024;

function ler(relativo: string): string {
  return readFileSync(path.join(RAIZ, relativo), "utf8");
}

function tags(html: string, nome: string): string[] {
  return [...html.matchAll(new RegExp(`<${nome}\\b[^>]*>`, "gi"))].map((achado) => achado[0]);
}

function atributo(tag: string, nome: string): string | null {
  const achado = new RegExp(`\\b${nome}="([^"]+)"`, "i").exec(tag);
  return achado?.[1] ?? null;
}

function largura(tag: string): number {
  return Number(atributo(tag, "width"));
}

function conferirArquivo(relativo: string, base = ""): void {
  const caminho = path.resolve(RAIZ, base, relativo);
  expect(() => statSync(caminho)).not.toThrow();
  expect(statSync(caminho).size).toBeLessThanOrEqual(LIMITE_BYTES);
}

describe("capturas do README", () => {
  const html = ler("README.md");
  const imagens = tags(html, "img");
  const fontes = tags(html, "source");

  it("mantém no máximo duas miniaturas na raiz", () => {
    expect(imagens).toHaveLength(2);
  });

  it("define largura em todas as miniaturas", () => {
    for (const imagem of imagens) {
      const valor = largura(imagem);
      expect(Number.isFinite(valor)).toBe(true);
      expect(valor).toBeGreaterThan(0);
      expect(valor).toBeLessThanOrEqual(LIMITE_README);
    }
  });

  it("limita a captura móvel a 320 pixels", () => {
    const movel = imagens.find((imagem) => (atributo(imagem, "src") ?? "").includes("mobile"));
    expect(movel).toBeDefined();
    expect(largura(movel ?? "")).toBeLessThanOrEqual(LIMITE_MOBILE);
  });

  it("mantém os arquivos das miniaturas e das variantes escuras", () => {
    for (const imagem of imagens) {
      const src = atributo(imagem, "src");
      expect(src).not.toBeNull();
      if (src) conferirArquivo(src);
    }
    for (const fonte of fontes) {
      const srcset = atributo(fonte, "srcset");
      expect(srcset).not.toBeNull();
      if (srcset) conferirArquivo(srcset);
    }
  });

  it("mantém a galeria com miniaturas de até 480 pixels", () => {
    const galeria = ler("docs/imagens/README.md");
    const miniaturas = tags(galeria, "img");
    expect(miniaturas.length).toBeGreaterThanOrEqual(5);
    for (const miniatura of miniaturas) {
      const valor = largura(miniatura);
      expect(Number.isFinite(valor)).toBe(true);
      expect(valor).toBeGreaterThan(0);
      expect(valor).toBeLessThanOrEqual(LIMITE_GALERIA);
      const src = atributo(miniatura, "src");
      expect(src).not.toBeNull();
      if (src) conferirArquivo(src, "docs/imagens");
    }
    for (const fonte of tags(galeria, "source")) {
      const srcset = atributo(fonte, "srcset");
      expect(srcset).not.toBeNull();
      if (srcset) conferirArquivo(srcset, "docs/imagens");
    }
  });
});
