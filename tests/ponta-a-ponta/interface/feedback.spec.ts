// Feedback visual: toasts, trava de toque duplo e tipografia.
import { expect, test } from "@playwright/test";
import { ADMIN_E2E, comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { entrar } from "../helpers/auth";
import { selecionarRelatorio, liberarSabadoSeNecessario, trocarVisao } from "../helpers/pagina";

test.describe("toasts e toque duplo", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await comBanco(async (cliente) => {
      await cliente.query("delete from series where nome = 'E2E Feedback'");
    });
    await limparMassaE2E();
  });

  test("a chamada é salva uma vez mesmo com toque duplo", async ({ page }) => {
    await page.goto("/");
    await trocarVisao(page, "Chamada", "chamada");
    const chamada = page.locator('section[aria-label="Fazer chamada"]');
    const pilula = chamada.getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false))
      await pilula.evaluate((elemento: HTMLElement) => elemento.click());
    await liberarSabadoSeNecessario(chamada);
    const lista = chamada.getByRole("list", { name: "Alunos da chamada", exact: true });
    await lista.getByRole("listitem").first().waitFor();
    await lista.getByRole("listitem").first().locator("button[aria-pressed]").first().click();
    await chamada.getByRole("button", { name: "Salvar" }).click({ clickCount: 2, delay: 30 });
    const confirmar = page.getByRole("alertdialog", { name: /^Salvar chamada\?$/ });
    await expect(confirmar).toBeVisible();
    await confirmar
      .getByRole("button", { name: "Salvar", exact: true })
      .click({ clickCount: 2, delay: 30 });
    const avisos = page.locator(".MuiSnackbar-root .MuiAlert-root").filter({
      hasText: "Chamada salva",
    });
    await expect(avisos).toHaveCount(1);
    await page.waitForTimeout(1200);
    await expect(avisos).toHaveCount(1);
  });

  test("a série é criada uma vez mesmo com toque duplo", async ({ page }) => {
    await page.goto("/");
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("button", { name: "Nova série" }).click();
    await page.getByLabel("Nome").fill("E2E Feedback");
    await page.getByLabel("Ordem de exibição").fill("42");
    await page.getByRole("button", { name: "Criar" }).click({ clickCount: 2, delay: 30 });
    const avisos = page
      .locator(".MuiSnackbar-root .MuiAlert-root")
      .filter({ hasText: "Série criada." });
    await expect(avisos).toHaveCount(1);
    await expect(page.getByRole("row").filter({ hasText: "E2E Feedback" })).toHaveCount(1);
  });

  test("a exportação CSV avisa com um toast", async ({ page }) => {
    await page.goto("/");
    const painel = await selecionarRelatorio(page, "Grade");
    const pilula = painel.getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false))
      await pilula.evaluate((elemento: HTMLElement) => elemento.click());
    await painel.getByRole("table").first().waitFor();
    await page.getByRole("button", { name: "Baixar planilha (CSV)" }).click();
    const downloadDialogo = page.getByRole("dialog", { name: "Preparar download" });
    await downloadDialogo.getByLabel("Arquivo original sem senha").check();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadDialogo.getByRole("button", { name: "Baixar arquivo original" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await expect(page.getByText("Planilha baixada.")).toBeVisible();
  });
});

test.describe("entrada confirmada", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("mostra o toast de entrada", async ({ page }) => {
    await entrar(page, ADMIN_E2E.email, ADMIN_E2E.senha);
    await expect(page.getByText("Entrada confirmada.")).toBeVisible();
  });
});
