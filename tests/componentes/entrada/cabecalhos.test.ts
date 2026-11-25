// Verifica hierarquia, foco e interação da entrada e do cabeçalho do BI no navegador.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
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
async function verificarFoco(no: Locator) {
  await no.waitFor();
  const medida = await no.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const depois = getComputedStyle(el, "::after");
    const largura = Number.parseFloat(depois.width);
    const altura = Number.parseFloat(depois.height);
    return {
      largura: Math.max(caixa.width, Number.isFinite(largura) ? largura : 0),
      altura: Math.max(caixa.height, Number.isFinite(altura) ? altura : 0),
    };
  });
  expect(medida.altura).toBeGreaterThanOrEqual(44);
  expect(medida.largura).toBeGreaterThanOrEqual(44);
  // A tecla anterior ativa a modalidade de teclado; o foco direto evita
  // depender da ordem de tabulação, que muda com os menus do BI.
  await no.page().keyboard.press("Tab");
  await no.focus();
  expect(await no.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(
    await no.evaluate((el) => {
      const estilo = getComputedStyle(el);
      return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
    }),
  ).toBe(true);
}
async function verificarDiscreto(no: Locator) {
  await no.waitFor();
  expect(await fundo(no)).toBe("rgba(0, 0, 0, 0)");
  await verificarFoco(no);
}
async function aguardarTema(page: Page, tema: string) {
  await expect.poll(() => page.locator("html").getAttribute("data-mui-color-scheme")).toBe(tema);
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
    await aguardarTema(page, tema);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (process.env.CAPTURA_CABECALHOS)
      await page.screenshot({
        path: `${process.env.CAPTURA_CABECALHOS}/entrada-${tema}-${largura}.png`,
      });
    const email = page.getByLabel("E-mail ou identificador");
    expect(await fundo(email.locator("xpath=.."))).not.toBe("rgba(0, 0, 0, 0)");
    expect(await fundo(page.getByRole("button", { name: "Entrar", exact: true }))).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    for (const nome of ["FrequenciBI", "GitHub", "API", "Política de privacidade"])
      await verificarDiscreto(page.getByRole("link", { name: nome, exact: true }));
    const sobre = page.getByRole("button", { name: "Sobre", exact: true });
    await verificarDiscreto(sobre);
    await sobre.press("Enter");
    const dialogo = page.getByRole("dialog");
    await dialogo.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await dialogo.waitFor({ state: "hidden" });
    const botaoTema = page.getByRole("button", { name: /Tema:.*Alterar tema/ });
    await verificarFoco(botaoTema);
    await botaoTema.press("Enter");
    const gruposTema = page.getByRole("radiogroup", { name: "Tema do aplicativo" });
    await gruposTema.waitFor({ state: "visible" });
    expect(await gruposTema.isVisible()).toBe(true);
    await page.getByRole("radio", { name: tema === "light" ? "Escuro" : "Claro" }).click();
    await expect
      .poll(() => page.locator("html").getAttribute("data-mui-color-scheme"))
      .toBe(tema === "light" ? "dark" : "light");
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
    await aguardarTema(page, tema);
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
      await aguardarTema(page, tema);
      // O BI rola dentro da área de conteúdo; mede a caixa dos elementos, não o documento.
      const excessos = await page.evaluate(() => {
        const limite = document.documentElement.clientWidth + 1;
        return Array.from(document.querySelectorAll("main *"))
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
          .filter((el) => {
            const estilo = getComputedStyle(el);
            if (estilo.display === "none" || estilo.visibility === "hidden") return false;
            for (let pai = el.parentElement; pai; pai = pai.parentElement) {
              if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(pai).overflowX))
                return false;
            }
            const caixa = el.getBoundingClientRect();
            return caixa.width > 0 && (caixa.left < -1 || caixa.right > limite);
          })
          .slice(0, 8)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      });
      expect(excessos).toEqual([]);
      if (largura === 390) {
        await page.getByRole("button", { name: "Filtros da análise", exact: true }).click();
      }
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
        const nav = page.getByRole("tablist", { name: "Seções do FrequenciBI" });
        expect(await fundo(nav.getByRole("tab", { name: "Visão geral" }))).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        const faltas = nav.getByRole("tab", { name: "Faltas", exact: true });
        await verificarDiscreto(faltas);
        await faltas.press("Enter");
        expect(await faltas.getAttribute("aria-current")).toBe("page");
        for (const nome of ["Compartilhar filtros", "Apresentar", "Imprimir"])
          await verificarDiscreto(page.getByRole("button", { name: nome, exact: true }));
        await page.getByRole("button", { name: "Apresentar", exact: true }).press("Enter");
      } else {
        const secao = page.getByRole("combobox", { name: "Seção do FrequenciBI" });
        expect(await fundo(secao.locator("xpath=.."))).not.toBe("rgba(0, 0, 0, 0)");
        await secao.click();
        await page.getByRole("option", { name: "Faltas", exact: true }).click();
        expect(await secao.textContent()).toContain("Faltas");
        const menu = page.getByRole("button", { name: "Mais ações do FrequenciBI" });
        await verificarDiscreto(menu);
        await menu.press("Enter");
        const botaoTema = page.getByRole("button", { name: /Tema:.*Alterar tema/ });
        await botaoTema.waitFor();
        await page.keyboard.press("Escape");
        // O painel devolve o foco ao seu botão após terminar de fechar.
        await botaoTema.waitFor({ state: "hidden" });
        await expect.poll(() => menu.evaluate((el) => el === document.activeElement)).toBe(true);
        const analise = page.getByRole("button", { name: "Mais ações da análise" });
        await verificarDiscreto(analise);
        await analise.press("Enter");
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
