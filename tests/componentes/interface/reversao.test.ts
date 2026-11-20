// Verifica recolhimento, seleção, foco e cores forçadas do seletor de turmas.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, it } from "vitest";

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
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/reversao.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

async function abrir(reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const page = await browser.newPage({ reducedMotion });
  await page.goto(url);
  const gatilho = page.getByRole("button", { name: "Turmas", exact: true });
  await gatilho.click({ timeout: 90000 });
  const serie = page.getByRole("button", { name: "1ª série", exact: true });
  const grupoSeries = page.getByRole("group", { name: "Séries", exact: true });
  return { page, gatilho, serie, grupoSeries };
}

function turma(grupo: Locator, nome: string): Locator {
  return grupo.getByRole("button", { name: `1ª série ${nome}`, exact: true });
}

it("abre o painel, expande a série e preserva a turma escolhida", async () => {
  const { page, gatilho, grupoSeries } = await abrir();
  try {
    await expect(gatilho).toHaveAttribute("aria-expanded", "true");
    const serie = page.getByRole("button", { name: "1ª série", exact: true });
    await expect(serie).toHaveAttribute("aria-expanded", "true");
    const turmaA = turma(grupoSeries, "A");
    const turmaB = turma(grupoSeries, "B");
    await expect(turmaA).toHaveAttribute("aria-pressed", "true");
    await turmaB.click();
    await expect(turmaB).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Turma escolhida")).toHaveText("turma-B");

    await serie.click();
    await expect(serie).toHaveAttribute("aria-expanded", "false");
    await expect(turmaB).toBeHidden();
    await serie.click();
    await expect(turmaB).toHaveAttribute("aria-pressed", "true");
    await gatilho.click();
    await expect(serie).toBeHidden();
  } finally {
    await page.close();
  }
});

it("Escape fecha o painel e devolve o foco ao gatilho", async () => {
  const { page, gatilho } = await abrir();
  try {
    const turmaA = turma(page.getByRole("group", { name: "Séries" }), "A");
    await turmaA.focus();
    await page.keyboard.press("Escape");
    await expect(gatilho).toHaveAttribute("aria-expanded", "false");
    expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
    await expect(page.getByRole("group", { name: "Séries" })).toBeHidden();
  } finally {
    await page.close();
  }
});

it("alterna o painel em quadros consecutivos sem perder a seleção", async () => {
  const { page, gatilho } = await abrir();
  try {
    await gatilho.evaluate(async (botao: HTMLButtonElement) => {
      for (let i = 0; i < 3; i++) {
        botao.click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await expect(gatilho).toHaveAttribute("aria-expanded", "false");
    await gatilho.click();
    const grupo = page.getByRole("group", { name: "Séries" });
    await expect(grupo).toBeVisible();
    const turmaA = turma(grupo, "A");
    await expect(turmaA).toHaveAttribute("aria-pressed", "true");
    await expect(turmaA).toBeVisible();
  } finally {
    await page.close();
  }
});

it("mantém a navegação com movimento reduzido", async () => {
  const { page, gatilho, serie, grupoSeries } = await abrir("reduce");
  try {
    await expect(serie).toBeVisible();
    const turmaB = turma(grupoSeries, "B");
    await expect(turmaB).toBeVisible();
    await turmaB.click();
    await serie.click();
    await expect(turmaB).toBeHidden();
    await serie.click();
    await expect(turmaB).toBeVisible();
    await gatilho.click();
    await expect(serie).toBeHidden();
    await gatilho.press("Enter");
    await expect(turmaB).toBeVisible();
  } finally {
    await page.close();
  }
});

it("preserva a seleção e distingue a borda em cores forçadas", async () => {
  const page = await browser.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Turmas", exact: true }).click({ timeout: 90000 });
    const grupo = page.getByRole("group", { name: "Séries" });
    const selecionada = turma(grupo, "A");
    const outra = turma(grupo, "B");
    expect(await selecionada.getAttribute("aria-pressed")).toBe("true");
    expect(await selecionada.locator("svg.lucide-check").count()).toBe(0);
    const borda = (alvo: Locator) =>
      alvo.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return { cor: estilo.borderTopColor, largura: estilo.borderTopWidth };
      });
    const [bordaSelecionada, bordaOutra] = await Promise.all([borda(selecionada), borda(outra)]);
    expect(bordaSelecionada.largura).toBe("1px");
    expect(bordaSelecionada.cor).not.toBe(bordaOutra.cor);
  } finally {
    await page.close();
  }
});

it("expõe foco visível no gatilho e na série ao navegar por teclado", async () => {
  const page: Page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    const gatilho = page.getByRole("button", { name: "Turmas", exact: true });
    await gatilho.focus();
    await page.keyboard.press("Enter");
    const serie = page.getByRole("button", { name: "1ª série", exact: true });
    for (let i = 0; i < 6 && !(await serie.evaluate((el) => el === document.activeElement)); i += 1)
      await page.keyboard.press("Tab");
    expect(await serie.evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await serie.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const estilos = await serie.evaluate((el) => {
      const estilo = getComputedStyle(el);
      return { contorno: estilo.outlineStyle, sombra: estilo.boxShadow };
    });
    expect(estilos.contorno !== "none" || estilos.sombra !== "none").toBe(true);
  } finally {
    await page.close();
  }
});
