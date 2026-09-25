// Utilidades comuns dos testes de ponta a ponta.
import { expect, type Page } from "@playwright/test";

/**
 * Aguarda a hidratação do React. O HTML do servidor pode estar visível antes
 * de os manipuladores de evento existirem, e um clique nesse intervalo se perde.
 * O seletor pode apontar para o elemento que será clicado em seguida.
 */
export async function aguardarHidratacao(page: Page, seletor = "nav button"): Promise<void> {
  await page.waitForFunction((alvoTexto) => {
    const alvo = document.querySelector(alvoTexto) ?? document.querySelector("button");
    if (!alvo) return false;
    return Object.keys(alvo).some((chave) => chave.startsWith("__reactProps"));
  }, seletor);
}

/**
 * Move o paginador para um painel. Dispara o evento de rolagem de propósito:
 * a primeira rolagem pode acontecer antes de o React registrar o ouvinte.
 */
export async function rolarPager(page: Page, indice: number): Promise<void> {
  await page.locator("[data-pager=principal]").evaluate((elemento, alvo) => {
    elemento.scrollTo({ left: elemento.clientWidth * alvo });
    elemento.dispatchEvent(new Event("scroll"));
  }, indice);
}

/**
 * Troca de visão pela navegação. Em desenvolvimento o Fast Refresh pode trocar
 * os nós durante a hidratação, então o clique é repetido até o painel mudar.
 */
export async function trocarVisao(page: Page, rotulo: string, visao: string): Promise<void> {
  const botao = page
    .getByRole("navigation", { name: "Seções do aplicativo" })
    .getByRole("button", { name: rotulo });
  await expect
    .poll(
      async () => {
        await botao.click({ force: true });
        return page.locator("main").getAttribute("data-visao");
      },
      { timeout: 20_000 },
    )
    .toBe(visao);
}
