// Saída antecipada: registro durante a aula com texto opcional, justificativa
// escrita no intervalo e o nome de quem liberou vindo do catálogo da Gestão.
import { expect, test } from "@playwright/test";
import { criarLiberadoresE2E, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("saída durante a aula", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
    await criarLiberadoresE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("registra com texto opcional e mostra na lista do dia", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
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
    await page.getByRole("option", { name: "Diretor E2E" }).click();

    const campoTexto = page.locator("#saida-texto");
    await expect(campoTexto).toBeVisible();
    await campoTexto.fill("Saiu para a coordenação");
    await expect(page.getByText("23/100")).toBeVisible();
    await page.getByRole("button", { name: "Registrar saída" }).click();
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Saiu para a coordenação").first()).toBeVisible();
    await expect(lista.getByText("Liberado por Diretor E2E").first()).toBeVisible();
    // O resumo por turma e o relatório por aluno saíram da aba; o relatório fica em Relatórios.
    await expect(page.getByRole("heading", { name: "Saídas por turma" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Relatório por aluno" })).toHaveCount(0);
  });

  test("registra a justificativa escrita e a coordenadora que liberou", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e entradas", "saidas");

    await page.locator("#saida-turma").click();
    await page.getByRole("option", { name: "E2E Ano A" }).click();
    await page.locator("#saida-aluno").click();
    await page.getByRole("option", { name: /E2E Aluno Dois/ }).click();
    await page.locator("#saida-momento").click();
    await page.getByRole("option", { name: "1º intervalo" }).click();
    await page.getByRole("radio", { name: "Escrever", exact: true }).click();
    await page.locator("#saida-texto").fill("Foi buscar o irmão");
    await page.locator("#saida-responsavel").click();
    await page.getByRole("option", { name: "Coordenadora E2E" }).click();
    await page.getByRole("button", { name: "Registrar saída" }).click();
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Foi buscar o irmão").first()).toBeVisible();
    await expect(lista.getByText("Liberado por Coordenadora E2E").first()).toBeVisible();
  });

  test("remove uma saída pela lista do dia para corrigir o registro", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e entradas", "saidas");
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Foi buscar o irmão")).toBeVisible();
    await lista.getByRole("button", { name: "Remover saída de E2E Aluno Dois" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expect(page.getByText("Saída removida.")).toBeVisible();
    await expect(lista.getByText("Foi buscar o irmão")).toHaveCount(0);
    await expect(lista.getByText("Saiu para a coordenação").first()).toBeVisible();
  });
});
