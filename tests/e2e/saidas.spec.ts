// Saída antecipada durante a aula: o texto livre de até 100 caracteres é
// opcional e aparece na lista do dia.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("saída durante a aula", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("registra com texto opcional e mostra na lista do dia", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas", "saidas");

    await page.locator("#saida-turma").click();
    await page.getByRole("option", { name: "E2E Ano A" }).click();
    await page.locator("#saida-aluno").click();
    await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
    await page.locator("#saida-momento").click();
    await page.getByRole("option", { name: "1ª aula" }).click();
    await page.locator("#saida-justificativa").click();
    await page.getByRole("option", { name: "D · Doente" }).click();

    const campoTexto = page.locator("#saida-texto");
    await expect(campoTexto).toBeVisible();
    await campoTexto.fill("Saiu para a coordenação");
    await expect(page.getByText("23/100")).toBeVisible();
    await page.getByRole("button", { name: "Registrar saída" }).click();
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    await page.getByRole("button", { name: /E2E Ano A.*aluno/ }).click();
    await expect(page.getByText("Saiu para a coordenação").first()).toBeVisible();
  });
});
