// Fumaça do shell: troca de visão pela navegação inferior e alternância de tema.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("navegação", () => {
  test("troca de visão pela navegação inferior", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Frequência diária" })).toBeVisible();
    await trocarVisao(page, "Histórico", "historico");
    await expect(page.getByRole("heading", { name: "Histórico" })).toBeVisible();
    await trocarVisao(page, "Originais", "originais");
    await expect(page.getByRole("heading", { name: "Originais" })).toBeVisible();
    await trocarVisao(page, "Gestão", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão" })).toBeVisible();
  });

  test("alterna o tema entre claro e escuro", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Frequência diária" })).toBeVisible();
    const inicioEscuro = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
    const botao = page.getByRole("button", {
      name: inicioEscuro ? "Ativar tema claro" : "Ativar tema escuro",
    });
    // O clique pode chegar antes da hidratação; repetir até o tema mudar resolve.
    await expect
      .poll(
        async () => {
          await botao.click({ force: true });
          return page.locator("html").getAttribute("class");
        },
        { timeout: 15_000 },
      )
      .toContain(inicioEscuro ? "light" : "dark");
  });
});
