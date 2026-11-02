// Verifica hierarquia, foco e interação da entrada e do cabeçalho do BI no navegador.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RECURSOS_BI } from "../../../src/domain/bi";

const requerer = createRequire(import.meta.url);
const caminho = requerer.resolve("vite", {
  paths: [path.dirname(requerer.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.join(tmpdir(), "vite-cabecalhos"),
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
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/entrada/cabecalhos.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
const combinacoes = [
  ["light", 390],
  ["dark", 390],
  ["light", 1280],
  ["dark", 1280],
] as const;
async function fundo(no: Locator) {
  return no.evaluate((el) => getComputedStyle(el).backgroundColor);
}
async function verificarDiscreto(no: Locator) {
  await no.waitFor();
  expect(await fundo(no)).toBe("rgba(0, 0, 0, 0)");
  const caixa = await no.boundingBox();
  expect(caixa?.height).toBeGreaterThanOrEqual(44);
  expect(caixa?.width).toBeGreaterThanOrEqual(44);
  await no.page().keyboard.press("Tab");
  await no.focus();
  expect(await no.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(await no.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
}
it.each(combinacoes)("entrada: ações auxiliares discretas em %s a %i px", async (tema, largura) => {
  const page = await browser.newPage({
    viewport: { width: largura, height: 900 },
    colorScheme: tema,
    reducedMotion: "reduce",
  });
  try {
    await page.route("**/icon.svg", (rota) =>
      rota.fulfill({ path: path.resolve("src/app/icon.svg"), contentType: "image/svg+xml" }),
    );
    await page.goto(url);
    await page.mouse.move(0, 0);
    await page.getByLabel("E-mail ou identificador").fill("teste");
    await page.getByLabel("Senha", { exact: true }).fill("exemplo");
    await expect.poll(() => page.locator("html").getAttribute("class")).toContain(tema);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURA_CABECALHOS)
      await page.screenshot({
        path: `${process.env.CAPTURA_CABECALHOS}/entrada-${tema}-${largura}.png`,
      });
    expect(await fundo(page.getByLabel("E-mail ou identificador"))).not.toBe("rgba(0, 0, 0, 0)");
    expect(await fundo(page.getByRole("button", { name: "Entrar", exact: true }))).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    for (const nome of ["FrequenciBI", "GitHub", "API"])
      await verificarDiscreto(page.getByRole("link", { name: nome, exact: true }));
    const sobre = page.getByRole("button", { name: "Sobre", exact: true });
    await verificarDiscreto(sobre);
    await sobre.press("Enter");
    expect(await page.getByRole("dialog").isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await verificarDiscreto(page.getByRole("button", { name: /Tema:.*Alterar tema/ }));
    await page.getByRole("button", { name: /Tema:.*Alterar tema/ }).press("Enter");
    expect(await page.getByRole("radiogroup", { name: "Tema do aplicativo" }).isVisible()).toBe(
      true,
    );
    await page.getByRole("radio", { name: tema === "light" ? "Escuro" : "Claro" }).click();
    await expect
      .poll(() => page.locator("html").getAttribute("class"))
      .toContain(tema === "light" ? "dark" : "light");
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
] as const)("entrada: atalhos em uma linha em %s a %i px", async (tema, largura) => {
  const page = await browser.newPage({
    viewport: { width: largura, height: 900 },
    colorScheme: tema,
    reducedMotion: "reduce",
  });
  try {
    await page.route("**/icon.svg", (rota) =>
      rota.fulfill({ path: path.resolve("src/app/icon.svg"), contentType: "image/svg+xml" }),
    );
    await page.goto(url);
    await expect.poll(() => page.locator("html").getAttribute("class")).toContain(tema);
    await page.mouse.move(0, 0);
    const nav = page.getByRole("navigation", { name: "Projeto e ferramentas" });
    const itens = [
      nav.getByRole("link", { name: "FrequenciBI", exact: true }),
      nav.getByRole("link", { name: "GitHub", exact: true }),
      nav.getByRole("link", { name: "API", exact: true }),
      nav.getByRole("button", { name: "Sobre", exact: true }),
    ];
    const caixas = await Promise.all(itens.map((item) => item.boundingBox()));
    if (process.env.CAPTURA_CABECALHOS)
      await page.screenshot({
        path: `${process.env.CAPTURA_CABECALHOS}/atalhos-${tema}-${largura}.png`,
      });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const primeira = caixas[0];
    expect(primeira).not.toBeNull();
    for (let indice = 0; indice < caixas.length; indice++) {
      const caixa = caixas[indice];
      expect(caixa).not.toBeNull();
      if (!caixa || !primeira) throw new Error("Atalho sem caixa visível");
      expect(Math.abs(caixa.y - primeira.y)).toBeLessThan(1);
      expect(caixa.width).toBeGreaterThanOrEqual(44);
      expect(caixa.height).toBeGreaterThanOrEqual(44);
      if (indice > 0) {
        const anterior = caixas[indice - 1];
        if (!anterior) throw new Error("Atalho anterior sem caixa visível");
        expect(caixa.x).toBeGreaterThanOrEqual(anterior.x + anterior.width - 0.05);
      }
    }
  } finally {
    await page.close();
  }
});

it.each(combinacoes)(
  "BI: controles auxiliares discretos e seleção preservada em %s a %i px",
  async (tema, largura) => {
    const page = await browser.newPage({
      viewport: { width: largura, height: 900 },
      colorScheme: tema,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      await page.route("**/api/bi?*", async (rota) => {
        const recurso = new URL(rota.request().url()).searchParams.get("recurso");
        await rota.fulfill({
          json: {
            recurso,
            linhas: [],
            pagina: 1,
            proximaPagina: null,
            consultadoEm: "2026-10-09T12:00:00Z",
            escopo: {},
            recursos: RECURSOS_BI,
          },
        });
      });
      await page.goto(`${url}?bi`);
      await page.getByLabel("Chave de acesso", { exact: true }).fill(`fbi_${"z".repeat(43)}`);
      await page.getByRole("button", { name: "Testar e entrar" }).click();
      await page.getByRole("button", { name: "Atualizar dados" }).waitFor();
      await expect
        .poll(() => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
        .toBeGreaterThan(0);
      await page.mouse.move(0, 0);
      await expect.poll(() => page.locator("html").getAttribute("class")).toContain(tema);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await fundo(page.getByRole("button", { name: "Aplicar período" }))).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      if (process.env.CAPTURA_CABECALHOS)
        await page.screenshot({
          path: `${process.env.CAPTURA_CABECALHOS}/bi-${tema}-${largura}.png`,
        });
      await verificarDiscreto(page.getByRole("link", { name: "Voltar ao FrequenciApp" }));
      if (largura >= 640) {
        await verificarDiscreto(page.getByRole("button", { name: /Tema:.*Alterar tema/ }));
        const nav = page.getByRole("navigation", { name: "Seções do FrequenciBI" });
        expect(await fundo(nav.getByRole("button", { name: "Visão geral" }))).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        const faltas = nav.getByRole("button", { name: "Faltas", exact: true });
        await verificarDiscreto(faltas);
        await faltas.press("Enter");
        expect(await faltas.getAttribute("aria-current")).toBe("page");
        expect(await fundo(faltas)).not.toBe("rgba(0, 0, 0, 0)");
        for (const nome of ["Compartilhar filtros", "Apresentar", "Imprimir"])
          await verificarDiscreto(page.getByRole("button", { name: nome, exact: true }));
        await page.getByRole("button", { name: "Apresentar", exact: true }).press("Enter");
      } else {
        const secao = page.getByRole("combobox", { name: "Seção do FrequenciBI" });
        expect(await fundo(secao)).not.toBe("rgba(0, 0, 0, 0)");
        await secao.click();
        await page.getByRole("option", { name: "Faltas", exact: true }).click();
        expect(await secao.textContent()).toContain("Faltas");
        const menu = page.getByRole("button", { name: "Mais ações do FrequenciBI" });
        await verificarDiscreto(menu);
        await menu.press("Enter");
        expect(await page.getByRole("button", { name: /Tema:.*Alterar tema/ }).isVisible()).toBe(
          true,
        );
        await page.keyboard.press("Escape");
        await verificarDiscreto(page.getByRole("button", { name: "Mais ações da análise" }));
        await page.getByRole("button", { name: "Mais ações da análise" }).press("Enter");
        expect(await page.getByRole("button", { name: "Apresentar" }).isVisible()).toBe(true);
        await page.getByRole("button", { name: "Apresentar", exact: true }).click();
      }
      const sair = page.locator("#root").getByRole("button", { name: "Sair da apresentação" });
      expect(await sair.isVisible()).toBe(true);
      await sair.click();
      expect(await page.getByRole("button", { name: "Atualizar dados" }).isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  },
);
