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

test("Chamada: um botão por série expande e recolhe as turmas", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const botaoDois = grupo.getByRole("button", { name: series[1] ?? "", exact: true });
  const turmaDoisA = grupo.getByRole("button", { name: /Faixa Dois E2E Serie A/ });

  await expect(botaoDois).toHaveAttribute("aria-expanded", "false");
  await expect(turmaDoisA).toHaveCount(0);
  await botaoDois.click();
  await expect(botaoDois).toHaveAttribute("aria-expanded", "true");
  await turmaDoisA.click();
  await expect(turmaDoisA).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("E2E Serie 2A", { exact: true }).first()).toBeVisible();

  // A série da turma escolhida segue marcada e recolher só esconde as turmas.
  await botaoDois.click();
  await expect(botaoDois).toHaveAttribute("aria-expanded", "false");
  await expect(turmaDoisA).toHaveCount(0);
});

test("Chamada: abrir uma série fecha as turmas das outras", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const botaoUm = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  const botaoDois = grupo.getByRole("button", { name: series[1] ?? "", exact: true });

  // A série da turma atual pode já começar aberta; o estado final é o que importa.
  await botaoDois.click();
  await expect(botaoDois).toHaveAttribute("aria-expanded", "true");
  await expect(botaoUm).toHaveAttribute("aria-expanded", "false");
  await botaoUm.click();
  await expect(botaoUm).toHaveAttribute("aria-expanded", "true");
  await expect(botaoDois).toHaveAttribute("aria-expanded", "false");
  await expect(grupo.getByRole("group", { name: `Turmas de ${series[1]}` })).toHaveCount(0);
  await expect(grupo.getByRole("group", { name: `Turmas de ${series[0]}` })).toBeVisible();
});

test("Chamada: no celular, as séries ficam lado a lado sem cortar", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  await grupo.getByRole("button", { name: series[0] ?? "", exact: true }).click();
  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(estouro).toBe(false);
  // Nenhum botão de série ultrapassa a borda da tela (o contêiner pode esconder o excesso).
  for (const serie of series) {
    const caixa = await grupo.getByRole("button", { name: serie, exact: true }).boundingBox();
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(360);
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
