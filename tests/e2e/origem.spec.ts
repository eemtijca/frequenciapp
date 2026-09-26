// Extras do 3º ano: agrupar Alunos por origem, buscar por origem na Chamada
// e definir origem em massa na Gestão.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

async function criarMassaOrigem(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Origem %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Origem')",
    );
    await cliente.query("delete from series where nome = 'E2E Origem'");
    const serie = await cliente.query(
      "insert into series (nome, ordem) values ('E2E Origem', 98) returning id",
    );
    const serieId = serie.rows[0]?.id as string;
    const turmaA = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serieId],
    );
    const turmaB = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
      [serieId],
    );
    const aId = turmaA.rows[0]?.id as string;
    const bId = turmaB.rows[0]?.id as string;
    await cliente.query(
      `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo)
       values ('E2E Origem Um', $1, $2, 1, true), ('E2E Origem Dois', $1, $1, 2, true)`,
      [aId, bId],
    );
  });
}

async function limparMassaOrigem(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Origem %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Origem')",
    );
    await cliente.query("delete from series where nome = 'E2E Origem'");
  });
}

test.describe("consulta por origem (coordenação)", () => {
  test.use({ storageState: "tests/e2e/.auth/coordenacao.json" });

  test.beforeAll(async () => {
    await criarMassaOrigem();
  });

  test.afterAll(async () => {
    await limparMassaOrigem();
  });

  test("agrupa os alunos pela turma de origem", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Alunos", "alunos");
    await page.getByRole("button", { name: "Turma de origem" }).click();
    const secao = page.locator('section[aria-label="Lista de alunos"]');
    await expect(secao.getByText("E2E Origem Um")).toBeVisible();
    await expect(secao.getByText("Atual E2E Origem A").first()).toBeVisible();
  });

  test("busca na Chamada pela turma de origem e mostra a origem na linha", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    const turma = secao.getByRole("button", { name: /E2E Origem A/ }).first();
    if (await turma.isVisible().catch(() => false)) await turma.click();
    await page.getByLabel("Buscar aluno ou turma de origem").fill("E2E Origem B");
    await expect(secao.getByText("E2E Origem Um")).toBeVisible();
    await expect(secao.getByText("E2E Origem Dois")).toBeHidden();
    await expect(secao.getByText("Origem E2E Origem B")).toBeVisible();
  });
});

test.describe("origem em massa (administração)", () => {
  test.beforeAll(async () => {
    await criarMassaOrigem();
  });

  test.afterAll(async () => {
    await limparMassaOrigem();
  });

  test("define a origem de vários alunos sem mover de turma", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Alunos" }).click();
    const painel = page.locator("#painel-alunos");
    await painel.getByRole("button", { name: "Definir origem" }).click();
    await page.locator("#busca-gestao-aluno").fill("E2E Origem");
    await painel.getByRole("button", { name: "Selecionar todos" }).click();
    await page.locator("#origem-em-massa").click();
    await page.getByRole("option", { name: "E2E Origem B" }).click();
    await painel.getByRole("button", { name: "Aplicar origem" }).click();
    await expect(page.getByText("Origem de 2 alunos atualizada.")).toBeVisible();
    await expect(painel.getByText("Origem E2E Origem B").first()).toBeVisible();
  });
});
