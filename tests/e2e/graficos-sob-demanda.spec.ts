// Confere o download adiado de Recharts, a montagem por visibilidade e a contenção de falhas.
import { expect, test, type Page } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, rolarAteGrafico, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(async () => {
  await criarMassaE2E();
  await comBanco(async (cliente) => {
    const turma = await cliente.query<{ id: string }>(
      "select id from turmas where serie_id in (select id from series where nome='E2E Ano')",
    );
    const turmaId = turma.rows[0]?.id;
    const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    const chamada = await cliente.query<{ id: string }>(
      "insert into frequencias (turma_id,dia,atualizado_em) values ($1,$2,now()) returning id",
      [turmaId, hoje],
    );
    const id = chamada.rows[0]?.id;
    await cliente.query(
      "insert into alunos_chamada (frequencia_id,aluno_id) select $1,id from alunos where turma_id=$2",
      [id, turmaId],
    );
    await cliente.query(
      "insert into faltas (frequencia_id,aluno_id,horario_id) select $1,a.id,h.id from alunos a join horarios h on h.turma_id=a.turma_id where a.nome='E2E Aluno Um'",
      [id],
    );
  });
});
test.afterAll(limparMassaE2E);

async function medirBiblioteca(page: Page, recusar = false) {
  const arquivos = new Set<string>();
  await page.route(/\/_next\/static\/chunks\/.*\.js(?:\?|$)/, async (rota) => {
    const resposta = await rota.fetch();
    const codigo = await resposta.text();
    if (codigo.includes("recharts-wrapper")) {
      arquivos.add(rota.request().url());
      if (recusar) {
        await rota.abort("failed");
        return;
      }
    }
    await rota.fulfill({ response: resposta });
  });
  return arquivos;
}

test("baixa a biblioteca após abrir o painel e monta somente o cartão em exibição", async ({
  page,
}) => {
  const arquivos = await medirBiblioteca(page);
  await page.goto("/?visao=chamada");
  await aguardarHidratacao(page);
  await page.waitForLoadState("networkidle");
  expect(arquivos.size).toBe(0);
  await trocarVisao(page, "Painel", "painel");
  const escola = page.getByRole("article", { name: /: Toda a escola$/ });
  await escola.scrollIntoViewIfNeeded();
  await expect(escola.locator(".recharts-wrapper")).toHaveCount(1);
  expect(arquivos.size).toBeGreaterThan(0);
  const serie = page.getByRole("article", { name: /: E2E Ano$/, includeHidden: true });
  await expect(serie.locator('[data-grafico-sob-demanda="aguardando"]')).toHaveCount(1);
  await expect(serie.locator(".recharts-wrapper")).toHaveCount(0);
  const baixados = arquivos.size;
  await rolarAteGrafico(page, "E2E Ano");
  await expect(serie.locator(".recharts-wrapper")).toHaveCount(1);
  await rolarAteGrafico(page, "Toda a escola");
  await expect(escola.locator(".recharts-wrapper")).toHaveCount(1);
  expect(arquivos.size).toBe(baixados);
  await trocarVisao(page, "Chamada", "chamada");
  await trocarVisao(page, "Painel", "painel");
  await expect(escola.locator(".recharts-wrapper")).toHaveCount(1);
});

test("continua exibindo gráficos quando a observação de visibilidade não está disponível", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "IntersectionObserver");
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  const escola = page.getByRole("article", { name: /: Toda a escola$/ });
  await expect(escola.locator(".recharts-wrapper")).toHaveCount(1);
});

test("isola uma falha no download do gráfico sem bloquear a chamada", async ({ page }) => {
  const arquivos = await medirBiblioteca(page, true);
  await page.goto("/?visao=chamada");
  await aguardarHidratacao(page);
  expect(arquivos.size).toBe(0);
  await trocarVisao(page, "Painel", "painel");
  const escola = page.getByRole("article", { name: /: Toda a escola$/ });
  await escola.scrollIntoViewIfNeeded();
  await expect(escola.getByRole("alert")).toContainText("Não foi possível carregar o gráfico");
  expect(arquivos.size).toBeGreaterThan(0);
  await trocarVisao(page, "Chamada", "chamada");
  await expect(page.getByPlaceholder("Buscar aluno ou turma de origem")).toBeVisible();
});
