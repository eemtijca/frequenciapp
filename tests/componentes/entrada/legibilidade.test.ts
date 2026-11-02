// Mede componentes em Chromium sem aplicação ou banco. Esta fixture NÃO monta
// next/font nem o contêiner de produção: usa fonte fallback e é só regressão
// local, não prova de legibilidade da interface real.
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requerer = createRequire(import.meta.url);
const caminho = requerer.resolve("vite", {
  paths: [path.dirname(requerer.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const cache = mkdtempSync(path.join(tmpdir(), "vite-legibilidade-mobile-"));
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: {
      alias: {
        "next/navigation": path.resolve("tests/componentes/entrada/navegacao-falsa.ts"),
        "@": path.resolve("src"),
      },
    },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/entrada/legibilidade.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  expect(servidor.httpServer?.listening).toBe(false);
  rmSync(cache, { recursive: true, force: true });
});

it.each([
  ["light", 320],
  ["dark", 320],
  ["light", 390],
  ["dark", 390],
] as const)("placeholder inteiro e com ambos os formatos em %s a %i px", async (tema, largura) => {
  const page = await browser.newPage({
    viewport: { width: largura, height: 900 },
    colorScheme: tema,
  });
  try {
    await page.route("**/api/**", (rota) => rota.abort());
    await page.goto(url);
    await expect.poll(() => page.locator("html").getAttribute("class")).toContain(tema);
    const input = page.getByLabel("E-mail ou identificador");
    const medida = await input.evaluate((el: HTMLInputElement) => {
      const estilo = getComputedStyle(el, "::placeholder");
      const campo = getComputedStyle(el);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.font = `${estilo.fontStyle} ${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
      return {
        texto: el.placeholder,
        textoPx:
          ctx.measureText(el.placeholder).width +
          Math.max(0, el.placeholder.length - 1) * (parseFloat(estilo.letterSpacing) || 0),
        disponivel: el.clientWidth - parseFloat(campo.paddingLeft) - parseFloat(campo.paddingRight),
        altura: el.getBoundingClientRect().height,
      };
    });
    expect(medida.texto).toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    expect(medida.texto).toMatch(/\b\d+[a-z]-[a-z]+\b/i);
    expect(medida.altura).toBeGreaterThanOrEqual(44);
    expect(medida.textoPx, JSON.stringify(medida)).toBeLessThanOrEqual(medida.disponivel);
  } finally {
    await page.close();
  }
});

it.each([
  ["light", 320],
  ["dark", 320],
  ["light", 390],
  ["dark", 390],
  ["light", 1280],
  ["dark", 1280],
] as const)("data e dia legíveis, acessíveis e navegáveis em %s a %i px", async (tema, largura) => {
  const page = await browser.newPage({
    viewport: { width: largura, height: 900 },
    colorScheme: tema,
    reducedMotion: "reduce",
  });
  try {
    await page.route("**/api/**", (rota) => rota.abort());
    await page.goto(`${url}?chamada`);
    await expect.poll(() => page.locator("html").getAttribute("class")).toContain(tema);
    const seletor = page.locator("#dia-frequencia");
    await seletor.waitFor();
    const anterior = page.getByRole("button", { name: "Dia anterior" });
    const seguinte = page.getByRole("button", { name: "Dia seguinte" });
    const rotulo = await seletor.getAttribute("aria-label");
    expect(rotulo).toMatch(/Data da chamada:.*02\/11\/2026/i);
    expect(rotulo).toMatch(/hoje/i);
    const caixas = await Promise.all(
      [anterior, seletor, seguinte].map((item) => item.boundingBox()),
    );
    const [antes, meio, depois] = caixas;
    if (!antes || !meio || !depois) throw new Error("Controle invisível");
    for (const caixa of [antes, meio, depois]) {
      expect(caixa.width).toBeGreaterThanOrEqual(43.95);
      expect(caixa.height).toBeGreaterThanOrEqual(43.95);
      expect(Math.abs(caixa.y - meio.y)).toBeLessThan(1);
    }
    expect(antes.x + antes.width).toBeLessThanOrEqual(meio.x + 0.05);
    expect(meio.x + meio.width).toBeLessThanOrEqual(depois.x + 0.05);
    expect(antes.x).toBeGreaterThanOrEqual(0);
    expect(depois.x + depois.width).toBeLessThanOrEqual(largura + 0.05);
    const dataVisivel = await seletor
      .locator(":scope > span")
      .first()
      .evaluate((el) => ({
        texto: (el as HTMLElement).innerText,
        largura: el.clientWidth,
        total: el.scrollWidth,
        borda: el.getBoundingClientRect().toJSON(),
      }));
    expect(dataVisivel.texto).toBe("02/11/2026");
    expect(dataVisivel.total).toBeLessThanOrEqual(dataVisivel.largura);
    expect(dataVisivel.borda.left).toBeGreaterThanOrEqual(meio.x);
    expect(dataVisivel.borda.right).toBeLessThanOrEqual(meio.x + meio.width);
    if (largura < 1280) {
      const detalhe = seletor.locator(":scope > span.text-muted-foreground");
      const medida = await detalhe.evaluate((el) => ({
        texto: (el as HTMLElement).innerText,
        largura: el.clientWidth,
        total: el.scrollWidth,
      }));
      expect(medida.texto).toMatch(/^(seg\.|segunda(?:-feira)?)$/i);
      expect(medida.total, JSON.stringify(medida)).toBeLessThanOrEqual(medida.largura);
    }
    expect(rotulo).toMatch(/segunda-feira/i);
    await page.keyboard.press("Tab");
    await seletor.focus();
    expect(await seletor.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(
      await seletor.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await seletor.click();
    expect(await page.getByRole("dialog", { name: "Data da chamada" }).isVisible()).toBe(true);
    await page.keyboard.press("Escape");
  } finally {
    await page.close();
  }
});

// A data muda pelo calendário real; cobre as demais abreviações da chamada.
it.each([
  ["2026-10-27", "terça-feira", "ter."],
  ["2026-10-28", "quarta-feira", "qua."],
  ["2026-10-29", "quinta-feira", "qui."],
  ["2026-10-30", "sexta-feira", "sex."],
  ["2026-10-31", "sábado", "sáb."],
])("abrevia %s sem cortar ao selecionar pelo calendário", async (dia, nome, curto) => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 900 },
    colorScheme: "dark",
  });
  try {
    await page.route("**/api/**", (rota) => rota.abort());
    await page.goto(`${url}?chamada`);
    const seletor = page.locator("#dia-frequencia");
    await seletor.click();
    const dialogo = page.getByRole("dialog", { name: "Data da chamada" });
    await dialogo.getByRole("button", { name: "Mês anterior" }).click();
    await dialogo.locator(`[data-dia="${dia}"]`).click();
    await expect.poll(() => seletor.getAttribute("aria-label")).toContain(nome);
    const medida = await seletor.locator(":scope > span.text-muted-foreground").evaluate((el) => ({
      texto: (el as HTMLElement).innerText,
      largura: el.clientWidth,
      total: el.scrollWidth,
    }));
    expect(medida.texto).toBe(curto);
    expect(medida.total).toBeLessThanOrEqual(medida.largura);
  } finally {
    await page.close();
  }
});
