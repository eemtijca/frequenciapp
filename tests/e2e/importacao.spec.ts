// Importação das relações de turma na Gestão: prévia com a contagem, aplicação
// e a nova ordem na Chamada, com a massa E2E.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const TRAVESSAO = String.fromCharCode(0x2014);

test.describe("importação das relações de turma", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("confere a prévia, aplica e a Chamada segue a nova ordem", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Alunos" }).click();
    await page.locator("#painel-alunos").getByRole("button", { name: "Importar relação" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    await dialogo
      .getByLabel("Relações")
      .fill(
        [
          `RELAÇÃO ATUAL ${TRAVESSAO} E2E A`,
          "Total de estudantes: 2",
          `E2E ALUNO DOIS ${TRAVESSAO} Turma original: E2E A`,
          `E2E ALUNO UM ${TRAVESSAO} Turma original: E2E A`,
        ].join("\n"),
      );
    await dialogo.getByRole("button", { name: "Conferir" }).click();
    await expect(dialogo.getByLabel("Alunos por turma")).toContainText("2 alunos");
    await dialogo.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Relação importada.")).toBeVisible();

    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    // Com uma turma só, a Chamada já abre nela, sem o seletor.
    const turma = secao.getByRole("button", { name: /E2E Ano A/ }).first();
    if (await turma.isVisible().catch(() => false)) await turma.click();
    const nomes = secao.getByRole("button", { name: /^E2E Aluno (Um|Dois)/ });
    await expect(nomes.first()).toHaveAccessibleName(/^E2E Aluno Dois/);
  });
});
