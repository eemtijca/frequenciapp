// Responsividade: navegação inferior no celular, barra lateral no desktop e
// diálogo como folha inferior em telas pequenas.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("responsividade", () => {
  test("no celular usa a navegação inferior e a folha inferior", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("button", { name: "Nova série" }).click();
    const caixa = await page.locator('[data-slot="dialog-content"]').boundingBox();
    expect(caixa).not.toBeNull();
    // A folha inferior encosta na base da tela.
    expect((caixa?.y ?? 0) + (caixa?.height ?? 0)).toBeGreaterThan(780);
  });

  test("no desktop usa a barra lateral", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();
  });

  test("as metades do login são simétricas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FrequenciApp" })).toBeVisible();
    const aside = await page.locator("aside").boundingBox();
    const principal = await page.locator("main").boundingBox();
    expect(Math.abs((aside?.width ?? 0) - (principal?.width ?? 0))).toBeLessThanOrEqual(1);
  });
});
