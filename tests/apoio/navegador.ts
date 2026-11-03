// Navegador compartilhado pelos testes de componente em Chromium.
import { chromium, type Browser, type Page } from "@playwright/test";

export function abrirChromium(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** Garante que a classe do tema foi aplicada e a pintura terminou. */
export async function aguardarTema(page: Page, tema: "light" | "dark"): Promise<void> {
  await page.evaluate((valor) => {
    document.documentElement.className = valor;
  }, tema);
  await page.waitForFunction((valor) => {
    const raiz = document.documentElement;
    if (!raiz.classList.contains(valor)) return false;
    return getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)";
  }, tema);
  await page.waitForTimeout(150);
}
