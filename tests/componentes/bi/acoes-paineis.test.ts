// Verifica aparência e interação dos comandos repetidos da grade do FrequenciBI.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { contraste, type Rgb } from "../helpers/cor";

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

async function aguardarEsquema(page: Page, tema: "light" | "dark") {
  await expect
    .poll(() => page.locator("html").getAttribute("data-mui-color-scheme"), { timeout: 15000 })
    .toBe(tema);
}

/** Botões preenchidos do MUI não têm fio próprio: o contraste exigido é o do texto. */
async function conferirAcaoPreenchida(botao: Locator) {
  await botao.waitFor({ state: "visible" });
  expect(await botao.isEnabled()).toBe(true);
  const estilo = await botao.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const canais = (valor: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = valor;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const css = getComputedStyle(el);
    return {
      fundo: css.backgroundColor,
      largura: caixa.width,
      altura: caixa.height,
      texto: canais(css.color),
      superficie: canais(css.backgroundColor),
    };
  });
  expect(estilo.largura).toBeGreaterThanOrEqual(43.99);
  expect(estilo.altura).toBeGreaterThanOrEqual(43.99);
  expect(estilo.fundo).not.toBe("rgba(0, 0, 0, 0)");
  const rgb = (canais: number[]) => canais.map((n) => n / 255) as Rgb;
  expect(contraste(rgb(estilo.texto), rgb(estilo.superficie))).toBeGreaterThanOrEqual(4.5);
  await botao.page().keyboard.press("Tab");
  await botao.focus();
  expect(await botao.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(
    await botao.evaluate((el) => {
      const css = getComputedStyle(el);
      return css.outlineStyle !== "none" || css.boxShadow !== "none";
    }),
  ).toBe(true);
  await botao.evaluate((el: HTMLElement) => el.blur());
}

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
    await page.goto(`${url}?tema=${tema}`);
    await page.getByRole("button", { name: "Mover Primeiro" }).waitFor();
    await aguardarEsquema(page, tema);
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
      await conferirAcaoPreenchida(botao);
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
