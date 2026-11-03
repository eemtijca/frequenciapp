// Verifica os comandos do cabeçalho sem blocos redundantes.
import { expect, test } from "@playwright/test";
import { abrirNavegacao, aguardarHidratacao } from "../helpers/pagina";

for (const tema of ["light", "dark"] as const) {
  test(`atualização lateral no desktop em ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.mouse.move(1279, 799);
    const botao = page.locator("aside").getByRole("button", { name: "Atualizar tela" });
    await expect(botao).toBeVisible();
    await expect(botao).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test(`comandos do cabeçalho em ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(tema));
    await page.mouse.move(389, 843);
    const cabecalho = page.getByRole("banner");
    for (const nome of [
      /^Abrir menu$/,
      /^Atualizar tela$/,
      /^Tema: .* Alterar tema$/,
      /^Configurar notificações$/,
    ]) {
      const botao = cabecalho.getByRole("button", { name: nome });
      await expect(botao).toBeVisible();
      await expect(botao).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const caixa = await botao.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(44);
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
    }
    await abrirNavegacao(page);
    const fechar = page.getByRole("button", { name: "Fechar menu" });
    await page.mouse.move(389, 843);
    await expect(fechar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await fechar.click();
    const abrir = cabecalho.getByRole("button", { name: "Abrir menu" });
    await expect(abrir).toBeFocused();
    const atualizar = cabecalho.getByRole("button", { name: "Atualizar tela" });
    await expect(atualizar).toBeEnabled();
    await page.keyboard.press("Tab");
    await expect(atualizar).toBeFocused();
    expect(await atualizar.evaluate((no) => no.matches(":focus-visible"))).toBe(true);
    expect(
      await atualizar.evaluate((no) => {
        const estilo = getComputedStyle(no);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await cabecalho.getByRole("button", { name: /^Tema: .* Alterar tema$/ }).click();
    await expect(page.getByRole("radiogroup", { name: "Tema do aplicativo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await cabecalho.getByRole("button", { name: "Configurar notificações" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}
