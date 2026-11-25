// Seletor de horário próprio, abas de saídas e entradas com estado na URL e
// horário na saída, em desktop e em 360 px.
import { test, expect } from "@playwright/test";
import { criarMassaE2E, criarLiberadoresE2E, limparMassaE2E } from "../helpers/banco";
import {
  abrirDiaSeResumo,
  aguardarHidratacao,
  escolherHorario,
  prepararChamadaParaSaida,
  registrarSaida,
  trocarVisao,
} from "../helpers/pagina";

test.beforeAll(async () => {
  await criarMassaE2E();
  await criarLiberadoresE2E();
});
test.afterAll(limparMassaE2E);

test("abas refletem a URL e sobrevivem ao recarregamento", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
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
  await abrirDiaSeResumo(page);
  await expect(page.getByRole("tab", { name: "Entradas", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("group", { name: "Horário da chegada" })).toBeVisible();

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
  await abrirDiaSeResumo(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saiu mais cedo" }).locator("svg"),
  ).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Horário da saída" })).toBeVisible();
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await abrirDiaSeResumo(page);
  await expect(page.getByRole("group", { name: "Horário da chegada" })).toBeVisible();
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
});

test("seletor de horário: teclado, foco e fechamento", async ({ page }) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await abrirDiaSeResumo(page);
  const campo = page
    .locator("#saida-horario")
    .locator('xpath=ancestor::div[contains(@class,"MuiPickersInputBase-root")]')
    .first();
  const botao = campo.getByRole("button", { name: /^Escolha uma hora/ });
  const gatilho = page.locator("#saida-horario");
  await botao.click();
  const painel = page.getByRole("dialog", { name: "Horário da saída" });
  await expect(painel).toBeVisible();
  // O foco inicial cai na hora selecionada; a seta troca de coluna e Enter escolhe.
  await expect(painel.getByRole("option", { selected: true }).first()).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Enter");
  await painel.getByRole("button", { name: "OK", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(painel).toHaveCount(0);
  await expect(gatilho).toHaveValue("01:05");
  await expect(botao).toBeFocused();

  await botao.click();
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(botao).toBeFocused();
});

test("registra a saída com o horário escolhido e mostra na lista", async ({ page }) => {
  await prepararChamadaParaSaida(page, "E2E Ano A");
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await abrirDiaSeResumo(page);
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
  await registrarSaida(page);
  await expect(page.getByText("Saída registrada.")).toBeVisible();
  const itens = page.getByRole("list", { name: /^Saídas de / });
  await expect(itens.getByText("09:20", { exact: true }).first()).toBeVisible();
  await expect(itens.getByText("1ª aula", { exact: true }).first()).toBeVisible();
});

test("tocar em uma hora atualiza o campo na hora e mantém o painel nos minutos", async ({
  page,
}) => {
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  await abrirDiaSeResumo(page);
  const campo = page
    .locator("#saida-horario")
    .locator('xpath=ancestor::div[contains(@class,"MuiPickersInputBase-root")]')
    .first();
  const gatilho = page.locator("#saida-horario");
  await campo.getByRole("button", { name: /^Escolha uma hora/ }).click();
  const painel = page.getByRole("dialog", { name: "Horário da saída" });
  const horas = painel.getByRole("listbox", { name: /horas/i });
  const primeiraHora = horas.getByRole("option").first();
  const horaEscolhida = (await primeiraHora.textContent())?.trim() ?? "";
  await primeiraHora.click();
  await expect(gatilho).toHaveValue(new RegExp(`^${horaEscolhida}:`));
  await expect(painel).toBeVisible();
  const minutos = painel.getByRole("listbox", { name: /minutos/i });
  const primeiroMinuto = minutos.getByRole("option").first();
  const minutoEscolhido = (await primeiroMinuto.textContent())?.trim() ?? "";
  await primeiroMinuto.click();
  await painel.getByRole("button", { name: "OK", exact: true }).click();
  await expect(painel).toHaveCount(0);
  await expect(gatilho).toHaveValue(`${horaEscolhida}:${minutoEscolhido}`);
});

test.describe("360 px", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("popover cabe na tela e a página não rola na horizontal", async ({ page }) => {
    await page.goto("/?visao=saidas&aba=entradas");
    await aguardarHidratacao(page);
    await abrirDiaSeResumo(page);
    const campo = page
      .locator("#entrada-horario")
      .locator('xpath=ancestor::div[contains(@class,"MuiPickersInputBase-root")]')
      .first();
    await campo.getByRole("button", { name: /^Escolha uma hora/ }).click();
    const painel = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("listbox", { name: /horas/i }) });
    await expect(painel).toBeVisible();
    const caixa = await painel.boundingBox();
    expect(caixa).not.toBeNull();
    expect((caixa?.x ?? -1) >= 0).toBe(true);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0) <= 360).toBe(true);
    // Área de toque confortável: cada item tem ao menos 44 px de altura.
    const opcao = painel.getByRole("listbox", { name: /horas/i }).getByRole("option").first();
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
