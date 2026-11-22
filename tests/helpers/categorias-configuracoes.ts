// Percorre os níveis da gaveta com os mesmos controles no desktop e no celular.
import { expect, type Page } from "@playwright/test";

export const menuMovel = (page: Page) =>
  page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });

export async function exporNavegacao(page: Page) {
  const nav = page.getByRole("navigation", { name: "Seções do aplicativo", exact: true });
  const abrir = page.getByRole("button", { name: "Abrir menu", exact: true });
  await expect(nav.or(abrir).first()).toBeVisible();
  if (!(await nav.isVisible())) await abrir.click();
  await expect(nav).toBeVisible();
  return nav;
}

export async function fecharNavegacaoMovel(page: Page) {
  const modal = menuMovel(page);
  if (await modal.isVisible())
    await modal.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await expect(modal).toBeHidden();
}

export async function exporNivelGestao(page: Page) {
  const nav = await exporNavegacao(page);
  const voltar = nav.getByRole("button", { name: "Voltar para Gestão", exact: true });
  if (await voltar.isVisible()) await voltar.click();
  const gestao = nav.getByRole("button", { name: /^Gestão(?: Alterações não salvas)?$/ });
  if (await gestao.isVisible()) await gestao.click();
  return nav;
}

export async function selecionarCadastroGestao(page: Page, rotulo: string) {
  const nav = await exporNivelGestao(page);
  await nav.getByRole("button", { name: rotulo, exact: true }).click();
  await expect(menuMovel(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: rotulo, level: 1, exact: true })).toBeVisible();
}

export async function exporConfiguracoes(page: Page) {
  const nav = await exporNavegacao(page);
  const voltar = nav.getByRole("button", { name: "Voltar para Gestão", exact: true });
  if (!(await voltar.isVisible())) {
    await exporNivelGestao(page);
    await nav.getByRole("button", { name: /^Configurações(?: Alterações não salvas)?$/ }).click();
  }
  await expect(voltar).toBeVisible();
  return nav;
}

export async function abrirConfiguracoesDaGestao(page: Page) {
  const titulo = page.getByRole("heading", { name: "Configurações", level: 1, exact: true });
  if (!(await titulo.isVisible())) {
    await exporConfiguracoes(page);
    await fecharNavegacaoMovel(page);
  }
  await expect(titulo).toBeVisible();
}

export async function conferirCategoriaConfiguracoes(page: Page, categoria: string) {
  await expect(page.getByRole("heading", { name: categoria, level: 2, exact: true })).toBeVisible();
}

export async function selecionarCategoriaConfiguracoes(
  page: Page,
  categoria: string,
  secao?: string,
) {
  const nav = await exporConfiguracoes(page);
  const grupo = nav.getByRole("button", { name: categoria, exact: true });
  if ((await grupo.getAttribute("aria-expanded")) !== null) {
    if ((await grupo.getAttribute("aria-expanded")) !== "true") await grupo.click();
    const lista = nav.getByRole("list", { name: categoria, exact: true });
    const atual = lista.locator('button[aria-current="page"]');
    const opcao = secao
      ? lista.getByRole("button", { name: secao, exact: true })
      : (await atual.count())
        ? atual
        : lista.getByRole("button").first();
    await opcao.click();
  } else {
    await grupo.click();
  }
  await expect(menuMovel(page)).toBeHidden();
  await conferirCategoriaConfiguracoes(page, categoria);
}
