// Resumo de relatórios: filtros, dados diários, responsividade e recuperação de falha mensal.
import { expect, test, type Page } from "@playwright/test";
import type { Aluno, Frequencia } from "@/domain/frequencia";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Resumo", exact: true }).click();
  const painel = page.getByRole("region", { name: "Resumo dos relatórios", exact: true });
  await expect(painel).toHaveAttribute("aria-busy", "false");
  const resposta = await page.request.get("/api/alunos");
  const { alunos } = (await resposta.json()) as { alunos: Aluno[] };
  const doTeste = alunos.filter((aluno) => ["E2E Aluno Um", "E2E Aluno Dois"].includes(aluno.nome));
  const primeiro = doTeste[0];
  if (!primeiro || doTeste.length !== 2) throw new Error("Massa do resumo não encontrada.");
  const chamada: Frequencia = {
    dia: "",
    turmaId: primeiro.turmaId,
    revisao: 1,
    atualizadoEm: "2026-01-01T12:00:00Z",
    atualizadoPorNome: null,
    alunos: doTeste.map((aluno) => aluno.id),
    faltas: [{ alunoId: primeiro.id, horarios: ["aula-sintetica"] }],
  };
  return { painel, chamada, alunos: doTeste };
}

test("mostra comparação, filtra a turma e oferece os dados do gráfico sem corte", async ({
  page,
}, testInfo) => {
  const { painel, chamada } = await abrir(page);
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    const mes = new URL(rota.request().url()).searchParams.get("mes");
    await rota.fulfill({ json: { frequencias: [{ ...chamada, dia: `${mes}-01` }] } });
  });
  await painel.getByRole("button", { name: "Mês anterior do resumo" }).click();
  await expect(painel.locator("dd")).toHaveText(["1", "0", "50%"]);
  await painel.getByRole("combobox", { name: "Série do resumo" }).click();
  await page.getByRole("option", { name: "E2E Ano", exact: true }).click();
  await painel.getByRole("combobox", { name: "Turma do resumo" }).click();
  await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
  const comparacao = painel.getByRole("region", { name: "Infrequência por turma", exact: true });
  await expect(comparacao.getByRole("listitem")).toHaveCount(1);
  await expect(comparacao.getByRole("listitem")).toContainText("1 falta em 2 registros");
  await painel.getByText("Ver dados diários", { exact: true }).click();
  await expect(painel.getByRole("row").nth(1)).toContainText("50%");
  await expect(painel.getByRole("row").nth(2)).toContainText("Sem registro");
  await page.setViewportSize({ width: 360, height: 780 });
  await painel.getByRole("button", { name: "Mês seguinte do resumo" }).click();
  const periodo = painel.getByRole("button", { name: /^Mês do resumo:/ });
  await expect(periodo).toContainText("Este mês");
  await expect(painel).toHaveAttribute("aria-busy", "false");
  await expect
    .poll(() =>
      periodo
        .locator(".numerais-tabulares")
        .evaluate((rotulo) => rotulo.clientWidth > 0 && rotulo.scrollWidth <= rotulo.clientWidth),
    )
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: `docs/imagens/locais/resumo-relatorios-${testInfo.project.name}.png`,
  });
});

test("compara séries e ordena alunos por faltas com justificadas discriminadas", async ({
  page,
}) => {
  const { painel, chamada, alunos } = await abrir(page);
  const primeiro = alunos[0];
  const segundo = alunos[1];
  if (!primeiro || !segundo) throw new Error("Alunos de teste ausentes.");
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    const mes = new URL(rota.request().url()).searchParams.get("mes");
    await rota.fulfill({
      json: {
        frequencias: [
          { ...chamada, dia: `${mes}-01` },
          {
            ...chamada,
            dia: `${mes}-02`,
            faltas: alunos.map((aluno) => ({
              alunoId: aluno.id,
              horarios: ["aula-sintetica"],
              justificativa: "D",
            })),
          },
        ],
      },
    });
  });
  await painel.getByRole("button", { name: "Mês anterior do resumo" }).click();
  await expect(painel.locator("dd")).toHaveText(["3", "2", "75%"]);
  await painel.getByRole("combobox", { name: "Comparar por", exact: true }).click();
  await page.getByRole("option", { name: "Séries", exact: true }).click();
  const comparacao = painel.getByRole("region", { name: "Infrequência por série", exact: true });
  await expect(comparacao.getByRole("listitem")).toHaveCount(1);
  await expect(comparacao.getByRole("listitem")).toContainText("75%");
  await expect(comparacao.getByRole("listitem")).toContainText("3 faltas em 4 registros");
  const ranking = painel.getByRole("region", { name: "Alunos com mais faltas", exact: true });
  const classificados = ranking.getByRole("listitem");
  await expect(classificados).toHaveCount(2);
  await expect(classificados.nth(0)).toContainText(primeiro.nome);
  await expect(classificados.nth(0)).toContainText("1 F · 1 FJ");
  await expect(classificados.nth(1)).toContainText(segundo.nome);
  await expect(classificados.nth(1)).toContainText("0 F · 1 FJ");
});

test("alterna entre os rankings de faltas, sem justificativa e justificadas", async ({ page }) => {
  const { painel, chamada, alunos } = await abrir(page);
  const primeiro = alunos[0];
  const segundo = alunos[1];
  if (!primeiro || !segundo) throw new Error("Alunos de teste ausentes.");
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    const mes = new URL(rota.request().url()).searchParams.get("mes");
    await rota.fulfill({
      json: {
        frequencias: [
          { ...chamada, dia: `${mes}-01` },
          {
            ...chamada,
            dia: `${mes}-02`,
            faltas: alunos.map((aluno) => ({
              alunoId: aluno.id,
              horarios: ["aula-sintetica"],
              justificativa: "D",
            })),
          },
        ],
      },
    });
  });
  await painel.getByRole("button", { name: "Mês anterior do resumo" }).click();
  const ranking = painel.getByRole("region", { name: "Alunos com mais faltas", exact: true });
  const grupo = ranking.getByRole("group", { name: "Ranking de alunos", exact: true });
  const todas = grupo.getByRole("button", { name: "Todas as faltas (F + FJ)", exact: true });
  const semJustificativa = grupo.getByRole("button", {
    name: "Sem justificativa (F)",
    exact: true,
  });
  const justificadas = grupo.getByRole("button", { name: "Justificadas (FJ)", exact: true });
  const classificados = ranking.getByRole("listitem");
  await expect(todas).toHaveAttribute("aria-pressed", "true");
  await expect(classificados).toHaveCount(2);

  await semJustificativa.click();
  await expect(semJustificativa).toHaveAttribute("aria-pressed", "true");
  await expect(todas).toHaveAttribute("aria-pressed", "false");
  await expect(
    ranking.getByRole("heading", { name: "Alunos com mais faltas sem justificativa" }),
  ).toBeVisible();
  await expect(classificados).toHaveCount(1);
  await expect(classificados.nth(0)).toContainText(primeiro.nome);
  await expect(classificados.nth(0)).toContainText("1 falta");
  await expect(classificados.nth(0)).toContainText("1 F · 1 FJ");

  await justificadas.click();
  await expect(justificadas).toHaveAttribute("aria-pressed", "true");
  await expect(
    ranking.getByRole("heading", { name: "Alunos com mais faltas justificadas" }),
  ).toBeVisible();
  await expect(classificados).toHaveCount(2);
  await expect(classificados.nth(0)).toContainText("1 justificada");
  await expect(classificados.nth(1)).toContainText("1 justificada");

  await todas.click();
  await expect(classificados).toHaveCount(2);
  await expect(classificados.nth(0)).toContainText("2 faltas");

  await page.setViewportSize({ width: 360, height: 780 });
  await expect(grupo).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mostra mensagem própria quando o ranking escolhido não tem alunos", async ({ page }) => {
  const { painel, chamada } = await abrir(page);
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    const mes = new URL(rota.request().url()).searchParams.get("mes");
    await rota.fulfill({ json: { frequencias: [{ ...chamada, dia: `${mes}-01` }] } });
  });
  await painel.getByRole("button", { name: "Mês anterior do resumo" }).click();
  const ranking = painel.getByRole("region", { name: "Alunos com mais faltas", exact: true });
  await ranking.getByRole("button", { name: "Justificadas (FJ)", exact: true }).click();
  await expect(ranking.getByText("Nenhuma falta justificada neste filtro.")).toBeVisible();
  await expect(ranking.getByRole("listitem")).toHaveCount(0);
});

test("oculta indicadores antigos na falha e recupera o mês pela atualização", async ({ page }) => {
  const { painel, chamada } = await abrir(page);
  let falhar = false;
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    if (falhar)
      await rota.fulfill({ status: 503, json: { error: "Falha de teste ao carregar o mês." } });
    else {
      const mes = new URL(rota.request().url()).searchParams.get("mes");
      await rota.fulfill({ json: { frequencias: [{ ...chamada, dia: `${mes}-01` }] } });
    }
  });
  await painel.getByRole("button", { name: "Atualizar resumo" }).click();
  await expect(painel.locator("dd")).toHaveText(["1", "0", "50%"]);
  falhar = true;
  await painel.getByRole("button", { name: "Mês anterior do resumo" }).click();
  await expect(painel.getByRole("alert")).toBeVisible();
  await expect(painel.locator("dd")).toHaveCount(0);
  await expect(painel.getByText(/Nenhuma chamada registrada/)).toHaveCount(0);
  falhar = false;
  await painel.getByRole("button", { name: "Atualizar resumo" }).click();
  await expect(painel.getByRole("alert")).toHaveCount(0);
  await expect(painel.locator("dd")).toHaveText(["1", "0", "50%"]);
});

test("descarta a resposta atrasada de um mês anterior", async ({ page }) => {
  const { painel, chamada } = await abrir(page);
  let primeiraUrl = "";
  let liberar: () => void = () => undefined;
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await page.route("**/api/frequencias?mes=**", async (rota) => {
    const url = rota.request().url();
    const mes = new URL(url).searchParams.get("mes");
    if (!primeiraUrl) {
      primeiraUrl = url;
      await espera;
    }
    await rota.fulfill({ json: { frequencias: [{ ...chamada, dia: `${mes}-01` }] } });
  });
  try {
    await page.getByRole("tab", { name: "Histórico", exact: true }).click();
    const historico = page.getByRole("region", { name: "Histórico de frequências", exact: true });
    await historico.getByRole("button", { name: "Mês anterior", exact: true }).click();
    await expect.poll(() => primeiraUrl).not.toBe("");
    await page.getByRole("tab", { name: "Resumo", exact: true }).click();
    await expect(painel.getByRole("status")).toHaveText("Carregando resumo...");
    await expect(painel.locator("dd")).toHaveCount(0);
    await page.getByRole("tab", { name: "Histórico", exact: true }).click();
    await historico.getByRole("button", { name: "Mês anterior", exact: true }).click();
    await page.getByRole("tab", { name: "Resumo", exact: true }).click();
    await expect(painel.locator("dd")).toHaveText(["1", "0", "50%"]);
    const respostaAntiga = page.waitForResponse((resposta) => resposta.url() === primeiraUrl);
    liberar();
    await (await respostaAntiga).finished();
    // Aguarda o ciclo de renderização após a entrega da resposta atrasada.
    await page.evaluate(
      () =>
        new Promise<void>((resolver) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolver())),
        ),
    );
    await expect(painel.locator("dd")).toHaveText(["1", "0", "50%"]);
  } finally {
    liberar();
  }
});
