// Testa o fallback global real em navegador usando fixture Vite independente.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;
const destino = process.env.CAPTURAS_ESTADOS;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    define: { "process.env": "{}" },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/erro-global.html`;
  navegador = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
});
for (const tema of ["light", "dark"] as const) {
  it(`fallback ${tema}: foco e reinício pelo teclado`, async () => {
    const page = await navegador.newPage({
      colorScheme: tema,
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.goto(url);
      await expect
        .poll(() => page.getByRole("heading", { name: "Algo saiu do esperado" }).isVisible())
        .toBe(true);
      const cores = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        const primariaElemento = document.querySelector("button.acao");
        const secundariaElemento = document.querySelector("a.secundaria");
        if (!primariaElemento || !secundariaElemento) throw new Error("Ações não encontradas");
        const primaria = getComputedStyle(primariaElemento);
        const secundaria = getComputedStyle(secundariaElemento);
        return {
          fundo: body.backgroundColor,
          primaria: primaria.backgroundColor,
          secundaria: secundaria.backgroundColor,
          borda: secundaria.borderTopColor,
          bordaEstilo: secundaria.borderTopStyle,
        };
      });
      expect(cores.fundo).toBe(tema === "light" ? "rgb(246, 246, 246)" : "rgb(28, 27, 25)");
      expect(cores.primaria).toBe("rgb(23, 120, 77)");
      if (tema === "light") {
        expect(cores.secundaria).toBe("rgba(0, 0, 0, 0)");
        expect(cores.borda).toBe("rgb(217, 221, 218)");
        expect(cores.bordaEstilo).toBe("solid");
      } else {
        expect(cores.secundaria).toBe("rgb(43, 41, 37)");
        expect(cores.borda).toBe("rgba(0, 0, 0, 0)");
      }
      await page.keyboard.press("Tab");
      const botao = page.getByRole("button", { name: "Tentar novamente" });
      const focoPrimario = await botao.evaluate((el) => getComputedStyle(el).outlineWidth);
      expect(focoPrimario).toBe("2px");
      expect(await botao.evaluate((el) => el === document.activeElement)).toBe(true);
      if (destino) await page.screenshot({ path: path.join(destino, `erro-global-${tema}.png`) });
      await page.keyboard.press("Enter");
      expect(await page.locator("html").getAttribute("data-reset")).toBe("executado");
      await page.keyboard.press("Tab");
      expect(
        await page
          .getByRole("link", { name: "Ir para o início" })
          .evaluate((el) => el === document.activeElement),
      ).toBe(true);
      expect(
        await page
          .getByRole("link", { name: "Ir para o início" })
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe("2px");
    } finally {
      await page.close();
    }
  });
}
