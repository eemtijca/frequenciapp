// Verifica as transições curtas do MUI e o efeito de prefers-reduced-motion.
import {
  chromium,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { iniciarAnimacoes } from "../../../src/theme/preferencia-animacoes";
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

it("Desativadas no perfil torna o carregamento estático e permanece após recarregar", async () => {
  const pagina = await abrirPagina(390);
  try {
    const circular = pagina.getByRole("progressbar", { name: "Carregamento circular" });
    await esperar(circular).not.toHaveCSS("animation-name", "none");
    const perfil = pagina.getByRole("button", { name: "Conta de Pessoa sintética" });
    await perfil.click();
    const grupo = pagina.getByRole("group", { name: "Animações da interface" });
    const desativadas = grupo.getByRole("menuitemradio", { name: "Desativadas" });
    await esperar(grupo.getByRole("menuitemradio", { name: "Sistema" })).toBeChecked();
    await desativadas.click();
    await esperar(desativadas).toBeChecked();
    await pagina.keyboard.press("Escape");
    await esperar(perfil).toBeFocused();
    await esperar(circular).toBeVisible();
    await esperar(circular).toHaveCSS("animation-name", "none");
    await esperar(circular.locator("circle").last()).toHaveCSS("animation-name", "none");
    const linear = pagina.getByRole("progressbar", { name: "Carregamento linear" });
    const barra = linear.locator(".MuiLinearProgress-bar1");
    await esperar(barra).toHaveCSS("animation-name", "none");
    expect((await barra.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    expect(
      await pagina
        .getByTestId("esqueleto")
        .evaluate((no) => getComputedStyle(no, "::after").animationName),
    ).toBe("none");
    await pagina.reload();
    await esperar(circular).toHaveCSS("animation-name", "none");
    await perfil.click();
    await esperar(desativadas).toBeChecked();
  } finally {
    await pagina.close();
  }
});

it("Minhas turmas usa a mesma preferência e Ativadas prevalece sobre o sistema", async () => {
  const pagina = await abrirPagina(1440, "reduce");
  try {
    const circular = pagina.getByRole("progressbar", { name: "Carregamento circular" });
    await esperar(circular).toHaveCSS("animation-name", "none");
    const controle = pagina.getByRole("button", { name: /^Animações da interface:/ });
    await controle.press("Enter");
    const menu = pagina.getByRole("menu", { name: "Animações da interface" });
    const sistema = menu.getByRole("menuitemradio", { name: "Sistema" });
    const ativadas = menu.getByRole("menuitemradio", { name: "Ativadas", exact: true });
    await esperar(sistema).toBeChecked();
    await esperar(sistema).toBeFocused();
    await pagina.keyboard.press("ArrowDown");
    await esperar(ativadas).toBeFocused();
    await pagina.keyboard.press("Space");
    await esperar(ativadas).toBeChecked();
    await pagina.keyboard.press("Escape");
    await esperar(controle).toBeFocused();
    await esperar(circular).not.toHaveCSS("animation-name", "none");

    const perfil = pagina.getByRole("button", { name: "Conta de Pessoa sintética" });
    await perfil.click();
    const grupo = pagina.getByRole("group", { name: "Animações da interface" });
    await esperar(
      grupo.getByRole("menuitemradio", { name: "Ativadas", exact: true }),
    ).toBeChecked();
    await grupo.getByRole("menuitemradio", { name: "Sistema" }).click();
    await pagina.keyboard.press("Escape");
    await esperar(circular).toHaveCSS("animation-name", "none");
    await pagina.emulateMedia({ reducedMotion: "no-preference" });
    await esperar(circular).not.toHaveCSS("animation-name", "none");
  } finally {
    await pagina.close();
  }
});

it("sem armazenamento, a escolha funciona até recarregar e preserva a gaveta e o carrossel", async () => {
  const pagina = await navegador.newPage({ viewport: { width: 320, height: 700 } });
  try {
    await pagina.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Armazenamento bloqueado", "SecurityError");
        },
      });
    });
    await pagina.goto(servidor.url);
    const controle = pagina.getByRole("button", { name: /^Animações da interface:/ });
    await controle.click();
    const desativadas = pagina.getByRole("menuitemradio", { name: "Desativadas" });
    await desativadas.click();
    await esperar(desativadas).toBeChecked();
    await pagina.keyboard.press("Escape");
    const abrirGaveta = pagina.getByRole("button", { name: "Abrir gaveta" });
    await abrirGaveta.click();
    const gaveta = pagina.getByRole("dialog", { name: "Gaveta de teste" });
    await esperar(gaveta).toBeVisible();
    expect(maiorDuracao((await estiloDaTransicao(gaveta)).duracao)).toBe(0);
    await pagina.keyboard.press("Escape");
    await esperar(gaveta).toBeHidden();
    await esperar(abrirGaveta).toBeFocused();

    const chamada = pagina.getByRole("group", { name: "Turma atual" });
    const turmas = chamada.getByRole("button", { name: "Turmas", exact: true });
    await turmas.press("Enter");
    await esperar(turmas).toHaveAttribute("aria-expanded", "true");
    const series = chamada.getByRole("group", { name: "Séries", exact: true });
    await esperar(series).toBeVisible();
    expect(
      maiorDuracao((await estiloDaTransicao(chamada.locator(".MuiCollapse-root").first())).duracao),
    ).toBe(0);
    await turmas.press("Escape");
    await esperar(series).toBeHidden();
    await esperar(turmas).toBeFocused();

    const carrossel = pagina.getByRole("group", { name: "Gráficos de teste" });
    await carrossel.press("End");
    const segundo = carrossel.getByRole("article", { name: "2 de 2: Segundo" });
    await esperar(segundo).toBeInViewport();
    await esperar(segundo).toHaveAttribute("aria-current", "true");
    await esperar(carrossel).toBeFocused();
    await pagina.reload();
    await esperar(controle).toHaveAccessibleName("Animações da interface: Sistema");
  } finally {
    await pagina.close();
  }
});

it("Sistema muda o movimento durante a saída do modal sem perder o foco nem bloquear reabertura", async () => {
  const pagina = await abrirPagina(390);
  try {
    const gatilho = pagina.getByRole("button", { name: "Abrir modal" });
    const dialogo = pagina.getByRole("dialog", { name: "Modal de teste" });
    await gatilho.click();
    await esperar(dialogo).toBeVisible();
    const papel = dialogo;
    await esperar(papel).toHaveCSS("opacity", "1");
    await pagina.keyboard.press("Escape");
    // O papel ainda está no DOM, no início da transição de saída.
    expect(await papel.count()).toBe(1);
    await pagina.emulateMedia({ reducedMotion: "reduce" });
    await esperar(dialogo).toBeHidden();
    await esperar(gatilho).toBeFocused();
    await gatilho.press("Enter");
    await esperar(dialogo).toBeVisible();
    expect(maiorDuracao((await estiloDaTransicao(dialogo)).duracao)).toBe(0);
    await pagina.keyboard.press("Escape");
    await esperar(gatilho).toBeFocused();
  } finally {
    await pagina.close();
  }
});

it.each([
  ["desativadas", "desativadas"],
  ["ativadas", "ativadas"],
  ["valor inválido", null],
])("aplica %s pela inicialização com nonce, sem carregar React", async (gravado, atributo) => {
  const pagina = await navegador.newPage();
  try {
    const url = `${servidor.url}?inicio`;
    await pagina.addInitScript((valor) => {
      localStorage.setItem("frequenciapp:animacoes-da-interface", valor);
    }, gravado);
    await pagina.route(url, async (rota) => {
      await rota.fulfill({
        contentType: "text/html",
        headers: { "content-security-policy": "default-src 'none'; script-src 'nonce-dGVzdGU='" },
        body: `<!doctype html><html lang="pt-BR"><head><script nonce="dGVzdGU=">${iniciarAnimacoes}</script></head><body>Início</body></html>`,
      });
    });
    await pagina.goto(url);
    expect(await pagina.locator("html").getAttribute("data-animacoes-interface")).toBe(atributo);
  } finally {
    await pagina.close();
  }
});
