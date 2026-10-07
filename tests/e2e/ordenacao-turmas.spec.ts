// Reorganização global de alunos: confirmação, toque duplo e atualização da chamada.
import { expect, test, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

const prefixo = "E2E Ordem";
let originais: { id: string; ordem: number }[] = [];

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

async function ordens() {
  return comBanco(
    async (banco) =>
      (
        await banco.query(
          "select a.nome, a.ordem from alunos a join turmas t on t.id = a.turma_id where a.nome like $1 order by t.nome, a.ordem",
          [`${prefixo}%`],
        )
      ).rows,
  );
}

async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Turmas", exact: true }).click();
}

test.beforeEach(async () => {
  await limpar();
  await comBanco(async (banco) => {
    originais = (await banco.query<{ id: string; ordem: number }>("select id, ordem from alunos"))
      .rows;
    const serie = await banco.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 98) returning id",
      [prefixo],
    );
    for (const nome of ["A", "B"]) {
      const turma = await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ($1, $2) returning id",
        [nome, serie.rows[0]?.id],
      );
      await banco.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $3, $3, 1, true), ($2, $3, $3, 2, true)",
        [`${prefixo} ${nome} Zoé`, `${prefixo} ${nome} Álvaro`, turma.rows[0]?.id],
      );
    }
  });
});

test.afterEach(async () => {
  await comBanco(async (banco) => {
    if (originais.length)
      await banco.query(
        "update alunos as a set ordem = r.ordem from jsonb_to_recordset($1::jsonb) as r(id uuid, ordem integer) where a.id = r.id",
        [JSON.stringify(originais)],
      );
  });
  await limpar();
});

test("um único botão reorganiza todas as turmas e atualiza a chamada sem duplicar o envio", async ({
  page,
}, testInfo) => {
  await abrir(page);
  const botao = page.getByRole("button", { name: "Reorganizar turmas", exact: true });
  await expect(botao).toHaveCount(1);
  const antes = await ordens();
  let envios = 0;
  page.on("request", (requisicao) => {
    if (requisicao.method() === "POST" && requisicao.url().endsWith("/api/turmas/ordenar"))
      envios++;
  });
  await botao.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText("As planilhas já existentes mantêm a ordem das linhas.");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await ordens()).toEqual(antes);
  expect(envios).toBe(0);

  // Mesmo com uma turma filtrada na tela, a ação inclui a outra turma.
  await page.getByPlaceholder("Buscar turma").fill(`${prefixo} A`);
  await botao.click();
  await page.screenshot({ path: testInfo.outputPath("confirmacao.png"), fullPage: true });
  await dialogo
    .getByRole("button", { name: "Reorganizar todas", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(page.getByText("Turmas reorganizadas.", { exact: true })).toBeVisible();
  expect(envios).toBe(1);
  expect(await ordens()).toEqual([
    { nome: `${prefixo} A Álvaro`, ordem: 1 },
    { nome: `${prefixo} A Zoé`, ordem: 2 },
    { nome: `${prefixo} B Álvaro`, ordem: 1 },
    { nome: `${prefixo} B Zoé`, ordem: 2 },
  ]);
  await trocarVisao(page, "Chamada", "chamada");
  const chamada = page.locator('section[aria-label="Fazer chamada"]');
  await escolherTurmaNaChamada(chamada, new RegExp(`${prefixo} A`));
  const nomes = chamada.locator("ul li");
  await expect(nomes).toHaveCount(2);
  await expect(nomes.nth(0)).toContainText(`${prefixo} A Álvaro`);
  await expect(nomes.nth(0)).toContainText("01");
  await expect(nomes.nth(1)).toContainText(`${prefixo} A Zoé`);
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  await escolherTurmaNaChamada(chamada, new RegExp(`${prefixo} A`));
  await expect(nomes.nth(0)).toContainText(`${prefixo} A Álvaro`);
});

test("uma falha mantém a confirmação aberta e permite nova tentativa", async ({ page }) => {
  await abrir(page);
  const antes = await ordens();
  await page.route("**/api/turmas/ordenar", (rota) =>
    rota.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Não foi possível reorganizar as turmas." }),
    }),
  );
  await page.getByRole("button", { name: "Reorganizar turmas", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  const confirmar = dialogo.getByRole("button", { name: "Reorganizar todas", exact: true });
  await confirmar.click();
  await expect(
    page.getByText("Não foi possível reorganizar as turmas.", { exact: true }),
  ).toBeVisible();
  await expect(dialogo).toBeVisible();
  await expect(confirmar).toBeEnabled();
  expect(await ordens()).toEqual(antes);
  await page.unroute("**/api/turmas/ordenar");
  await confirmar.click();
  await expect(page.getByText("Turmas reorganizadas.", { exact: true })).toBeVisible();
  await expect(dialogo).toHaveCount(0);
});
