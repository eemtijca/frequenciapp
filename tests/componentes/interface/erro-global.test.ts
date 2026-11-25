// Testa o fallback global real em navegador usando fixture Vite independente.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator } from "@playwright/test";
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

async function medirAcao(acao: Locator) {
  return acao.evaluate((el) => {
    const { width, height, left, right, top, bottom } = el.getBoundingClientRect();
    const estilo = getComputedStyle(el);
    const espessura = parseFloat(estilo.outlineWidth);
    const offset = parseFloat(estilo.outlineOffset);
    const margem = espessura + offset;
    return {
      largura: width,
      altura: height,
      focoAtivo: el === document.activeElement,
      focoVisivel: el.matches(":focus-visible"),
      anel: { estilo: estilo.outlineStyle, espessura, offset },
      cabeNaTela:
        left - margem >= 0 &&
        right + margem <= window.innerWidth &&
        top - margem >= 0 &&
        bottom + margem <= window.innerHeight,
    };
  });
}

async function conferirAcaoComFoco(acao: Locator) {
  const medida = await medirAcao(acao);
  expect(medida.largura).toBeGreaterThanOrEqual(48);
  expect(medida.altura).toBeGreaterThanOrEqual(48);
  expect(medida.focoAtivo).toBe(true);
  expect(medida.focoVisivel).toBe(true);
  expect(medida.anel).toEqual({ estilo: "solid", espessura: 3, offset: 2 });
  expect(medida.cabeNaTela).toBe(true);
  return medida;
}

for (const tema of ["light", "dark"] as const) {
  it(`fallback ${tema}: foco e reinício pelo teclado`, async () => {
    const page = await navegador.newPage({
      colorScheme: tema,
      viewport: { width: 320, height: 844 },
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
      expect(cores.fundo).toBe(tema === "light" ? "rgb(246, 246, 246)" : "rgb(20, 20, 19)");
      expect(cores.primaria).toBe(tema === "light" ? "rgb(29, 114, 83)" : "rgb(129, 207, 179)");
      expect(cores.secundaria).toBe("rgba(0, 0, 0, 0)");
      expect(cores.borda).toBe(tema === "light" ? "rgb(228, 228, 226)" : "rgb(57, 56, 55)");
      expect(cores.bordaEstilo).toBe("solid");
      const botao = page.getByRole("button", { name: "Tentar novamente" });
      const link = page.getByRole("link", { name: "Ir para o início" });
      expect(await link.getAttribute("href")).toBe("/");
      await page.keyboard.press("Tab");
      await conferirAcaoComFoco(botao);
      if (destino) await page.screenshot({ path: path.join(destino, `erro-global-${tema}.png`) });
      await page.keyboard.press("Enter");
      expect(await page.locator("html").getAttribute("data-reset")).toBe("executado");
      await page.keyboard.press("Tab");
      expect((await conferirAcaoComFoco(link)).altura).toBe(66);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    } finally {
      await page.close();
    }
  });
}
