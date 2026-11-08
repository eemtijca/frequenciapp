// Confere o contorno de foco em diálogos, menus e seletores reais do aplicativo.
import { expect, test, type Page } from "@playwright/test";
import { abrirDiaSeResumo, abrirMenuConta, aguardarHidratacao } from "../helpers/pagina";

async function indicadorDeFoco(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const alvo = document.activeElement;
    if (!(alvo instanceof Element)) return false;
    const estilo = getComputedStyle(alvo);
    return (
      (estilo.outlineStyle !== "none" && estilo.outlineWidth !== "0px") ||
      estilo.boxShadow !== "none"
    );
  });
}

test.describe("foco em componentes reais", () => {
  test("menu da conta separa ponteiro de teclado", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/");
    await aguardarHidratacao(page);
    const menu = await abrirMenuConta(page);
    const primeiro = menu.getByRole("menuitem", { name: "Notificações", exact: true });
    await expect(primeiro).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(false);

    await page.keyboard.press("ArrowDown");
    const segundo = menu.getByRole("menuitem", { name: "Trocar senha", exact: true });
    await expect(segundo).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(true);

    await page.keyboard.press("Escape");
    const gatilho = page.getByRole("button", { name: /^Conta de / }).last();
    await expect(gatilho).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(true);
  });

  test("calendário do Painel não deixa contorno no clique e mantém no teclado", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await abrirDiaSeResumo(page);
    const gatilho = page.locator("#dia-painel");
    await gatilho.click();
    const calendario = page.getByRole("dialog", { name: /Dia do painel/ });
    await expect(calendario).toBeVisible();
    expect(await indicadorDeFoco(page)).toBe(false);

    await page.keyboard.press("ArrowRight");
    expect(await indicadorDeFoco(page)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(gatilho).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(true);
  });
});

test.describe("foco no diálogo da entrada", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("abre e fecha por ponteiro sem contorno e por teclado com contorno", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/");
    await aguardarHidratacao(page);
    const sobre = page.getByRole("button", { name: "Sobre", exact: true });

    await sobre.click();
    const dialogo = page.getByRole("dialog", { name: "Sobre o FrequenciApp" });
    await expect(dialogo).toBeVisible();
    expect(await dialogo.evaluate((elemento) => elemento.contains(document.activeElement))).toBe(
      true,
    );
    expect(await indicadorDeFoco(page)).toBe(false);

    await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(sobre).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(false);

    await sobre.focus();
    await page.keyboard.press("Enter");
    await expect(dialogo).toBeVisible();
    expect(await dialogo.evaluate((elemento) => elemento.contains(document.activeElement))).toBe(
      true,
    );
    expect(await indicadorDeFoco(page)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(sobre).toBeFocused();
    expect(await indicadorDeFoco(page)).toBe(true);
  });
});
