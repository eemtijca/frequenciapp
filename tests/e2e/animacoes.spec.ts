// Preferência de animações por dispositivo: interruptor, persistência e efeito.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao } from "./helpers/pagina";

test.describe("preferência de animações", () => {
  test("no celular desliga pelo menu de perfil e persiste", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: /Conta de/ }).click();
    const interruptor = page.getByRole("switch", { name: "Animações" });
    await expect(interruptor).toBeVisible();
    await interruptor.click();
    await expect(page.locator("html")).toHaveAttribute("data-animacoes", "desligadas");

    await page.reload();
    await aguardarHidratacao(page);
    await expect(page.locator("html")).toHaveAttribute("data-animacoes", "desligadas");
    const duracao = await page
      .getByRole("navigation", { name: "Seções do aplicativo" })
      .getByRole("button")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).transitionDuration);
    const emSegundos = duracao.endsWith("ms")
      ? Number(duracao.replace("ms", "")) / 1000
      : Number(duracao.replace("s", ""));
    expect(emSegundos).toBeLessThanOrEqual(0.0001);

    await page.getByRole("button", { name: /Conta de/ }).click();
    await page.getByRole("switch", { name: "Animações" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-animacoes", "ligadas");
  });

  test("no desktop o interruptor fica na barra lateral", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("switch", { name: "Animações" })).toBeVisible();
  });
});
