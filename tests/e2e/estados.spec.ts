// Telas de estado: página 404 e aviso de sessão expirada na entrada.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao } from "./helpers/pagina";

test.describe("telas de estado", () => {
  test("a rota desconhecida mostra a página 404 com volta ao início", async ({ page }) => {
    await page.goto("/rota-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByText("Erro 404")).toBeVisible();
    await page.getByRole("link", { name: "Ir para o início" }).click();
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  });

  test("a sessão expirada avisa na tela de entrada", async ({ page, context }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

    // Sem o cookie, a próxima ação recebe 401 e o shell volta para a entrada.
    await context.clearCookies();
    await page.getByRole("button", { name: "Atualizar indicadores" }).click();

    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Sessão expirada")).toBeVisible();
    await expect(page.getByText("Por segurança, entre novamente para continuar.")).toBeVisible();
  });
});
