// Utilidades comuns dos testes de ponta a ponta.
import type { Page } from "@playwright/test";

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
