// A Gestão concentra as planilhas operacionais e mantém o acesso ao FrequenciBI.
import { expect, test } from "@playwright/test";
import { abrirNavegacao, aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

test("retira o painel externo da Gestão e mantém o FrequenciBI na navegação", async ({ page }) => {
  const pedidos: string[] = [];
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname.startsWith("/api/indicadores")) pedidos.push(pedido.url());
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const planilhas = page.locator("#config-grupo-planilhas");
  await expect(planilhas).toBeVisible();
  await expect(planilhas.getByRole("button", { name: /Fila de envios automáticos/ })).toBeVisible();
  await expect(planilhas.locator('[data-secao="indicadores"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Painel externo", exact: true })).toHaveCount(0);
  expect(pedidos).toHaveLength(0);
  const navegacao = await abrirNavegacao(page);
  await expect(
    navegacao.getByRole("link", { name: "FrequenciBI, nova aba", exact: true }),
  ).toHaveAttribute("href", "/bi");
});
