// Grade real com totais do período, S com proporção, detalhe expansível e PDF.
import {
  chromium,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let navegador: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/grade-relatorio.html");
  navegador = await chromium.launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function abrirGrade(page: Page): Promise<Locator> {
  await page.route("**/api/**", async (rota) => {
    const pedido = rota.request();
    if (pedido.method() === "GET" && new URL(pedido.url()).pathname === "/api/planilha/estado") {
      await rota.fulfill({ json: { estado: { ativa: false, podeEnviar: false } } });
      return;
    }
    await rota.abort();
  });
  await page.goto(servidor.url);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const grade = page.getByRole("region", { name: "Grade de frequência", exact: true });
  await esperar(
    grade.getByRole("rowheader", { name: "Aluno A atual 1º ano A", exact: true }),
  ).toBeVisible();
  return grade;
}

function linha(grade: Locator, nome: string): Locator {
  return grade.getByRole("rowheader", { name: new RegExp(`^${nome} atual`) }).locator("xpath=..");
}

it("mostra F, FJ, S e Histórico do período e detalha as aulas", async () => {
  const page = await navegador.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const grade = await abrirGrade(page);
    await esperar(grade.locator('thead th[data-resumo="periodo"]')).toHaveText("No período");
    await esperar(grade.locator('thead th[data-resumo="historico"]')).toHaveText("Histórico");

    const a = linha(grade, "Aluno A");
    await esperar(a.locator('[data-resumo="faltas"]')).toHaveText("0");
    await esperar(a.locator('[data-resumo="justificadas"]')).toHaveText("1");
    await esperar(a.locator('[data-resumo="parciais"]')).toHaveText("1");
    await esperar(a.locator('[data-resumo="historico"]')).toHaveText("7");

    const s = a.getByRole("img", {
      name: "Aluno A presente em parte das aulas em 2026-11-04, 1 de 3 aulas",
    });
    await esperar(s).toBeVisible();
    await esperar(s).toContainText("1/3");

    await a.getByRole("button", { name: "Ver faltas de Aluno A no período" }).click();
    await esperar(
      grade.getByText("No período: 0 F, 1 FJ e 1 S em 4 dias com registro."),
    ).toBeVisible();
    await esperar(grade.getByText("03/11/2026")).toBeVisible();
    await esperar(grade.getByText("Todas as aulas (3)")).toBeVisible();
    await esperar(grade.getByText("Justificativa: Doente")).toBeVisible();
    await esperar(grade.getByText("1 de 3: 1ª aula · 07:00 às 07:50")).toBeVisible();
    await grade.getByRole("button", { name: "Recolher faltas de Aluno A no período" }).click();
    await esperar(grade.getByText("03/11/2026")).toHaveCount(0);

    const c = linha(grade, "Aluno C");
    await c.getByRole("button", { name: "Ver faltas de Aluno C no período" }).click();
    await esperar(grade.getByText("Sem faltas no período.")).toBeVisible();
    await grade.getByRole("button", { name: "Recolher faltas de Aluno C no período" }).click();
  } finally {
    await page.close();
  }
});

it("abre o diálogo do relatório em PDF", async () => {
  const page = await navegador.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const grade = await abrirGrade(page);
    await grade.getByRole("button", { name: "Emitir relatório em PDF da turma de origem" }).click();
    const dialogo = page.getByRole("dialog", { name: "Preparar download" });
    await esperar(dialogo).toBeVisible();
    await esperar(dialogo.getByLabel("ZIP protegido por senha")).toBeChecked();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await esperar(dialogo).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally {
    await page.close();
  }
});
