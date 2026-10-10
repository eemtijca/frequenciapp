// Responsividade: navegação, largura de leitura no desktop e formulários
// centralizados em telas pequenas.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("responsividade", () => {
  test("no celular usa a navegação inferior e centraliza os formulários", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
    const cabecalho = page.getByRole("banner");
    const gestao = cabecalho.getByRole("button", { name: "Gestão", exact: true });
    const notificacoes = cabecalho.getByRole("button", {
      name: "Configurar notificações",
      exact: true,
    });
    const caixaGestao = await gestao.boundingBox();
    const caixaNotificacoes = await notificacoes.boundingBox();
    expect(caixaGestao).not.toBeNull();
    expect(caixaNotificacoes).not.toBeNull();
    expect((caixaGestao?.x ?? 0) + (caixaGestao?.width ?? 0)).toBeLessThanOrEqual(
      caixaNotificacoes?.x ?? 0,
    );

    const semEstouro = await cabecalho.evaluate(
      (elemento) => elemento.scrollWidth <= elemento.clientWidth + 1,
    );
    expect(semEstouro).toBe(true);

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("button", { name: "Nova série" }).click();
    const caixa = await page.locator('[data-slot="dialog-content"]').boundingBox();
    expect(caixa).not.toBeNull();
    // O formulário fica centralizado na tela, como no desktop.
    const centro = (caixa?.y ?? 0) + (caixa?.height ?? 0) / 2;
    expect(Math.abs(centro - 422)).toBeLessThan(30);
  });

  test("no desktop usa a barra lateral", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();

    // As ações da conta cabem na barra lateral, sem estourar a largura.
    const semEstouro = await page
      .locator("aside")
      .evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1);
    expect(semEstouro).toBe(true);
    const asideCaixa = await page.locator("aside").boundingBox();
    const sairCaixa = await page.getByRole("button", { name: "Sair da conta" }).boundingBox();
    expect((sairCaixa?.x ?? 0) + (sairCaixa?.width ?? 0)).toBeLessThanOrEqual(
      (asideCaixa?.x ?? 0) + (asideCaixa?.width ?? 0) + 1,
    );
  });

  test("as metades do login são simétricas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FrequenciApp" })).toBeVisible();
    const aside = await page.locator("aside").boundingBox();
    const principal = await page.locator("main").boundingBox();
    expect(Math.abs((aside?.width ?? 0) - (principal?.width ?? 0))).toBeLessThanOrEqual(1);
  });

  test("no celular os campos do login têm margem confortável", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "FrequenciApp" })).toBeVisible();
    const campo = await page.locator("#email").boundingBox();
    expect(campo?.width ?? 0).toBeLessThanOrEqual(330);
    expect(campo?.x ?? 0).toBeGreaterThanOrEqual(28);
  });
  // A Chamada Parcial abre pelo ícone da Chamada, que só existe com turmas cadastradas.
  test.describe("com turmas cadastradas", () => {
    test.beforeAll(criarMassaE2E);
    test.afterAll(limparMassaE2E);

    test("em monitor largo, o conteúdo fica centralizado com largura de leitura", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/");
      await aguardarHidratacao(page);
      for (const [rotulo, visao, largura] of [
        ["Painel", "painel", 1024],
        ["Chamada", "chamada", 1152],
        ["Chamada Parcial", "chamada-parcial", 896],
        ["Relatórios", "relatorios", 1280],
        ["Gestão", "gestao", 1152],
      ] as const) {
        await trocarVisao(page, rotulo, visao);
        const painel = page.locator("main > div > section:not([hidden])");
        const caixaPainel = await painel.boundingBox();
        const conteudo = await painel.locator(":scope > div").boundingBox();
        expect(conteudo).not.toBeNull();
        expect(conteudo?.width ?? Infinity).toBeLessThanOrEqual(largura);
        expect(conteudo?.width ?? 0).toBeGreaterThan(700);
        const centroPainel = (caixaPainel?.x ?? 0) + (caixaPainel?.width ?? 0) / 2;
        const centroConteudo = (conteudo?.x ?? 0) + (conteudo?.width ?? 0) / 2;
        expect(Math.abs(centroPainel - centroConteudo)).toBeLessThanOrEqual(1);
      }
    });
  });
});
