// Exibição de origem configurável pela escola: seleção por série e turma,
// persistência e desativação reversível, somente com dados sintéticos.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

let inicial: ConfiguracaoOrigem;
const series = ["Ciclo Alfa E2E Config", "Ciclo Beta E2E Config", "3º ano E2E Config"];
const nomes = ["Alfa", "Beta", "Terceira"];

async function limpar(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Config %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = any($1))",
      [series],
    );
    await cliente.query("delete from series where nome = any($1)", [series]);
  });
}

test.beforeAll(async () => {
  inicial = await lerOrigem();
  await limpar();
  await comBanco(async (cliente) => {
    for (const [indice, nome] of series.entries()) {
      const serie = await cliente.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, $2) returning id",
        [nome, 90 + indice],
      );
      const serieId = serie.rows[0]?.id;
      const a = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
        [serieId],
      );
      const b = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
        [serieId],
      );
      await cliente.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $3, 1, true), ($4, $3, $2, 1, true)",
        [
          `E2E Config ${nomes[indice]} A*`,
          a.rows[0]?.id,
          b.rows[0]?.id,
          `E2E Config ${nomes[indice]} B*`,
        ],
      );
    }
  });
});

test.beforeEach(async () => {
  await definirOrigem({
    origemNaChamada: false,
    origemNaChamadaSerieIds: [],
    origemNaChamadaTurmaIds: [],
  });
});

test.afterAll(async () => {
  await limpar();
  await definirOrigem(inicial);
});

async function abrirConfiguracoes(page: Page): Promise<Locator> {
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  return page.getByRole("group", { name: "Turma de origem na Chamada", exact: true });
}

async function alterar(page: Page, controle: Locator, marcado: boolean): Promise<void> {
  const resposta = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/configuracoes" && item.request().method() === "PATCH",
  );
  await controle.click();
  expect((await resposta).status()).toBe(200);
  await expect(controle).toBeEnabled();
  if (marcado) await expect(controle).toBeChecked();
  else await expect(controle).not.toBeChecked();
}

async function conferir(
  page: Page,
  indice: number,
  turma: "A" | "B",
  exibe: boolean,
): Promise<void> {
  await trocarVisao(page, "Chamada", "chamada");
  const chamada = page.locator('section[aria-label="Fazer chamada"]');
  await chamada
    .getByRole("group", { name: "Turma atual" })
    .getByRole("button")
    .filter({ hasText: `${series[indice]} ${turma}` })
    .click();
  const nome = `E2E Config ${nomes[indice]} ${turma}`;
  const linha = chamada.locator("ul li").filter({ hasText: nome });
  await expect(linha.getByText(`${nome}${exibe ? "*" : ""}`, { exact: true })).toBeVisible();
  await expect(linha.getByRole("img", { name: /Turma original/ })).toHaveCount(exibe ? 1 : 0);
}

test("desligada ou ligada sem seleção não mostra origem nem asterisco", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await conferir(page, 0, "A", false);
  await conferir(page, 2, "A", false);
  const painel = await abrirConfiguracoes(page);
  await alterar(page, painel.getByRole("switch"), true);
  await expect(
    painel.getByText("Nenhuma série ou turma selecionada.", { exact: false }),
  ).toBeVisible();
  await conferir(page, 0, "A", false);
  await conferir(page, 2, "A", false);
  await page.reload();
  await aguardarHidratacao(page);
  const recarregado = await abrirConfiguracoes(page);
  await expect(recarregado.getByRole("switch")).toBeChecked();
  await expect(recarregado.getByRole("checkbox", { checked: true })).toHaveCount(0);
});

test("seleciona uma série e mantém a escolha ao recarregar", async ({ page }, testInfo) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  const painel = await abrirConfiguracoes(page);
  await testInfo.attach("origem-desligada", {
    body: await painel.screenshot(),
    contentType: "image/png",
  });
  await alterar(page, painel.getByRole("switch"), true);
  await alterar(
    page,
    painel.getByRole("checkbox", { name: `Mostrar origem na série ${series[0]}`, exact: true }),
    true,
  );
  await expect(page.getByText("Indicação de origem atualizada.", { exact: true })).toHaveCount(0);
  await testInfo.attach("origem-configurada", {
    body: await painel.screenshot(),
    contentType: "image/png",
  });
  await conferir(page, 0, "A", true);
  await conferir(page, 0, "B", true);
  await conferir(page, 1, "A", false);
  await conferir(page, 2, "A", false);
  await page.reload();
  await aguardarHidratacao(page);
  const recarregado = await abrirConfiguracoes(page);
  await expect(
    recarregado.getByRole("checkbox", {
      name: `Mostrar origem na série ${series[0]}`,
      exact: true,
    }),
  ).toBeChecked();
  await conferir(page, 0, "A", true);
});

test("soma várias séries e turmas específicas sem alcançar turmas não selecionadas", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  const painel = await abrirConfiguracoes(page);
  await alterar(page, painel.getByRole("switch"), true);
  for (const nome of series.slice(0, 2)) {
    await alterar(
      page,
      painel.getByRole("checkbox", { name: `Mostrar origem na série ${nome}`, exact: true }),
      true,
    );
  }
  await conferir(page, 0, "A", true);
  await conferir(page, 1, "A", true);
  await conferir(page, 1, "B", true);
  await conferir(page, 2, "A", false);
  const selecao = await abrirConfiguracoes(page);
  await alterar(
    page,
    selecao.getByRole("checkbox", { name: `Mostrar origem na série ${series[1]}`, exact: true }),
    false,
  );
  await alterar(
    page,
    selecao.getByRole("checkbox", { name: `Mostrar origem na turma ${series[1]} B`, exact: true }),
    true,
  );
  await conferir(page, 0, "A", true);
  await conferir(page, 1, "A", false);
  await conferir(page, 1, "B", true);
});

test("desativar e reativar preserva a seleção e o cadastro dos alunos", async ({ page }) => {
  const alunosAntes = await comBanco(
    async (cliente) =>
      (
        await cliente.query(
          "select id, nome, turma_id, turma_original_id from alunos where nome like 'E2E Config %' order by id",
        )
      ).rows,
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  const painel = await abrirConfiguracoes(page);
  await alterar(page, painel.getByRole("switch"), true);
  await alterar(
    page,
    painel.getByRole("checkbox", { name: `Mostrar origem na turma ${series[1]} B`, exact: true }),
    true,
  );
  const escolhida = await lerOrigem();
  await conferir(page, 1, "B", true);
  const desligar = await abrirConfiguracoes(page);
  await alterar(page, desligar.getByRole("switch"), false);
  expect(await lerOrigem()).toEqual({ ...escolhida, origemNaChamada: false });
  await conferir(page, 1, "B", false);
  await page.reload();
  await aguardarHidratacao(page);
  const religar = await abrirConfiguracoes(page);
  await expect(religar.getByRole("switch")).not.toBeChecked();
  await alterar(page, religar.getByRole("switch"), true);
  await expect(
    religar.getByRole("checkbox", { name: `Mostrar origem na turma ${series[1]} B`, exact: true }),
  ).toBeChecked();
  await conferir(page, 1, "B", true);
  expect(await lerOrigem()).toEqual(escolhida);
  const alunosDepois = await comBanco(
    async (cliente) =>
      (
        await cliente.query(
          "select id, nome, turma_id, turma_original_id from alunos where nome like 'E2E Config %' order by id",
        )
      ).rows,
  );
  expect(alunosDepois).toEqual(alunosAntes);
});
