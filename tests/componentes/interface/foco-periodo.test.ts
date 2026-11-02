// Regressões do componente real isolado: sem aplicativo, banco ou autenticação.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, webkit, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const vite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(vite).href);
const cache = mkdtempSync(path.join(tmpdir(), "foco-periodo-vite-"));
let servidor: Awaited<ReturnType<typeof createServer>>;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/foco-periodo.html`;
});
afterAll(async () => {
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

async function abrirFixture(page: Page, modo: "dia" | "mes") {
  await page.goto(url);
  await page.locator('[data-fixture-montado="true"]').waitFor({ state: "visible" });
  const gatilho = page.locator(`#${modo}`);
  await expect.poll(() => gatilho.isVisible()).toBe(true);
  await expect.poll(() => gatilho.isEnabled()).toBe(true);
  // Tab é intencional: não substituir por focus(), pois isso esconderia falhas de navegação.
  await page.keyboard.press("Tab");
  if (modo === "mes") await page.keyboard.press("Tab");
  expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
  return gatilho;
}

for (const [motor, tipo] of [
  ["chromium", chromium],
  ["webkit", webkit],
] as const) {
  for (const modo of ["dia", "mes"] as const) {
    for (const tecla of ["Enter", "Space"] as const) {
      it(`${motor}: ${modo} abre com ${tecla}, Escape devolve foco e reabre no valor`, async () => {
        const browser = await tipo.launch({ headless: true });
        try {
          const page = await browser.newPage({ reducedMotion: "reduce" });
          const gatilho = await abrirFixture(page, modo);
          await page.keyboard.press(tecla);
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
          const inicial =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-15"]')
              : page.getByRole("button", { name: "Outubro", exact: true });
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement))
            .toBe(true);
          await page.keyboard.press("ArrowLeft");
          await page.keyboard.press("Escape");
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
          await expect
            .poll(() => gatilho.evaluate((el) => el === document.activeElement))
            .toBe(true);
          await page.keyboard.press(tecla);
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement))
            .toBe(true);
        } finally {
          await browser.close();
        }
      });
    }
    it.each(["Enter", "Space"])(
      `${motor}: ${modo} seleciona data com %s e devolve foco`,
      async (tecla) => {
        const browser = await tipo.launch({ headless: true });
        try {
          const page = await browser.newPage({ reducedMotion: "reduce" });
          const gatilho = await abrirFixture(page, modo);
          await page.keyboard.press("Space");
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
          const inicial =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-15"]')
              : page.getByRole("button", { name: "Outubro", exact: true });
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement))
            .toBe(true);
          await page.keyboard.press("ArrowLeft");
          const destino =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-14"]')
              : page.getByRole("button", { name: "Setembro", exact: true });
          await expect
            .poll(() => destino.evaluate((el) => el === document.activeElement))
            .toBe(true);
          await page.keyboard.press(tecla);
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
          await expect
            .poll(() => gatilho.evaluate((el) => el === document.activeElement))
            .toBe(true);
          expect(await gatilho.getAttribute("aria-label")).toContain(
            modo === "dia" ? "2026-10-14" : "2026-09",
          );
          await page.keyboard.press("Enter");
          const selecionado =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-14"]')
              : page.getByRole("button", { name: "Setembro", exact: true });
          await expect
            .poll(() => selecionado.evaluate((el) => el === document.activeElement))
            .toBe(true);
        } finally {
          await browser.close();
        }
      },
    );
  }
  it(`${motor}: Fechar devolve foco e o gatilho alterna uma única vez`, async () => {
    const browser = await tipo.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const gatilho = await abrirFixture(page, "dia");
      const estado = page.getByLabel("Estado do calendário");
      await page.keyboard.press("Enter");
      await expect.poll(() => estado.textContent()).toBe("aberto");
      await page.getByRole("button", { name: "Fechar", exact: true }).focus();
      await page.keyboard.press("Space");
      await expect.poll(() => estado.textContent()).toBe("fechado");
      await expect.poll(() => gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
      await gatilho.click();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
      await gatilho.click();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
    } finally {
      await browser.close();
    }
  });
  it(`${motor}: foco deslocado para outro controle não volta ao gatilho`, async () => {
    const browser = await tipo.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const gatilho = await abrirFixture(page, "dia");
      await page.keyboard.press("Enter");
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
      const externo = page.getByRole("button", { name: "Controle externo" });
      await externo.focus();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
      await expect.poll(() => externo.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await browser.close();
    }
  });
  for (const toque of [false, true]) {
    it(`${motor}: ${toque ? "toque" : "clique"} fora ativa outro controle sem devolver foco`, async () => {
      const browser: Browser = await tipo.launch({ headless: true });
      try {
        const page = await browser.newPage({ hasTouch: toque, reducedMotion: "reduce" });
        const gatilho = await abrirFixture(page, "dia");
        await page.keyboard.press("Enter");
        await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
        const externo = page.getByRole("button", { name: "Controle externo" });
        if (toque) await externo.tap();
        else await externo.click();
        await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
        await expect.poll(() => page.getByLabel("Ativações externas").textContent()).toBe("1");
        expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(false);
      } finally {
        await browser.close();
      }
    });
  }
}
