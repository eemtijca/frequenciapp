// Gestão da desistência e da troca de turma na interface, com massa sintética
// isolada e limpeza ao final.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

async function limparMassa(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Desistente %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Desistencia')",
    );
    await cliente.query("delete from series where nome = 'E2E Desistencia'");
  });
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ('E2E Desistencia', 97) returning id",
    );
    const serieId = serie.rows[0]?.id;
    const turmaA = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serieId],
    );
    await cliente.query("insert into turmas (serie_id, nome) values ($1, 'B')", [serieId]);
    const turmaAId = turmaA.rows[0]?.id;
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Desistente Um', $1, $1, 1, true)",
      [turmaAId],
    );
  });
});

test.afterAll(async () => {
  await limparMassa();
});

test("move, marca desistência e bloqueia a Chamada com gráfico próprio", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos" }).click();
  await page.locator("#busca-gestao-aluno").fill("E2E Desistente Um");
  await page.getByRole("button", { name: "Editar E2E Desistente Um" }).click();
  const edicao = page.getByRole("dialog", { name: "Editar E2E Desistente Um" });
  await expect(edicao.getByText("Escolha outra turma para mover o aluno.")).toBeVisible();
  await edicao.locator("#turma-aluno-gestao").click();
  await page.getByRole("option", { name: "E2E Desistencia B" }).click();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Aluno movido de turma.")).toBeVisible();
  await expect(page.locator("#painel-alunos").getByText("Origem E2E Desistencia A")).toBeVisible();

  await page.getByRole("button", { name: "Editar E2E Desistente Um" }).click();
  await page
    .getByRole("dialog", { name: "Editar E2E Desistente Um" })
    .getByRole("button", { name: "Marcar como desistente" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.locator("#painel-alunos").getByText("Desistente")).toBeVisible();

  await trocarVisao(page, "Chamada", "chamada");
  const chamada = page.locator('section[aria-label="Fazer chamada"]');
  const turmaB = chamada.getByRole("button", { name: /E2E Desistencia B/ }).first();
  if (await turmaB.isVisible().catch(() => false)) await turmaB.click();
  await chamada.getByLabel("Buscar aluno ou turma de origem").fill("E2E Desistente Um");
  const aluno = chamada.getByRole("button", { name: /E2E Desistente Um.*desistente/ });
  await expect(aluno).toBeVisible();
  await expect(aluno).toBeDisabled();
  await expect(aluno.getByText("Desistente", { exact: true })).toBeVisible();

  await trocarVisao(page, "Painel", "painel");
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Desistentes por série" })).toContainText("1");
});
