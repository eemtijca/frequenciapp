// Exercita no shell a precedência da escolha no perfil e o foco sem movimento.
import { expect, test } from "@playwright/test";
import { abrirMenuConta, abrirNavegacao, aguardarHidratacao } from "../helpers/pagina";

test("aplica a preferência do perfil na gaveta sem recarregar e lembra a escolha", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await aguardarHidratacao(page);

  const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
  const abrir = page.getByRole("button", { name: "Abrir menu", exact: true });
  const fechar = menu.getByRole("button", { name: "Fechar menu", exact: true });
  async function escolher(nome: "Ativadas" | "Desativadas") {
    const conta = await abrirMenuConta(page, menu);
    const grupo = conta.getByRole("group", { name: "Animações da interface" });
    const opcao = grupo.getByRole("menuitemradio", { name: nome, exact: true });
    await opcao.press("Enter");
    await expect(opcao).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(conta).toBeHidden();
    await fechar.press("Enter");
    await expect(abrir).toBeFocused();
  }

  await abrirNavegacao(page);
  await expect(menu).toHaveCSS("transition-duration", "0s");
  await escolher("Ativadas");
  const nav = await abrirNavegacao(page);
  await expect(menu).not.toHaveCSS("transition-duration", "0s");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await escolher("Desativadas");

  await abrirNavegacao(page);
  await expect(menu).toHaveCSS("transition-duration", "0s");
  await nav.getByRole("button", { name: "Chamada", exact: true }).press("Enter");
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Chamada", level: 1, exact: true, includeHidden: true }),
  ).toBeFocused();

  await page.reload();
  await aguardarHidratacao(page);
  await abrirNavegacao(page);
  await expect(menu).toHaveCSS("transition-duration", "0s");
  const conta = await abrirMenuConta(page, menu);
  await expect(
    conta.getByRole("menuitemradio", { name: "Desativadas", exact: true }),
  ).toBeChecked();
});
