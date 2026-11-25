// Guarda das capturas do README e da galeria: largura, arquivos, manifesto e peso.
import { existsSync, readFileSync, statSync } from "node:fs";
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

interface ViewportManifesto {
  nome: string;
  largura: number;
  altura: number;
}

interface CapturaManifesto {
  nome: string;
  area: string;
  viewport: ViewportManifesto;
  tema: "claro" | "escuro";
  rota: string;
}

interface ManifestoGaleria {
  versao: number;
  capturas: CapturaManifesto[];
}

function eRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function eViewport(valor: unknown): valor is ViewportManifesto {
  if (!eRegistro(valor)) return false;
  return (
    (valor.nome === "desktop" || valor.nome === "mobile") &&
    typeof valor.largura === "number" &&
    typeof valor.altura === "number"
  );
}

function eCapturaManifesto(valor: unknown): valor is CapturaManifesto {
  if (!eRegistro(valor)) return false;
  return (
    typeof valor.nome === "string" &&
    typeof valor.area === "string" &&
    eViewport(valor.viewport) &&
    (valor.tema === "claro" || valor.tema === "escuro") &&
    typeof valor.rota === "string"
  );
}

function lerManifesto(): ManifestoGaleria {
  const caminho = path.join(RAIZ, "docs/imagens/galeria.json");
  expect(existsSync(caminho), "O manifesto docs/imagens/galeria.json precisa existir.").toBe(true);
  if (!existsSync(caminho)) throw new Error("O manifesto da galeria não existe.");
  const conteudo = JSON.parse(readFileSync(caminho, "utf8")) as unknown;
  if (!eRegistro(conteudo)) throw new Error("O manifesto da galeria precisa ser um objeto.");
  expect(conteudo.versao).toBe(1);
  const lista: unknown[] = Array.isArray(conteudo.capturas) ? conteudo.capturas : [];
  const capturas = lista.filter(eCapturaManifesto);
  expect(
    capturas,
    "Cada captura do manifesto precisa ter nome, área, viewport, tema e rota.",
  ).toHaveLength(lista.length);
  return { versao: 1, capturas };
}

function nomeBase(valor: string): string {
  const semConsulta = valor.split(/[?#]/)[0];
  return path.basename(semConsulta ?? valor);
}

function arquivosDaGaleria(html: string): string[] {
  const arquivos = new Set<string>();
  for (const imagem of tags(html, "img")) {
    const src = atributo(imagem, "src");
    if (src) arquivos.add(nomeBase(src));
  }
  for (const fonte of tags(html, "source")) {
    const srcset = atributo(fonte, "srcset");
    if (!srcset) continue;
    for (const parte of srcset.split(",")) {
      const primeiro = parte.trim().split(/\s+/)[0];
      if (primeiro) arquivos.add(nomeBase(primeiro));
    }
  }
  return [...arquivos].sort();
}

describe("manifesto da galeria", () => {
  it("mantém o schema do manifesto", () => {
    const manifesto = lerManifesto();
    for (const captura of manifesto.capturas) {
      expect(captura.nome.endsWith(".png")).toBe(true);
      expect(captura.nome).not.toMatch(/[\\/]/);
      expect(captura.area.length).toBeGreaterThan(0);
      expect(["claro", "escuro"]).toContain(captura.tema);
      expect(captura.rota.startsWith("/")).toBe(true);
      expect(captura.viewport.largura).toBeGreaterThan(0);
      expect(captura.viewport.altura).toBeGreaterThan(0);
    }
  });

  it("confere arquivos, galeria e variantes escuras quando há capturas", () => {
    const capturas = lerManifesto().capturas;
    if (capturas.length === 0) return;
    const naGaleria = new Set(arquivosDaGaleria(ler("docs/imagens/README.md")));
    const noManifesto = new Set(capturas.map((captura) => captura.nome));
    for (const captura of capturas) {
      expect(captura.nome).not.toMatch(/[\\/]/);
      conferirArquivo(captura.nome, "docs/imagens");
      expect(
        naGaleria.has(captura.nome),
        `A captura ${captura.nome} não aparece em docs/imagens/README.md.`,
      ).toBe(true);
    }
    for (const arquivo of naGaleria) {
      expect(
        noManifesto.has(arquivo),
        `A imagem ${arquivo} da galeria não está no manifesto.`,
      ).toBe(true);
    }
    for (const captura of capturas.filter((item) => item.tema === "escuro")) {
      const parClaro = capturas.some(
        (item) =>
          item.tema === "claro" &&
          item.area === captura.area &&
          item.viewport.nome === captura.viewport.nome,
      );
      expect(
        parClaro,
        `A captura escura ${captura.nome} não tem par claro na mesma área e viewport.`,
      ).toBe(true);
    }
  });
});
