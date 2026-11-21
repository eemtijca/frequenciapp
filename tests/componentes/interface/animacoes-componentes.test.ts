// Verifica as transições curtas do MUI e o efeito de prefers-reduced-motion.
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let navegador: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/animacoes-componentes.html");
  navegador = await chromium.launch({ headless: true });
  // A primeira navegação também espera a otimização de dependências do Vite.
  const aquecimento = await abrirPagina(390);
  try {
    await aquecimento.getByRole("button", { name: "Configurações" }).waitFor({ timeout: 90000 });
  } finally {
    await aquecimento.close();
  }
}, 120000);

afterAll(async () => {
  await navegador?.close();
  await servidor?.fechar();
});

async function abrirPagina(
  largura: number,
  movimento: "no-preference" | "reduce" = "no-preference",
): Promise<Page> {
  const pagina = await navegador.newPage({
    viewport: { width: largura, height: 800 },
    reducedMotion: movimento,
  });
  pagina.setDefaultNavigationTimeout(90000);
  await pagina.goto(servidor.url);
  return pagina;
}

/** Converte a lista de transition-duration em segundos e devolve a maior. */
function maiorDuracao(valor: string): number {
  return Math.max(
    ...valor.split(",").map((parte) => {
      const texto = parte.trim();
      const numero = Number.parseFloat(texto);
      if (!Number.isFinite(numero)) return Number.POSITIVE_INFINITY;
      return texto.endsWith("ms") ? numero / 1000 : numero;
    }),
  );
}

function estiloDaTransicao(alvo: Locator) {
  return alvo.evaluate((el) => {
    const css = getComputedStyle(el);
    return { propriedade: css.transitionProperty, duracao: css.transitionDuration };
  });
}

it("acordeão MUI usa transição curta de altura e mantém o estado acessível", async () => {
  const pagina = await abrirPagina(390);
  try {
    const gatilho = pagina.getByRole("button", { name: "Configurações" });
    expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
    await gatilho.click();
    await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
    const regiao = pagina.getByRole("region", { name: "Configurações" });
    await regiao.waitFor();
    expect(await regiao.getByRole("button", { name: "Ação interna" }).isVisible()).toBe(true);
    const acordeao = gatilho.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' MuiAccordion-root ')][1]",
    );
    const colapso = acordeao.locator(".MuiCollapse-root");
    const entrada = await estiloDaTransicao(colapso);
    expect(entrada.propriedade).toContain("height");
    expect(maiorDuracao(entrada.duracao)).toBeLessThanOrEqual(0.4);
    await gatilho.click();
    await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
    await expect.poll(() => regiao.isVisible()).toBe(false);
    const saida = await estiloDaTransicao(colapso);
    expect(maiorDuracao(saida.duracao)).toBeLessThanOrEqual(0.4);
  } finally {
    await pagina.close();
  }
});

it("diálogo MUI usa transição curta de opacidade, contém o foco e devolve ao gatilho", async () => {
  const pagina = await abrirPagina(390);
  try {
    const gatilho = pagina.getByRole("button", { name: "Abrir modal" });
    await gatilho.click();
    const dialogo = pagina.getByRole("dialog", { name: "Modal de teste" });
    await dialogo.waitFor();
    const transicao = await estiloDaTransicao(pagina.locator(".MuiDialog-root"));
    expect(transicao.propriedade).toMatch(/opacity|all/);
    expect(maiorDuracao(transicao.duracao)).toBeLessThanOrEqual(0.4);
    expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    const caixa = await dialogo.boundingBox();
    expect(caixa?.width).toBeLessThanOrEqual(560.5);
    await pagina.keyboard.press("Escape");
    await expect.poll(() => pagina.getByRole("dialog").count()).toBe(0);
    await expect.poll(() => gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await pagina.close();
  }
});

it("prefers-reduced-motion reduz a duração das transições sem impedir a interação", async () => {
  const pagina = await abrirPagina(390, "reduce");
  try {
    const gatilho = pagina.getByRole("button", { name: "Configurações" });
    await gatilho.click();
    await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
    const regiao = pagina.getByRole("region", { name: "Configurações" });
    await regiao.waitFor();
    const acordeao = gatilho.locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' MuiAccordion-root ')][1]",
    );
    const colapso = acordeao.locator(".MuiCollapse-root");
    const transicaoAcordeao = await estiloDaTransicao(colapso);
    expect(maiorDuracao(transicaoAcordeao.duracao)).toBeLessThanOrEqual(0.001);
    await gatilho.click();
    await expect.poll(() => regiao.isVisible()).toBe(false);
    const modal = pagina.getByRole("button", { name: "Abrir modal" });
    await modal.click();
    const dialogo = pagina.getByRole("dialog", { name: "Modal de teste" });
    await dialogo.waitFor();
    const transicaoDialogo = await estiloDaTransicao(dialogo);
    expect(maiorDuracao(transicaoDialogo.duracao)).toBeLessThanOrEqual(0.001);
    await pagina.keyboard.press("Escape");
    await expect.poll(() => pagina.getByRole("dialog").count()).toBe(0);
    await expect.poll(() => modal.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await pagina.close();
  }
});
