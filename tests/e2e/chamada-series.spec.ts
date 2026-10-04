// Chamada com um botão por série, que expande e recolhe as turmas, e Gestão com
// as turmas específicas da origem numa seção recolhível. Dados sintéticos.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const series = ["Faixa Um E2E Serie", "Faixa Dois E2E Serie", "Faixa Tres E2E Serie"];
let inicial: ConfiguracaoOrigem;

async function limpar(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Serie %'");
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
        [nome, 80 + indice],
      );
      for (const turma of ["A", "B"]) {
        const criada = await cliente.query<{ id: string }>(
          "insert into turmas (serie_id, nome) values ($1, $2) returning id",
          [serie.rows[0]?.id, turma],
        );
        await cliente.query(
          "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $2, 1, true)",
          [`E2E Serie ${indice + 1}${turma}`, criada.rows[0]?.id],
        );
      }
    }
  });
});

test.afterAll(async () => {
  await definirOrigem(inicial);
  await limpar();
});

test("Chamada: tocar no ano ativa a série, mostra só as turmas dela e seleciona a primeira", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const botaoUm = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  const botaoDois = grupo.getByRole("button", { name: series[1] ?? "", exact: true });
  const turmaDoisA = grupo.getByRole("button", { name: /Faixa Dois E2E Serie A/ });
  const turmaDoisB = grupo.getByRole("button", { name: /Faixa Dois E2E Serie B/ });
  const turmaUmA = grupo.getByRole("button", { name: /Faixa Um E2E Serie A/ });

  await botaoDois.click();
  await expect(botaoDois).toHaveAttribute("aria-pressed", "true");
  await expect(botaoUm).toHaveAttribute("aria-pressed", "false");
  await expect(turmaDoisA).toHaveAttribute("aria-pressed", "true");
  await expect(botaoDois).toHaveAccessibleDescription("2 alunos");
  await expect(turmaDoisA).toHaveAccessibleDescription("1 aluno");
  await expect(turmaUmA).toHaveCount(0);
  await expect(page.getByText("E2E Serie 2A", { exact: true }).first()).toBeVisible();

  if (isMobile) await turmaDoisB.click();
  else {
    await expect(turmaDoisB).toBeEnabled();
    await turmaDoisB.focus();
    await page.keyboard.press("Enter");
  }
  await expect(turmaDoisB).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisA).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("E2E Serie 2B", { exact: true }).first()).toBeVisible();

  // Recolher e reabrir a série preserva a turma B, por toque ou teclado.
  if (isMobile) await botaoDois.click();
  else {
    await botaoDois.focus();
    await page.keyboard.press("Space");
  }
  await expect(botaoDois).toHaveAttribute("aria-expanded", "false");
  await expect(botaoDois).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisB).toHaveCount(0);
  if (isMobile) await botaoDois.click();
  else await page.keyboard.press("Enter");
  await expect(botaoDois).toHaveAttribute("aria-expanded", "true");
  await expect(turmaDoisB).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("E2E Serie 2B", { exact: true }).first()).toBeVisible();

  // Voltar à primeira série seleciona a primeira turma dela.
  await botaoUm.click();
  await expect(botaoUm).toHaveAttribute("aria-pressed", "true");
  await expect(turmaUmA).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisA).toHaveCount(0);
});

test("Chamada: no celular, as séries ficam lado a lado sem cortar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const serieInicial = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  if ((await serieInicial.getAttribute("aria-expanded")) !== "true") await serieInicial.click();
  await expect(grupo.getByRole("button", { name: /Faixa Um E2E Serie A/ })).toBeVisible();
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(estouro).toBe(false);
  // Séries e turmas cabem na tela e mantêm altura confortável para o toque.
  for (const nome of [...series, "Faixa Um E2E Serie A", "Faixa Um E2E Serie B"]) {
    const caixa = await grupo.getByRole("button", { name: nome, exact: true }).boundingBox();
    expect(caixa).not.toBeNull();
    expect(caixa?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(360);
    expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test("Gestão: as turmas específicas da origem ficam numa seção recolhível", async ({ page }) => {
  await definirOrigem({
    origemNaChamada: true,
    origemNaChamadaSerieIds: [],
    origemNaChamadaTurmaIds: [],
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: /Config/ }).click();
  const secao = page.locator('[data-secao="config-origem-turmas"]');
  const gatilho = secao.getByRole("button", { name: /Turmas específicas/ });
  const caixa = page.getByRole("checkbox", {
    name: "Mostrar origem na turma Faixa Um E2E Serie A",
  });

  await expect(gatilho).toHaveAttribute("aria-expanded", "false");
  await expect(caixa).toHaveCount(0);
  await gatilho.click();
  await expect(gatilho).toHaveAttribute("aria-expanded", "true");
  await expect(caixa).toBeVisible();
  await gatilho.click();
  await expect(caixa).toHaveCount(0);
});
