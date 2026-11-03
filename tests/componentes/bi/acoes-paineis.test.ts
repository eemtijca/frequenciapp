// Verifica aparência e interação dos comandos repetidos da grade do FrequenciBI.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { conferirSuperficieAcao } from "../superficie-acao";

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
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/bi/acoes-paineis.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

it.each([
  ["light", 390],
  ["dark", 390],
  ["light", 1280],
  ["dark", 1280],
] as const)("comandos auxiliares sem fundos redundantes em %s e %s px", async (tema, largura) => {
  const page = await browser.newPage({
    viewport: { width: largura, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Mover Primeiro" }).waitFor();
    await page.evaluate((classe) => {
      document.documentElement.className = classe;
    }, tema);
    expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
      tema === "dark",
    );
    await page.mouse.move(0, 0);
    const cartao = page.locator("article[data-grafico-id]").first();
    await cartao.getByRole("button", { name: "Mover Primeiro" }).waitFor();
    for (const nome of ["Mover", "Subir", "Descer", "Redimensionar", "Duplicar"]) {
      const botao = cartao.getByRole("button", { name: `${nome} Primeiro` });
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        "rgba(0, 0, 0, 0)",
      );
      const caixa = await botao.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(44);
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
    }
    for (const nome of ["Editar", "Excluir Primeiro", "Tabela", "Exportar CSV de Primeiro"]) {
      const botao = cartao.getByRole("button", { name: nome, exact: true });
      await conferirSuperficieAcao(page, botao, tema);
    }
    await cartao.getByRole("button", { name: "Exportar CSV de Primeiro" }).press("Enter");
    expect(await page.getByTestId("confirmacoes").textContent()).toBe("1");
    const tabela = cartao.getByRole("button", { name: "Tabela", exact: true });
    expect(await tabela.getAttribute("aria-expanded")).toBe("false");
    await tabela.press("Enter");
    expect(await tabela.getAttribute("aria-expanded")).toBe("true");
    await tabela.press("Enter");
    expect(await tabela.getAttribute("aria-expanded")).toBe("false");
    expect(await cartao.getByRole("button", { name: "Subir Primeiro" }).isDisabled()).toBe(true);
    const mover = cartao.getByRole("button", { name: "Mover Primeiro" });
    if (process.env.CAPTURA_BI) {
      await page.screenshot({ path: `${process.env.CAPTURA_BI}/${tema}-${largura}.png` });
    }
    await mover.focus();
    expect(await mover.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(
      await mover.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await mover.hover();
    await expect
      .poll(() => mover.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe("rgba(0, 0, 0, 0)");
    await mover.press("ArrowDown");
    expect(await page.locator("article h3").allTextContents()).toEqual(["Segundo", "Primeiro"]);
    const redimensionar = page.getByRole("button", { name: "Redimensionar Primeiro" });
    const antes = await redimensionar
      .locator("xpath=ancestor::div[@data-painel-item]")
      .getAttribute("style");
    await redimensionar.focus();
    await redimensionar.press("ArrowRight");
    const depois = await redimensionar
      .locator("xpath=ancestor::div[@data-painel-item]")
      .getAttribute("style");
    expect(depois).not.toBe(antes);
    await page.getByRole("button", { name: "Duplicar Primeiro" }).click();
    expect(await page.locator("article h3").allTextContents()).toEqual([
      "Segundo",
      "Primeiro",
      "Primeiro (cópia)",
    ]);
    await page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: "Primeiro", exact: true }) })
      .getByRole("button", { name: "Editar" })
      .click();
    expect(await page.getByTestId("editado").textContent()).toBe("Primeiro");
    await page.getByRole("button", { name: "Excluir Primeiro (cópia)", exact: true }).click();
    expect(await page.locator("article h3").allTextContents()).toEqual(["Segundo", "Primeiro"]);
    await page.emulateMedia({ forcedColors: "active" });
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Mover Primeiro", exact: true }).focus();
    expect(
      await page
        .getByRole("button", { name: "Mover Primeiro", exact: true })
        .evaluate((el) => el.matches(":focus-visible")),
    ).toBe(true);
    expect(
      await page
        .getByRole("button", { name: "Mover Primeiro", exact: true })
        .evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");
  } finally {
    await page.close();
  }
});
