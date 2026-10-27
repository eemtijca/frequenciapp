// Confirmações da Gestão de alunos: desativar, reativar e aplicar origem em massa.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

async function abrirAlunos(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos" }).click();
}

test("confirma desativar e reativar aluno", async ({ page }) => {
  await abrirAlunos(page);
  await page.locator("#busca-gestao-aluno").fill("E2E Aluno Um");
  await page.getByRole("button", { name: "Desativar E2E Aluno Um", exact: true }).click();

  const desativar = page.getByRole("alertdialog", { name: "Desativar E2E Aluno Um?" });
  await expect(desativar).toBeVisible();
  await desativar.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(desativar).toBeHidden();
  await expect(page.getByRole("button", { name: "Desativar E2E Aluno Um" })).toBeVisible();

  await page.getByRole("button", { name: "Desativar E2E Aluno Um", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Desativar E2E Aluno Um?" })
    .getByRole("button", { name: "Desativar", exact: true })
    .click();
  await expect(page.getByText("Aluno desativado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reativar E2E Aluno Um" })).toBeVisible();

  await page.getByRole("button", { name: "Reativar E2E Aluno Um", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Reativar E2E Aluno Um?" })
    .getByRole("button", { name: "Reativar", exact: true })
    .click();
  await expect(page.getByText("Aluno reativado.", { exact: true })).toBeVisible();
});

test("confirma a aplicação de origem em massa", async ({ page }) => {
  await abrirAlunos(page);
  await page.getByRole("button", { name: "Definir origem", exact: true }).click();
  await page.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await page.locator("#origem-em-massa").click();
  await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
  await page.getByRole("button", { name: "Aplicar origem", exact: true }).click();

  const dialogo = page.getByRole("alertdialog", { name: "Aplicar origem em massa?" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("2 alunos selecionados");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(dialogo).toBeHidden();

  await page.getByRole("button", { name: "Aplicar origem", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Aplicar origem em massa?" })
    .getByRole("button", { name: "Aplicar origem", exact: true })
    .click();
  await expect(page.getByText(/Origem de 2 alunos atualizada\./)).toBeVisible();
});
