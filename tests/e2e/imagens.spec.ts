// Capturas do README: gera as imagens de docs/imagens com a semente aplicada e sem dados reais.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
import { massaDeDemonstracaoPresente } from "./helpers/banco";

const pastaImagens = path.resolve(process.cwd(), "docs/imagens");

/** Abre o Painel em um dia letivo com chamada, voltando quando cai em feriado. */
async function abrirPainelComDados(page: Page) {
  const secao = page.locator('section[aria-label="Painel de frequência"]');
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const feriado = await secao.getByText(/^Feriado$/).count();
    const semChamada = await secao.getByText("Nenhuma chamada salva neste dia").count();
    if (feriado === 0 && semChamada === 0) return;
    await secao.getByLabel("Dia anterior").click();
    await page.waitForTimeout(400);
  }
  throw new Error("Sem dia letivo com chamada. Aplique a semente: pnpm run seed");
}

/** Abre a Chamada em um dia letivo com aulas, voltando quando cai em feriado. */
async function abrirChamadaComDados(page: Page) {
  const secao = page.locator('section[aria-label="Fazer chamada"]');
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const feriado = await secao.getByText(/^Feriado ·/).count();
    const lista = await secao.getByRole("list", { name: "Alunos da chamada", exact: true }).count();
    if (lista > 0 && feriado === 0) {
      // Chamada salva abre bloqueada: a captura mostra a correção liberada.
      const desbloquear = secao.getByRole("button", { name: /^Desbloquear chamada de / });
      if ((await desbloquear.count()) > 0) {
        await desbloquear.click();
        await page.waitForTimeout(300);
      }
      return;
    }
    await secao.getByLabel("Dia anterior").click();
    await page.waitForTimeout(400);
  }
  throw new Error("Sem dia letivo com chamada. Aplique a semente: pnpm run seed");
}

test.describe("Capturas do README", () => {
  test.beforeEach(async () => {
    // A suíte comum roda com a base limpa; as capturas exigem a semente.
    test.skip(
      !(await massaDeDemonstracaoPresente()),
      "Capturas exigem a semente aplicada: pnpm run seed",
    );
  });

  test("painel do dia no desktop, claro e escuro", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Capturas de desktop apenas no Chromium.");
    await mkdir(pastaImagens, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Painel", "painel");
    await page.waitForTimeout(800);
    await abrirPainelComDados(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      path: path.join(pastaImagens, "painel-desktop-claro.png"),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: path.join(pastaImagens, "painel-desktop-escuro.png"),
      animations: "disabled",
    });
  });

  test("chamada no celular, claro e escuro", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "Capturas de celular apenas no mobile-chrome.",
    );
    await mkdir(pastaImagens, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    await abrirChamadaComDados(page);
    await page.waitForTimeout(800);
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      path: path.join(pastaImagens, "chamada-mobile-claro.png"),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: path.join(pastaImagens, "chamada-mobile-escuro.png"),
      animations: "disabled",
    });
  });

  test("relatórios, movimentações e gestão no desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Capturas de desktop apenas no Chromium.");
    await mkdir(pastaImagens, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);

    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Resumo" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(pastaImagens, "relatorios-resumo-desktop.png"),
      animations: "disabled",
    });

    await trocarVisao(page, "Saídas e Entradas", "saidas");
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(pastaImagens, "saidas-entradas-desktop.png"),
      animations: "disabled",
    });

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Turmas" }).click();
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(pastaImagens, "gestao-turmas-desktop.png"),
      animations: "disabled",
    });
  });
});
