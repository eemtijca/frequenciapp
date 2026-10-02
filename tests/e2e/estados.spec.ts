// Telas de estado: página 404 e aviso de sessão expirada na entrada.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao } from "./helpers/pagina";

test.describe("telas de estado", () => {
  // A consulta interceptada deve passar pelo navegador; o worker tem suíte própria.
  test.use({ serviceWorkers: "block" });

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

    // Expira somente quando a consulta já foi iniciada: o cookie só é apagado
    // dentro do tratamento da própria requisição.
    await page.route("**/api/frequencias?mes=*", async (rota) => {
      await context.clearCookies();
      const resposta = await rota.fetch({
        headers: { ...rota.request().headers(), cookie: "" },
      });
      expect(resposta.status()).toBe(401);
      await rota.fulfill({ response: resposta });
    });
    let expirou = false;
    page.on("response", (resposta) => {
      if (new URL(resposta.url()).pathname === "/api/frequencias" && resposta.status() === 401) {
        expirou = true;
      }
    });
    // O painel se atualiza sozinho; voltar para a aba do navegador dispara a consulta.
    // O evento se repete até o painel registrar o ouvinte, sem depender de espera fixa.
    await expect
      .poll(
        async () => {
          await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
          return expirou;
        },
        { timeout: 15_000, intervals: [500] },
      )
      .toBe(true);

    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Sessão expirada")).toBeVisible();
    await expect(page.getByText("Por segurança, entre novamente para continuar.")).toBeVisible();
  });
});
