// Provas específicas: a coordenação cadastra uma prova no domingo, escolhe os alunos, marca presente e ausente,
// confere as contagens depois de recarregar e remove a prova com confirmação.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({
  serviceWorkers: "block",
  storageState: "tests/ponta-a-ponta/.auth/coordenacao.json",
});
const serie = "E2E Provas Específicas";
const prova = "E2E Enem";
const alunos = ["E2E Prova Ana", "E2E Prova Bruno", "E2E Prova Carla"];

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from provas_especificas where nome like 'E2E %'");
    await banco.query("delete from alunos where nome like 'E2E Prova %'");
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [serie],
    );
    await banco.query("delete from series where nome = $1", [serie]);
  });
}

test.beforeAll(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serieId = (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 92) returning id",
        [serie],
      )
    ).rows[0]?.id;
    const turmaId = (
      await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ('A', $1) returning id",
        [serieId],
      )
    ).rows[0]?.id;
    for (const [indice, nome] of alunos.entries()) {
      await banco.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3)",
        [nome, turmaId, indice + 1],
      );
    }
  });
});

test.afterAll(limpar);

async function abrirProvas(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Provas", "provas");
}

test("cadastra a prova, inscreve os alunos, marca a frequência e remove a prova", async ({
  page,
}) => {
  await abrirProvas(page);
  await page.getByRole("button", { name: "Nova prova" }).click();
  const cadastro = page.getByRole("dialog", { name: "Nova prova" });
  await cadastro.getByRole("textbox", { name: "Nome da prova" }).fill(prova);
  await cadastro.getByRole("textbox", { name: "Local da prova (opcional)" }).fill("Escola Central");
  await cadastro.getByRole("button", { name: "Cadastrar prova" }).click();
  await expect(page.getByRole("heading", { name: prova })).toBeVisible();
  await expect(page.getByText("Nenhum aluno nesta prova")).toBeVisible();

  await page.getByRole("button", { name: "Adicionar alunos" }).click();
  const escolha = page.getByRole("dialog", { name: "Alunos da prova" });
  await escolha.getByRole("searchbox").fill("E2E Prova");
  for (const nome of alunos) await escolha.getByRole("checkbox", { name: nome }).check();
  await expect(escolha.getByText("3 alunos escolhidos")).toBeVisible();
  await escolha.getByRole("button", { name: "Salvar alunos" }).click();
  await expect(escolha).toBeHidden();
  await expect(page.getByText("3 alunos", { exact: true })).toBeVisible();
  await expect(page.getByText("3 sem registro")).toBeVisible();

  const ana = page.getByRole("group", { name: "Frequência de E2E Prova Ana" });
  const bruno = page.getByRole("group", { name: "Frequência de E2E Prova Bruno" });
  await ana.getByRole("button", { name: "Presente" }).click();
  await bruno.getByRole("button", { name: "Ausente" }).click();
  await expect(ana.getByRole("button", { name: "Presente" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("1 presentes")).toBeVisible();
  await expect(page.getByText("1 ausentes")).toBeVisible();
  await expect(page.getByText("1 sem registro")).toBeVisible();

  // Tocar de novo no botão marcado limpa o registro.
  await bruno.getByRole("button", { name: "Ausente" }).click();
  await expect(bruno.getByRole("button", { name: "Ausente" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByText("2 sem registro")).toBeVisible();

  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Provas", "provas");
  await page.getByText(prova).first().click();
  await expect(
    page
      .getByRole("group", { name: "Frequência de E2E Prova Ana" })
      .getByRole("button", { name: "Presente" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Remover" }).click();
  await page
    .getByRole("alertdialog", { name: "Remover a prova?" })
    .getByRole("button", { name: "Remover prova" })
    .click();
  await expect(page.getByRole("heading", { name: "Provas", exact: true })).toBeVisible();
  await expect(page.getByText(prova)).toHaveCount(0);
});
