// Resumo semanal: calendário, seções recolhíveis, atualização e filtros das movimentações.
import { expect, test, type Page } from "@playwright/test";
import { diaLocal, diaSeguinte, ehDomingo, rotuloDataCurta } from "@/domain/frequencia";
import { semanaEncerrada } from "@/domain/resumo-semana";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { abrirDiaSeResumo, aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");

test.beforeAll(async () => {
  await criarMassaE2E();
});

test.afterAll(async () => {
  await limparMassaE2E();
});

function ultimoDomingo(): string {
  let dia = hoje;
  while (!ehDomingo(dia)) dia = diaSeguinte(dia, -1);
  return dia;
}

async function escolherDomingo(page: Page, seletor: string, domingo: string): Promise<void> {
  await page.locator(seletor).click();
  const calendario = page.getByRole("dialog").last();
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    if (await calendario.locator(`[data-dia="${domingo}"]`).count()) break;
    await calendario.getByRole("button", { name: "Mês anterior", exact: true }).click();
  }
  await calendario.locator(`[data-dia="${domingo}"]`).click();
  await expect(calendario).toBeHidden();
}

test("o Painel abre a semana escolhida com a Visão geral aberta e as demais seções recolhidas", async ({
  page,
}) => {
  const domingo = ultimoDomingo();
  const semana = semanaEncerrada(domingo) ?? [];
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel", { manterResumo: true });
  await escolherDomingo(page, "#dia-painel", domingo);

  const resumo = page.getByRole("region", { name: "Resumo da semana", exact: true });
  await expect(resumo).toBeVisible();
  await expect(resumo).toContainText(
    `${rotuloDataCurta(semana[0] ?? "")} a ${rotuloDataCurta(semana[5] ?? "")}`,
  );
  await expect(resumo.getByText(/Atualizado às \d{2}:\d{2}/)).toBeVisible();

  const visao = resumo.locator('[data-secao$="-visao"]').first();
  await expect(visao).toHaveAttribute("data-state", "open");
  const movimentacoes = resumo.locator('[data-secao="resumo-movimentacoes"]');
  await expect(movimentacoes).toHaveAttribute("data-state", "closed");
  const pendencias = resumo.locator('[data-secao="resumo-pendenciasSeduc"]');
  await expect(pendencias).toHaveAttribute("data-state", "closed");

  await movimentacoes.locator("button").first().click();
  await expect(movimentacoes).toHaveAttribute("data-state", "open");
  await expect(movimentacoes).toContainText("Nenhuma movimentação nesta semana.");
  await pendencias.locator("button").first().click();
  await expect(pendencias).toHaveAttribute("data-state", "open");
  await expect(pendencias).toContainText("Nenhuma pendência na Seduc nesta semana.");

  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  await expect(movimentacoes).toHaveAttribute("data-state", "open");
  await expect(pendencias).toHaveAttribute("data-state", "open");
});

test("Saídas e Entradas usa o resumo da aba e limpa o filtro de turma ao abrir um dia", async ({
  page,
}) => {
  const domingo = ultimoDomingo();
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");

  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await abrirDiaSeResumo(page);
  const filtro = page.locator("#entrada-turma");
  await expect(filtro).toBeVisible();
  await filtro.click();
  await page.getByRole("option", { name: /^E2E Ano A$/ }).click();
  await expect(filtro).toContainText("E2E Ano A");

  await escolherDomingo(page, "#entrada-dia", domingo);
  const resumo = page.getByRole("region", { name: "Resumo da semana", exact: true });
  await expect(resumo).toBeVisible();
  await expect(resumo).toContainText("Resumo de todas as turmas");
  await expect(resumo).toContainText("Entradas da semana");
  await expect(resumo.locator('[data-secao="resumo-movimentacoes-visao"]')).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect(resumo.locator('[data-secao="resumo-movimentacoes-turmas"]')).toHaveAttribute(
    "data-state",
    "closed",
  );

  await resumo.locator("[data-dia]").first().click();
  await expect(page.locator("#entrada-turma")).toContainText("Todas as turmas");
  await expect(page.getByRole("heading", { name: "Registrar entrada", exact: true })).toBeVisible();
});

test("Saídas também limpa o filtro de turma ao abrir um dia pelo resumo", async ({ page }) => {
  const domingo = ultimoDomingo();
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  const filtro = page.locator("#saida-turma");
  await expect(filtro).toBeVisible();
  await filtro.click();
  await page.getByRole("option", { name: /^E2E Ano A$/ }).click();
  await expect(filtro).toContainText("E2E Ano A");

  await escolherDomingo(page, "#dia-saidas", domingo);
  const resumo = page.getByRole("region", { name: "Resumo da semana", exact: true });
  await expect(resumo).toContainText("Saídas da semana");
  await resumo.locator("[data-dia]").first().click();
  await expect(page.locator("#saida-turma")).toContainText("Todas as turmas");
  await expect(page.getByRole("heading", { name: "Registrar saída", exact: true })).toBeVisible();
});
