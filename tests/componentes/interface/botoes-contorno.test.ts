// Componente compartilhado real, com CSS da aplicação, em Chromium sem banco.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

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

it.each(["Secundário", "Contorno"])(
  "%s tem fundo transparente e borda neutra no claro",
  async (nome) => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    try {
      await page.goto(url);
      const botao = page.getByRole("button", { name: nome, exact: true });
      await botao.waitFor();
      await page.addStyleTag({
        content:
          "*, *::before, *::after { transition: none !important; animation: none !important; }",
      });
      const estilo = await botao.evaluate((el) => ({
        fundo: getComputedStyle(el).backgroundColor,
        borda: getComputedStyle(el).borderColor,
        largura: getComputedStyle(el).borderTopWidth,
      }));
      expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
      expect(estilo.borda).toBe("rgb(217, 221, 218)");
      expect(estilo.largura).toBe("1px");
    } finally {
      await page.close();
    }
  },
);

it("foco de teclado no claro tem contorno visível", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Secundário", exact: true }).waitFor();
    await page.keyboard.press("Tab");
    const botao = page.getByRole("button", { name: "Secundário", exact: true });
    expect(await botao.evaluate((el) => el === document.activeElement)).toBe(true);
    const foco = await botao.evaluate((el) => ({
      cor: getComputedStyle(el).outlineColor,
      largura: getComputedStyle(el).outlineWidth,
      estilo: getComputedStyle(el).outlineStyle,
    }));
    expect(foco).toEqual({ cor: "rgb(8, 100, 64)", largura: "2px", estilo: "solid" });
  } finally {
    await page.close();
  }
});
