// Catálogo de quem libera a saída: manutenção na Gestão e uso no registro
// antecipado, com o nome novo aparecendo na lista do dia.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

async function abrirCatalogo(page: Page) {
  const secao = page.locator('[data-secao="config-liberadores"]');
  const regiao = secao.getByRole("region", { name: "Quem libera as saídas" });
  if (!(await regiao.isVisible())) {
    await secao.getByRole("button", { name: /Quem libera as saídas/ }).click();
  }
  await expect(regiao).toBeVisible();
  return secao;
}

test.describe("quem libera as saídas", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("administração mantém o catálogo e o formulário usa o nome novo", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();

    const secao = await abrirCatalogo(page);
    await page.locator("#liberador-codigo").fill("E2E1");
    await page.locator("#liberador-rotulo").fill("E2E Porteiro");
    await secao.getByRole("button", { name: "Adicionar" }).click();
    await expect(secao.getByText("E2E Porteiro")).toBeVisible();

    await trocarVisao(page, "Saídas e entradas", "saidas");
    await page.locator("#saida-turma").click();
    await page.getByRole("option", { name: "E2E Ano A" }).click();
    await page.locator("#saida-aluno").click();
    await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
    await page.locator("#saida-momento").click();
    await page.getByRole("option", { name: "1ª aula" }).click();
    await page.locator("#saida-justificativa").click();
    await page.getByRole("option", { name: "D · Doente" }).click();
    await page.locator("#saida-responsavel").click();
    await page.getByRole("option", { name: "E2E Porteiro" }).click();
    await page.getByRole("button", { name: "Registrar saída" }).click();
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    await expect(page.getByText("Liberado por E2E Porteiro").first()).toBeVisible();

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    const catalogo = await abrirCatalogo(page);
    await catalogo.getByRole("button", { name: "Excluir E2E1" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await expect(catalogo.getByText(/em uso em 1 saída/)).toBeVisible();
  });
});
