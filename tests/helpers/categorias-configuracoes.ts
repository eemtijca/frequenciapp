// Acessa a mesma categoria pelo seletor compacto ou pela lista do desktop.
import { expect, type Page } from "@playwright/test";

export async function abrirConfiguracoesDaGestao(page: Page) {
  const titulo = page.getByRole("heading", { name: "Configurações", level: 1, exact: true });
  if (!(await titulo.isVisible())) {
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  }
  await expect(titulo).toBeVisible();
}

function navegacao(page: Page) {
  return page.getByRole("navigation", { name: "Categorias de configurações", exact: true });
}

export async function conferirCategoriaConfiguracoes(page: Page, categoria: string) {
  const nav = navegacao(page);
  await expect(page.getByRole("heading", { name: categoria, level: 2, exact: true })).toBeVisible();
  const seletor = nav.getByRole("combobox", { name: /^Categoria/ });
  if (await seletor.isVisible()) {
    await expect(seletor).toHaveText(categoria);
  } else {
    await expect(nav.getByRole("button", { name: categoria, exact: true })).toHaveAttribute(
      "aria-current",
      "true",
    );
  }
}

export async function selecionarCategoriaConfiguracoes(page: Page, categoria: string) {
  const nav = navegacao(page);
  await expect(nav).toBeVisible();
  const seletor = nav.getByRole("combobox", { name: /^Categoria/ });
  if (await seletor.isVisible()) {
    await seletor.click();
    await page.getByRole("option", { name: categoria, exact: true }).click();
  } else {
    await nav.getByRole("button", { name: categoria, exact: true }).click();
  }
  await conferirCategoriaConfiguracoes(page, categoria);
}
