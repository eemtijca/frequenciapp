// Catálogo de quem libera a saída: manutenção na Gestão e uso no registro
// antecipado, com o nome novo aparecendo na lista do dia.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, registrarSaida, trocarVisao } from "../helpers/pagina";
import {
  selecionarAcaoConfiguracoes,
  descartarConfiguracoes,
  enviarRascunhoConfiguracoes,
  salvarConfiguracoes,
} from "../helpers/configuracoes";

async function abrirCatalogo(page: Page) {
  await selecionarAcaoConfiguracoes(page, "Escola", "Cadastros");
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
    test.setTimeout(90_000);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();

    const secao = await abrirCatalogo(page);
    await secao.getByText("Adicionar responsável", { exact: true }).click();
    await page.locator("#liberador-codigo").fill("E2E1");
    await page.locator("#liberador-rotulo").fill("E2E Porteiro");
    await secao.getByRole("button", { name: "Adicionar" }).click();
    await expect(secao.getByText("E2E Porteiro")).toBeVisible();
    // O aviso flutua sobre o rodapé e pausa a própria saída enquanto o ponteiro o cobre.
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await salvarConfiguracoes(page);

    await trocarVisao(page, "Saídas e Entradas", "saidas");
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
    await registrarSaida(page);
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    await expect(page.getByText("Liberado por E2E Porteiro").first()).toBeVisible();

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    const catalogo = await abrirCatalogo(page);
    await catalogo.getByRole("button", { name: "Excluir E2E1" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    const resposta = await enviarRascunhoConfiguracoes(page);
    expect(resposta.status()).toBe(409);
    const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?" });
    await expect(revisao.getByText("Responsável em uso")).toBeVisible();
    await expect(revisao.getByText(/em uso em 1 saída/)).toBeVisible();
    await expect(revisao.getByText(/A chamada foi salva em outro aparelho/)).toHaveCount(0);
    await expect(revisao.getByText(/Confira a internet/)).toHaveCount(0);
    await revisao.getByRole("button", { name: "Continuar revisando" }).click();
    await descartarConfiguracoes(page);
  });
});
