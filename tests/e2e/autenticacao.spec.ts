// Entrada e saída: mensagem clara para credenciais erradas e sessão válida.
import { expect, test } from "@playwright/test";
import { ADMIN_E2E } from "./helpers/banco";
import { aguardarHidratacao } from "./helpers/pagina";

// Sem estado de sessão: este arquivo testa a tela de entrada.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("autenticação", () => {
  test("recusa credenciais erradas com mensagem clara", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha").fill("senha-errada-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  });

  test("entra na frequência e sai da conta", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByLabel("E-mail").fill(ADMIN_E2E.email);
    await page.getByLabel("Senha").fill(ADMIN_E2E.senha);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Frequência diária" })).toBeVisible();
    await aguardarHidratacao(page, 'button[aria-label="Sair da conta"]');
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible({ timeout: 25_000 });
  });
});
