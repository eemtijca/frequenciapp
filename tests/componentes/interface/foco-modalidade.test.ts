// Verifica o foco visível e a navegação por teclado nos componentes MUI reais.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { TOKENS_LAYOUT } from "../../../src/theme/layout";

const requireVitest = createRequire(import.meta.url);
const vite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(vite).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;

/** Avança com Tab até o controle receber foco, sem usar focus() programático. */
async function focarComTab(pagina: Page, alvo: Locator) {
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    if (await alvo.evaluate((el) => el === document.activeElement)) return;
    await pagina.keyboard.press("Tab");
  }
  expect(await alvo.evaluate((el) => el === document.activeElement)).toBe(true);
}

function estiloDoBotao(botao: Locator) {
  return botao.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      ativo: el === document.activeElement,
      focoVisivel: el.matches(":focus-visible"),
      contorno: css.outlineStyle,
      largura: css.outlineWidth,
      deslocamento: css.outlineOffset,
      cor: css.outlineColor,
      sombra: css.boxShadow,
    };
  });
}

function estiloDoCampo(campo: Locator) {
  return campo.evaluate((el) => {
    const raiz = el.closest(".MuiOutlinedInput-root, .MuiInputBase-root");
    if (!raiz) throw new Error("Raiz do campo ausente");
    const css = getComputedStyle(raiz);
    const borda = raiz.querySelector(".MuiOutlinedInput-notchedOutline");
    return {
      ativo: el === document.activeElement,
      focoVisivel: el.matches(":focus-visible"),
      sombra: css.boxShadow,
      raio: css.borderRadius,
      borda: borda ? getComputedStyle(borda).borderTopColor : "",
      bordaLargura: borda ? getComputedStyle(borda).borderTopWidth : "",
    };
  });
}

beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.resolve("node_modules/.vite-foco-modalidade"),
    define: { "process.env": "{}" },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/foco-modalidade.html`;
  navegador = await chromium.launch({ headless: true });
}, 120000);

afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
});

it("foco por teclado mostra o anel de 3 px do tema no botão e no campo", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const botao = pagina.getByRole("button", { name: "Primeira ação", exact: true });
    const campo = pagina.getByRole("textbox", { name: "Nome", exact: true });
    await focarComTab(pagina, botao);
    const focoBotao = await estiloDoBotao(botao);
    expect(focoBotao.focoVisivel).toBe(true);
    expect(focoBotao.contorno).toBe("solid");
    expect(focoBotao.largura).toBe(`${TOKENS_LAYOUT.campo.foco}px`);
    expect(focoBotao.deslocamento).toBe("2px");
    await focarComTab(pagina, campo);
    await pagina.waitForTimeout(300);
    const focoCampo = await estiloDoCampo(campo);
    expect(focoCampo.focoVisivel).toBe(true);
    expect(focoCampo.raio).toBe(`${TOKENS_LAYOUT.campo.raio}px`);
    expect(focoCampo.bordaLargura).toBe("1px");
    expect(focoCampo.sombra).toContain(`0px 0px 0px ${TOKENS_LAYOUT.campo.foco}px`);
  } finally {
    await pagina.close();
  }
});

it("clique de ponteiro foca o botão sem ativar o anel de teclado", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const botao = pagina.getByRole("button", { name: "Primeira ação", exact: true });
    await botao.click();
    const foco = await estiloDoBotao(botao);
    expect(foco.ativo).toBe(true);
    expect(foco.focoVisivel).toBe(false);
    expect(foco.contorno).toBe("none");
    const externo = pagina.getByRole("button", { name: "Controle externo", exact: true });
    await externo.click();
    const focoExterno = await estiloDoBotao(externo);
    expect(focoExterno.ativo).toBe(true);
    expect(focoExterno.contorno).toBe("none");
    // O OutlinedInput usa .Mui-focused e o navegador mantém :focus-visible em
    // campos de texto, por isso a regra de ponteiro é verificada no ButtonBase.
  } finally {
    await pagina.close();
  }
});

it("Tab percorre os controles na ordem e Escape devolve o foco ao gatilho", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const primeira = pagina.getByRole("button", { name: "Primeira ação", exact: true });
    const nome = pagina.getByRole("textbox", { name: "Nome", exact: true });
    const nomeCurto = pagina.getByRole("textbox", { name: "Nome curto", exact: true });
    const gatilho = pagina.getByRole("button", { name: "Abrir diálogo", exact: true });
    for (const [indice, alvo] of [primeira, nome, nomeCurto, gatilho].entries()) {
      await pagina.keyboard.press("Tab");
      expect(
        await alvo.evaluate((el) => el === document.activeElement),
        `controle ${indice + 1}`,
      ).toBe(true);
    }
    await pagina.keyboard.press("Enter");
    const dialogo = pagina.getByRole("dialog", { name: "Diálogo de teste" });
    await dialogo.waitFor();
    expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await pagina.keyboard.press("Escape");
    await dialogo.waitFor({ state: "hidden" });
    await expect.poll(() => gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await pagina.close();
  }
});

it("mantém o foco preso dentro do diálogo ao avançar e recuar com Tab", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.getByRole("button", { name: "Abrir diálogo", exact: true }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Diálogo de teste" });
    await dialogo.waitFor();
    await expect
      .poll(() => dialogo.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      await pagina.keyboard.press("Tab");
      expect(
        await dialogo.evaluate((el) => el.contains(document.activeElement)),
        `Tab ${tentativa + 1}`,
      ).toBe(true);
    }
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      await pagina.keyboard.press("Shift+Tab");
      expect(
        await dialogo.evaluate((el) => el.contains(document.activeElement)),
        `Shift+Tab ${tentativa + 1}`,
      ).toBe(true);
    }
    expect(await dialogo.getAttribute("aria-modal")).toBe("true");
  } finally {
    await pagina.close();
  }
});

it.each(["teclado", "ponteiro"] as const)(
  "diálogo aberto por %s devolve o foco ao gatilho",
  async (modo) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const gatilho = pagina.getByRole("button", { name: "Abrir diálogo", exact: true });
      if (modo === "teclado") {
        await focarComTab(pagina, gatilho);
        await pagina.keyboard.press("Enter");
      } else {
        await gatilho.click();
      }
      const dialogo = pagina.getByRole("dialog", { name: "Diálogo de teste" });
      await dialogo.waitFor();
      expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      if (modo === "teclado") await pagina.keyboard.press("Escape");
      else await pagina.getByRole("button", { name: "Concluir", exact: true }).click();
      await dialogo.waitFor({ state: "hidden" });
      await expect.poll(() => gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
    } finally {
      await pagina.close();
    }
  },
);

it("forced-colors mantém o contorno do foco por teclado visível", async () => {
  const pagina = await navegador.newPage({ forcedColors: "active" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const botao = pagina.getByRole("button", { name: "Primeira ação", exact: true });
    await focarComTab(pagina, botao);
    const foco = await estiloDoBotao(botao);
    expect(foco.ativo).toBe(true);
    expect(foco.focoVisivel).toBe(true);
    expect(foco.contorno).toBe("solid");
    expect(foco.largura).toBe(`${TOKENS_LAYOUT.campo.foco}px`);
    expect(foco.cor).not.toBe("rgba(0, 0, 0, 0)");
    expect(foco.cor).not.toBe("transparent");
  } finally {
    await pagina.close();
  }
});
