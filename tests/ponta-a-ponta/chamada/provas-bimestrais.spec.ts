// Horário de provas bimestrais: a administração cadastra na Gestão para uma série inteira, o conflito
// de horário é recusado, a aba Horários mostra as provas da turma e o encerramento apaga tudo.
import { abrirConfiguracoesDaGestao } from "../../helpers/categorias-configuracoes";
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { selecionarAcaoConfiguracoes } from "../helpers/configuracoes";

test.use({ serviceWorkers: "block" });
const serie = "E2E Provas";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [serie],
    );
    await banco.query("delete from series where nome = $1", [serie]);
  });
}

async function provasDaSerie(): Promise<number> {
  return comBanco(async (banco) => {
    const linhas = await banco.query(
      "select 1 from provas_bimestrais p join turmas t on t.id = p.turma_id join series s on s.id = t.serie_id where s.nome = $1",
      [serie],
    );
    return linhas.rows.length;
  });
}

test.beforeAll(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serieId = (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 93) returning id",
        [serie],
      )
    ).rows[0]?.id;
    for (const nome of ["A", "B", "C"]) {
      await banco.query("insert into turmas (nome, serie_id) values ($1, $2)", [nome, serieId]);
    }
  });
});

test.afterAll(limpar);

async function abrirProvas(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await abrirConfiguracoesDaGestao(page);
  await selecionarAcaoConfiguracoes(page, "Horários", "Provas");
  const formulario = page.getByRole("form", { name: "Nova prova" });
  await expect(formulario).toBeVisible();
  return formulario;
}

async function verTurmaEmHorarios(page: Page, turma: string) {
  await trocarVisao(page, "Horários", "horarios");
  const vista = page.getByRole("region", { name: "Horários semanais", exact: true });
  await vista.getByRole("combobox", { name: "Turma" }).click();
  await page.getByRole("option", { name: turma, exact: true }).click();
  return vista;
}

test("cadastra a prova para a série, recusa conflito e mostra na aba Horários", async ({
  page,
}, testInfo) => {
  const formulario = await abrirProvas(page);
  await formulario.getByLabel("Disciplina").fill("E2E Matemática");
  await formulario.getByRole("checkbox", { name: `Toda a ${serie}` }).check();
  await formulario.getByRole("checkbox", { name: `${serie} C` }).uncheck();
  await formulario.getByRole("button", { name: "Adicionar prova para 2 turmas" }).click();
  await expect(page.getByText("Prova adicionada.", { exact: true })).toBeVisible();
  const cadastradas = page.getByRole("region", { name: "Provas cadastradas" });
  await expect(cadastradas).toContainText("E2E Matemática");
  await expect(cadastradas).toContainText(`${serie} A, ${serie} B`);
  expect(await provasDaSerie()).toBe(2);
  await page.screenshot({ path: testInfo.outputPath("gestao-provas.png"), fullPage: true });

  // A disciplina limpa e o início passa a ser o fim anterior; 09:00 a 09:00 é recusado na tela.
  await formulario.getByLabel("Disciplina").fill("E2E História");
  await formulario.getByRole("button", { name: "Adicionar prova para 2 turmas" }).click();
  await expect(
    formulario.getByText("O horário de fim deve ser posterior ao de início."),
  ).toBeVisible();
  expect(await provasDaSerie()).toBe(2);

  await verTurmaEmHorarios(page, `${serie} A`);
  const cartao = page.getByRole("region", { name: `Provas bimestrais de ${serie} A` });
  await expect(cartao).toContainText("E2E Matemática");
  await expect(cartao).toContainText("07:00 às 09:00");
  await page.screenshot({ path: testInfo.outputPath("horarios-provas.png"), fullPage: true });
  // A turma sem prova não mostra o cartão.
  await verTurmaEmHorarios(page, `${serie} C`);
  await expect(page.getByRole("region", { name: /^Provas bimestrais de/ })).toHaveCount(0);
});

test("recusa prova na mesma janela, remove uma prova e encerra o período", async ({ page }) => {
  const formulario = await abrirProvas(page);
  const cadastradas = page.getByRole("region", { name: "Provas cadastradas" });
  await expect(cadastradas).toContainText("E2E Matemática");
  await formulario.getByLabel("Disciplina").fill("E2E Química");
  await formulario.getByRole("checkbox", { name: `${serie} B` }).check();
  await formulario.getByRole("button", { name: "Adicionar prova", exact: true }).click();
  await expect(page.getByText(/E2E Provas B já tem prova nesse horário/)).toBeVisible();
  expect(await provasDaSerie()).toBe(2);

  await cadastradas.getByRole("button", { name: /^Remover a prova de E2E Matemática de / }).click();
  const remover = page.getByRole("alertdialog", { name: "Remover a prova?" });
  await expect(remover).toContainText("2 turmas");
  await remover.getByRole("button", { name: "Remover prova" }).click();
  await expect(page.getByText("Prova removida.", { exact: true })).toBeVisible();
  await expect(page.getByText("Nenhuma prova cadastrada.")).toBeVisible();
  expect(await provasDaSerie()).toBe(0);

  await formulario.getByRole("button", { name: "Adicionar prova", exact: true }).click();
  await expect(page.getByText("Prova adicionada.", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Encerrar período de provas" }).click();
  const encerrar = page.getByRole("alertdialog", { name: "Encerrar o período de provas?" });
  await encerrar.getByRole("button", { name: "Encerrar período" }).click();
  await expect(page.getByText("Período de provas encerrado.", { exact: true })).toBeVisible();
  expect(await provasDaSerie()).toBe(0);
  await verTurmaEmHorarios(page, `${serie} B`);
  await expect(page.getByRole("region", { name: /^Provas bimestrais de/ })).toHaveCount(0);
});
