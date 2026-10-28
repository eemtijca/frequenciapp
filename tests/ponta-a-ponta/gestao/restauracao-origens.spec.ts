// Restaurar origens em Gestão, Alunos: prévia por turma, avisos, cancelamento, toque duplo e alunos de volta.
import { expect, test, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

const prefixo = "E2E Restaurar";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [prefixo],
    );
    await banco.query("delete from series where nome = $1", [prefixo]);
  });
}

async function situacao() {
  return comBanco(
    async (banco) =>
      (
        await banco.query(
          "select a.nome, t.nome as turma, a.ordem from alunos a join turmas t on t.id = a.turma_id where a.nome like $1 order by t.nome, a.ordem",
          [`${prefixo}%`],
        )
      ).rows,
  );
}

async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos", exact: true }).click();
}

test.beforeEach(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serie = await banco.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 99) returning id",
      [prefixo],
    );
    const turma: Record<string, string> = {};
    for (const nome of ["A", "B"]) {
      const criada = await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ($1, $2) returning id",
        [nome, serie.rows[0]?.id],
      );
      turma[nome] = criada.rows[0]?.id ?? "";
    }
    // Davi e Zoé foram remanejados para a outra turma; Bruna e Carla ficaram.
    for (const [nome, atual, origem, ordem] of [
      ["Bruna", "A", "A", 1],
      ["Zoé", "B", "A", 2],
      ["Carla", "B", "B", 1],
      ["Davi", "A", "B", 2],
    ] as const) {
      await banco.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $3, $4, true)",
        [`${prefixo} ${nome}`, turma[atual], turma[origem], ordem],
      );
    }
  });
});

test.afterEach(async () => {
  await limpar();
});

test("mostra a prévia por turma e devolve os alunos às turmas de origem uma única vez", async ({
  page,
}, testInfo) => {
  await abrir(page);
  const antes = await situacao();
  let envios = 0;
  let previaEnviada: unknown[] = [];
  page.on("request", (requisicao) => {
    if (
      requisicao.method() === "POST" &&
      requisicao.url().endsWith("/api/alunos/restaurar-origens")
    ) {
      envios++;
      previaEnviada = (requisicao.postDataJSON() as { previa: unknown[] }).previa;
    }
  });
  await page.getByRole("button", { name: "Restaurar origens", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  const seletor = dialogo.locator("#restaurar-origens-serie");
  if (await seletor.isVisible().catch(() => false)) {
    await seletor.click();
    await page.getByRole("option", { name: new RegExp(`^${prefixo}`) }).click();
  }
  const previa = dialogo.getByRole("list", { name: "Prévia da restauração" });
  await expect(previa).toContainText(`${prefixo} A: 1 aluno`);
  await expect(previa).toContainText(`Voltam de ${prefixo} B`);
  await expect(previa).toContainText(`${prefixo} B: 1 aluno`);
  // Os efeitos sobre quem não se moveu e sobre as saídas ficam escritos antes da confirmação.
  await expect(dialogo).toContainText("pela mesma regra de Reorganizar turmas");
  await expect(dialogo).toContainText(
    "passam a aparecer na turma de origem no relatório de saídas e entradas e na planilha de saídas",
  );
  await expect(dialogo).toContainText("Quem mudou de série não é alterado.");
  await page.screenshot({ path: testInfo.outputPath("confirmacao.png"), fullPage: true });
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await situacao()).toEqual(antes);
  expect(envios).toBe(0);

  await page.getByRole("button", { name: "Restaurar origens", exact: true }).click();
  if (await seletor.isVisible().catch(() => false)) {
    await seletor.click();
    await page.getByRole("option", { name: new RegExp(`^${prefixo}`) }).click();
  }
  await dialogo
    .getByRole("button", { name: "Restaurar 2 alunos", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(
    page.getByText("2 alunos de volta às turmas de origem.", { exact: true }),
  ).toBeVisible();
  expect(envios).toBe(1);
  expect(previaEnviada).toHaveLength(2);
  expect(await situacao()).toEqual([
    { nome: `${prefixo} Bruna`, turma: "A", ordem: 1 },
    { nome: `${prefixo} Zoé`, turma: "A", ordem: 2 },
    { nome: `${prefixo} Carla`, turma: "B", ordem: 1 },
    { nome: `${prefixo} Davi`, turma: "B", ordem: 2 },
  ]);
});

test("recusa a prévia que mudou e mostra a relação atual para conferir de novo", async ({
  page,
}) => {
  await abrir(page);
  await page.getByRole("button", { name: "Restaurar origens", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  const seletor = dialogo.locator("#restaurar-origens-serie");
  if (await seletor.isVisible().catch(() => false)) {
    await seletor.click();
    await page.getByRole("option", { name: new RegExp(`^${prefixo}`) }).click();
  }
  await expect(dialogo.getByRole("button", { name: "Restaurar 2 alunos" })).toBeVisible();
  // Com o diálogo aberto, Bruna é remanejada para a turma B.
  await comBanco(async (banco) => {
    await banco.query(
      "update alunos set turma_id = (select turma_id from alunos where nome = $2) where nome = $1",
      [`${prefixo} Bruna`, `${prefixo} Carla`],
    );
  });
  await dialogo.getByRole("button", { name: "Restaurar 2 alunos", exact: true }).click();
  await expect(
    page.getByText("A relação de alunos mudou desde a conferência. Confira de novo."),
  ).toBeVisible();
  await expect(dialogo).toBeVisible();
  await expect(
    dialogo.getByRole("button", { name: "Restaurar 3 alunos", exact: true }),
  ).toBeVisible();
  await dialogo.getByRole("button", { name: "Restaurar 3 alunos", exact: true }).click();
  await expect(
    page.getByText("3 alunos de volta às turmas de origem.", { exact: true }),
  ).toBeVisible();
  expect((await situacao()).map((item) => `${item.turma}:${item.nome}`)).toEqual([
    `A:${prefixo} Bruna`,
    `A:${prefixo} Zoé`,
    `B:${prefixo} Carla`,
    `B:${prefixo} Davi`,
  ]);
});
