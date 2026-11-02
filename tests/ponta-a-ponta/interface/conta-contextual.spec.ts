// Verifica o acionador e as opções do menu de conta nos dois temas.
import { expect, test } from "@playwright/test";
import { abrirMenuConta, abrirNavegacao, aguardarHidratacao } from "../helpers/pagina";

for (const tema of ["light", "dark"] as const) {
  test(`itens da conta em ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await abrirNavegacao(page);
    const gaveta = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
    const conta = await abrirMenuConta(page, gaveta);
    await page.mouse.move(389, 843);
    const item = conta.getByRole("menuitem", { name: "Trocar senha", exact: true });
    await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test(`menu de conta em ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(tema));
    await abrirNavegacao(page);
    const gaveta = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
    const gatilho = gaveta.getByRole("button", { name: /^Conta de / });
    await page.mouse.move(389, 843);
    await expect(gatilho).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const caixa = await gatilho.boundingBox();
    expect(caixa?.height).toBeGreaterThanOrEqual(44);
    const conta = await abrirMenuConta(page, gaveta);
    await page.mouse.move(389, 843);
    for (const nome of ["Notificações", "Trocar senha", "Sobre", "Sair da conta"]) {
      const item = conta.getByRole("menuitem", { name: nome, exact: true });
      await expect(item).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      // O popover entra com zoom; aguarda o tamanho final antes de exigir 44 px.
      await expect
        .poll(async () => (await item.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(43.99);
    }
    await expect(conta.getByRole("menuitem", { name: "Notificações" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const senha = conta.getByRole("menuitem", { name: "Trocar senha", exact: true });
    await expect(senha).toBeFocused();
    expect(await senha.evaluate((no) => no.matches(":focus-visible"))).toBe(true);
    expect(await senha.evaluate((no) => getComputedStyle(no).boxShadow)).not.toBe("none");
    await page.keyboard.press("Escape");
    await expect(conta).toBeHidden();
  });
}
