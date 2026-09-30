// Seletor de horário próprio, abas de saídas e entradas com estado na URL e
// horário na saída, em desktop e em 360 px.
import { test, expect } from "@playwright/test";
import { criarMassaE2E, criarLiberadoresE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, escolherHorario, trocarVisao } from "./helpers/pagina";

test.beforeAll(async () => {
  await criarMassaE2E();
  await criarLiberadoresE2E();
});
test.afterAll(limparMassaE2E);

test("abas refletem a URL e sobrevivem ao recarregamento", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  await expect(page.getByRole("tab", { name: "Saídas", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Registrar saída" })).toBeVisible();
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await expect(page).toHaveURL(/visao=saidas/);
  await expect(page).toHaveURL(/aba=entradas/);

  await page.reload();
  await aguardarHidratacao(page);
  await expect(page.getByRole("tab", { name: "Entradas", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#entrada-horario")).toBeVisible();

  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await expect(page.getByRole("tab", { name: "Saídas", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await trocarVisao(page, "Painel", "painel");
  await expect(page).not.toHaveURL(/aba=/);
});

test("saídas e entradas têm o mesmo campo de horário e o título não tem ícone", async ({
  page,
}) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saiu mais cedo" }).locator("svg"),
  ).toHaveCount(0);
  await expect(page.locator("#saida-horario")).toBeVisible();
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await expect(page.locator("#entrada-horario")).toBeVisible();
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
});

test("seletor de horário: teclado, foco e fechamento", async ({ page }) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  const gatilho = page.locator("#saida-horario");
  await gatilho.click();
  const painel = page.getByRole("dialog", { name: "Horário da saída" });
  await expect(painel).toBeVisible();
  await expect(gatilho).toHaveAttribute("aria-expanded", "true");
  // O foco inicial cai na hora selecionada; a seta troca de coluna e Enter escolhe.
  await expect(painel.getByRole("option", { selected: true }).first()).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Enter");
  await expect(painel).toHaveCount(0);
  await expect(gatilho).toContainText("01:06");
  await expect(gatilho).toBeFocused();

  await gatilho.click();
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(gatilho).toBeFocused();
});

test("registra a saída com o horário escolhido e mostra na lista", async ({ page }) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await page.locator("#saida-turma").click();
  await page.getByRole("option", { name: "E2E Ano A" }).click();
  await page.locator("#saida-aluno").click();
  await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
  await page.locator("#saida-momento").click();
  await page.getByRole("option", { name: "1ª aula" }).click();
  await escolherHorario(page, "#saida-horario", "09:20");
  await page.locator("#saida-justificativa").click();
  await page.getByRole("option", { name: "D · Doente" }).click();
  await page.locator("#saida-responsavel").click();
  await page.getByRole("option", { name: "Diretor E2E" }).click();
  await page.getByRole("button", { name: "Registrar saída" }).click();
  await expect(page.getByText("Saída registrada.")).toBeVisible();
  await page.getByRole("button", { name: /E2E Ano A.*aluno/ }).click();
  await expect(page.getByText(/09:20 · 1ª aula/).first()).toBeVisible();
});

test("tocar em uma hora atualiza o campo na hora e mantém o painel nos minutos", async ({
  page,
}) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  const gatilho = page.locator("#saida-horario");
  await gatilho.click();
  const painel = page.getByRole("dialog", { name: "Horário da saída" });
  const horas = painel.getByRole("listbox", { name: "Horas" });
  await horas.getByRole("option", { name: "07", exact: true }).click();
  await expect(gatilho).toContainText(/^07:/);
  await expect(horas.getByRole("option", { name: "07", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(painel).toBeVisible();
  await horas.getByRole("option", { name: "19", exact: true }).click();
  await expect(gatilho).toContainText(/^19:/);
  await painel
    .getByRole("listbox", { name: "Minutos" })
    .getByRole("option", { name: "45", exact: true })
    .click();
  await expect(painel).toHaveCount(0);
  await expect(gatilho).toContainText("19:45");
});

test.describe("360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("popover cabe na tela e a página não rola na horizontal", async ({ page }) => {
    await page.goto("/?visao=saidas&aba=entradas");
    await aguardarHidratacao(page);
    await page.locator("#entrada-horario").click();
    const painel = page.getByRole("dialog", { name: "Horário da chegada" });
    await expect(painel).toBeVisible();
    const caixa = await painel.boundingBox();
    expect(caixa).not.toBeNull();
    expect((caixa?.x ?? -1) >= 0).toBe(true);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0) <= 360).toBe(true);
    // Área de toque confortável: cada item tem ao menos 44 px de altura.
    const opcao = painel.getByRole("listbox", { name: "Horas" }).getByRole("option").first();
    // offsetHeight ignora a escala da animação de abertura (zoom-in-95), que
    // deixava o boundingBox em 42 a 44 px durante os primeiros quadros.
    expect(
      await opcao.evaluate((elemento) => (elemento as HTMLElement).offsetHeight),
    ).toBeGreaterThanOrEqual(44);
    const estouro = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(estouro).toBe(false);
  });
});
