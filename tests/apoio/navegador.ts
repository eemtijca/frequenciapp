// Navegador compartilhado pelos testes de componente em Chromium.
import { chromium, type Browser, type Page } from "@playwright/test";

export function abrirChromium(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

/** Garante que o esquema de cores do MUI foi aplicado e a pintura terminou. */
export async function aguardarTema(page: Page, tema: "light" | "dark"): Promise<void> {
  await page.evaluate((valor) => {
    document.documentElement.setAttribute("data-mui-color-scheme", valor);
  }, tema);
  await page.waitForFunction((valor) => {
    const raiz = document.documentElement;
    if (raiz.getAttribute("data-mui-color-scheme") !== valor) return false;
    return getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)";
  }, tema);
  await page.waitForTimeout(150);
}
