// Relação de alunos em CSV na Gestão: botões inteiros no celular, arquivo fora
// do padrão sinalizado, importação com prévia e exportação no mesmo schema.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const CABECALHO = "turma_atual;ordem;nome;turma_original";

async function abrirAlunos(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos" }).click();
  return page.locator("#painel-alunos");
}

test.describe("relação de alunos em CSV", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("no celular, as ações da aba cabem na tela sem cortar o texto", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const painel = await abrirAlunos(page);
    for (const nome of ["Importar relação", "Exportar relação", "Definir origem", "Novo aluno"]) {
      const botao = painel.getByRole("button", { name: nome });
      await expect(botao).toBeInViewport({ ratio: 1 });
      const caixa = await botao.boundingBox();
      expect(caixa?.height ?? 0).toBeLessThanOrEqual(48);
    }
  });

  test("sinaliza o arquivo fora do padrão antes de conferir", async ({ page }) => {
    const painel = await abrirAlunos(page);
    await painel.getByRole("button", { name: "Importar relação" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Conteúdo do CSV").fill("nome;turma\nE2E Aluno Um;E2E Ano A");
    await expect(dialogo.getByRole("alert")).toContainText("fora do padrão");
    await expect(dialogo.getByRole("alert")).toContainText(CABECALHO);
    await expect(dialogo.getByRole("button", { name: "Conferir" })).toBeDisabled();
  });

  test("importa o CSV, a Chamada segue a nova ordem e a exportação sai no mesmo schema", async ({
    page,
  }) => {
    const painel = await abrirAlunos(page);
    await painel.getByRole("button", { name: "Importar relação" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    await dialogo
      .getByLabel("Conteúdo do CSV")
      .fill([CABECALHO, "E2E A;1;E2E ALUNO DOIS;E2E A", "E2E A;2;E2E ALUNO UM;E2E A"].join("\n"));
    await expect(dialogo.getByText("2 alunos em 1 turma, no padrão")).toBeVisible();
    await dialogo.getByRole("button", { name: "Conferir" }).click();
    await expect(dialogo.getByLabel("Alunos por turma")).toContainText("2 alunos");
    await dialogo.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Relação importada.")).toBeVisible();

    const download = page.waitForEvent("download");
    await painel.getByRole("button", { name: "Exportar relação" }).click();
    const arquivo = await download;
    expect(arquivo.suggestedFilename()).toBe("frequenciapp-relacao-alunos.csv");
    const conteudo = await readFile((await arquivo.path()) ?? "", "utf8");
    expect(conteudo.replace(/^﻿/, "").split("\r\n").slice(0, 3)).toEqual([
      CABECALHO,
      "E2E Ano A;1;E2E Aluno Dois;E2E Ano A",
      "E2E Ano A;2;E2E Aluno Um;E2E Ano A",
    ]);

    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    // Com uma turma só, a Chamada já abre nela, sem o seletor.
    const turma = secao.getByRole("button", { name: /E2E Ano A/ }).first();
    if (await turma.isVisible().catch(() => false)) await turma.click();
    const nomes = secao.getByRole("button", { name: /^E2E Aluno (Um|Dois)/ });
    await expect(nomes.first()).toHaveAccessibleName(/^E2E Aluno Dois/);
  });
});
