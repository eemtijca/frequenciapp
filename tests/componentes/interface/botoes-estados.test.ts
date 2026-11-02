// Regressões visuais dos estados reais do componente, sem banco.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { contraste, hexParaRgb, type Rgb } from "../../helpers/cor";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/botoes-contorno.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

async function abrir(page: Page, tema: string) {
  await page.goto(url);
  await page.evaluate(
    (escuro) => document.documentElement.classList.toggle("dark", escuro),
    tema === "escuro",
  );
  await page.getByRole("button", { name: "Secundário", exact: true }).waitFor();
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
}
const estilo = async (page: Page, nome: string) =>
  page.getByRole("button", { name: nome, exact: true }).evaluate((el) => {
    const c = getComputedStyle(el);
    return {
      fundo: c.backgroundColor,
      borda: c.borderTopColor,
      texto: c.color,
      largura: c.borderTopWidth,
      altura: el.getBoundingClientRect().height,
      opacidade: c.opacity,
      eventos: c.pointerEvents,
    };
  });

it.each(["claro", "escuro"])("preserva seleção, hierarquia e estados em %s", async (tema) => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await abrir(page, tema);
    const selecionado = await estilo(page, "Seleção original");
    for (const nome of ["Pressionado", "Selecionado", "Marcado", "Ativo", "Classe selecionada"]) {
      const atual = await estilo(page, nome);
      expect(atual.fundo, nome).toBe(selecionado.fundo);
      expect(atual.borda, nome).toBe(selecionado.borda);
      expect(atual.texto, nome).toBe(selecionado.texto);
    }
    const original = await estilo(page, "Controle original");
    if (tema === "escuro")
      for (const nome of ["Secundário", "Contorno"]) {
        const atual = await estilo(page, nome);
        expect([atual.fundo, atual.borda, atual.texto]).toEqual([
          original.fundo,
          original.borda,
          original.texto,
        ]);
      }
    for (const nome of ["Primário", "Destrutivo", "Semântico"])
      expect((await estilo(page, nome)).fundo).not.toBe("rgba(0, 0, 0, 0)");
    const ghost = await estilo(page, "Discreto");
    expect(ghost.fundo).toBe("rgba(0, 0, 0, 0)");
    expect(ghost.borda).toBe("rgba(0, 0, 0, 0)");
    const desabilitado = await estilo(page, "Desabilitado");
    expect(desabilitado.opacidade).toBe("0.5");
    expect(desabilitado.eventos).toBe("none");
    for (const nome of ["Secundário", "Contorno", "Primário", "Destrutivo", "Desabilitado"])
      expect((await estilo(page, nome)).altura).toBeGreaterThanOrEqual(43.99);
  } finally {
    await page.close();
  }
});

it.each(["claro", "escuro"])("cores forçadas preservam seleção e foco em %s", async (tema) => {
  const page = await browser.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await abrir(page, tema);
    const selecionado = page.getByRole("button", { name: "Pressionado", exact: true });
    const secundario = page.getByRole("button", { name: "Secundário", exact: true });
    const inicial = await selecionado.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fundo: s.backgroundColor, contorno: s.outlineStyle, largura: s.outlineWidth };
    });
    expect(inicial.contorno).toBe("solid");
    expect(parseFloat(inicial.largura)).toBeGreaterThanOrEqual(2);
    await secundario.focus();
    const foco = await secundario.evaluate((el) => ({
      ativo: el === document.activeElement,
      contorno: getComputedStyle(el).outlineStyle,
      largura: getComputedStyle(el).outlineWidth,
    }));
    expect(foco.ativo).toBe(true);
    expect(foco.contorno).toBe("solid");
    expect(parseFloat(foco.largura)).toBeGreaterThanOrEqual(2);
    expect(await selecionado.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  } finally {
    await page.close();
  }
});

it("hover claro é neutro e não suprime seleção", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await abrir(page, "claro");
    const secundario = page.getByRole("button", { name: "Secundário", exact: true });
    await secundario.hover();
    expect((await estilo(page, "Secundário")).fundo).toBe("rgb(235, 235, 235)");
    const selecionado = page.getByRole("button", { name: "Pressionado", exact: true });
    await selecionado.hover();
    const selecionadoHover = await estilo(page, "Pressionado");
    await page.getByRole("button", { name: "Seleção original", exact: true }).hover();
    expect(selecionadoHover.fundo).toBe((await estilo(page, "Seleção original")).fundo);
  } finally {
    await page.close();
  }
});

it("contraste do texto e do foco em fundos reais claros", async () => {
  const page = await browser.newPage();
  try {
    await abrir(page, "claro");
    const cor = await page
      .getByRole("button", { name: "Secundário", exact: true })
      .evaluate((el) => {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) throw new Error("Canvas indisponível");
        ctx.fillStyle = getComputedStyle(el).color;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      });
    const texto = cor.map((n) => n / 255) as Rgb;
    for (const fundo of ["#ffffff", "#f6f6f6", "#ebebeb"]) {
      expect(contraste(texto, hexParaRgb(fundo))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(hexParaRgb("#086440"), hexParaRgb(fundo))).toBeGreaterThanOrEqual(3);
    }
  } finally {
    await page.close();
  }
});

for (const tema of ["claro", "escuro"])
  for (const largura of [320, 390, 1280]) {
    it(`inspeciona ${tema} a ${largura}px`, async () => {
      const page = await browser.newPage({
        viewport: { width: largura, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await abrir(page, tema);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          largura,
        );
        if (process.env.CAPTURAS_BOTOES)
          await page.screenshot({
            path: `${process.env.CAPTURAS_BOTOES}/${tema}-${largura}.png`,
            fullPage: true,
          });
      } finally {
        await page.close();
      }
    });
  }
