// Frequência com saída por aula: marcação parcial, persistência, histórico e grade.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("frequência com saída por aula", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("registra saída parcial, mantém no histórico e mostra S na grade", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);

    const painel = page.locator('section[aria-label="Registrar frequência"]');
    const pilula = painel.getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    await expect(painel.getByText("E2E Aluno Um")).toBeVisible();

    const linha = painel.locator("ul li").first();
    await linha.locator("button[aria-pressed]").first().click();
    await painel.getByRole("button", { name: /Aulas em que E2E Aluno Um/ }).click();

    const chips = linha.locator("button[aria-pressed]");
    const total = await chips.count();
    await chips.nth(total - 1).click();
    await painel.getByRole("button", { name: "Salvar" }).click();
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    // O dia futuro fica bloqueado na própria navegação de data.
    await expect(painel.getByRole("button", { name: "Dia seguinte" })).toBeDisabled();

    // A marcação sobrevive à recarga.
    await page.reload();
    await aguardarHidratacao(page);
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    await trocarVisao(page, "Histórico", "historico");
    await expect(page.getByText(/saída parcial/).first()).toBeVisible();

    await trocarVisao(page, "Grade", "grade");
    const grade = page.locator('section[aria-label="Grade do mês"]');
    await expect(
      grade.getByRole("img", { name: /presente em parte das aulas/ }).first(),
    ).toBeVisible();
  });
});
