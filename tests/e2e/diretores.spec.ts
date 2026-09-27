// Diretores de turma na Gestão: cadastro com turma, palavra-chave mostrada
// uma única vez, revogação com motivo e parâmetros de acesso.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E, restaurarParametrosAcessoE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("diretores de turma na Gestão", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
    await restaurarParametrosAcessoE2E();
  });

  test("cadastra, gera a palavra-chave uma vez e revoga com motivo", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Diretores/ }).click();

    await page
      .getByRole("button", { name: /Novo diretor|Cadastrar diretor/ })
      .first()
      .click();
    const formulario = page.getByRole("dialog");
    await formulario.getByLabel("Nome").fill("E2E Diretora");
    await formulario.getByLabel("Identificador de acesso").fill("e2e@errado");
    await expect(formulario.getByText(/Use letras minúsculas/)).toBeVisible();
    await formulario.getByLabel("Identificador de acesso").fill("e2e-diretora");
    await formulario.getByLabel("E2E Ano A").check();
    await formulario.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Diretor cadastrado.")).toBeVisible();

    const item = page.locator('[data-diretor="e2e-diretora"]');
    await expect(item.getByText("Sem palavra-chave")).toBeVisible();
    await expect(item.getByText("E2E Ano A")).toBeVisible();

    await item.getByRole("button", { name: "Gerar palavra-chave" }).click();
    const palavra = page.locator("[data-palavra-chave]");
    await expect(palavra).toHaveText(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole("button", { name: "Já entreguei" }).click();
    await expect(palavra).toHaveCount(0);
    await expect(item.getByText("Aguardando primeiro acesso")).toBeVisible();

    await item.getByRole("button", { name: "Revogar a palavra-chave de E2E Diretora" }).click();
    const revogar = page.getByRole("alertdialog");
    await expect(revogar.getByRole("button", { name: "Revogar" })).toBeDisabled();
    await revogar.getByLabel("Motivo").fill("Teste de ponta a ponta");
    await revogar.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText("Palavra-chave revogada.")).toBeVisible();
    await expect(item.getByText("Revogada", { exact: true })).toBeVisible();
    await expect(item.getByText(/revogada: Teste de ponta a ponta/)).toBeVisible();
  });

  test("ajusta os parâmetros de acesso em Configurações", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Config/ }).click();
    const secao = page.locator('[data-secao="config-acesso-diretores"]');
    await secao.getByRole("button", { name: /Acesso dos diretores/ }).click();
    const validade = secao.getByLabel("Validade da palavra-chave");
    await expect(validade).toHaveValue("90");
    await validade.fill("30");
    await expect(secao.getByLabel("Faltas", { exact: true })).toBeDisabled();
    await secao.getByRole("button", { name: "Salvar parâmetros" }).click();
    await expect(page.getByText("Parâmetros de acesso salvos.")).toBeVisible();
    await expect(secao.getByText("Palavra por 30 dias")).toBeVisible();
  });
});
