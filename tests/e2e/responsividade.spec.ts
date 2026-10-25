// Responsividade: navegação, largura de leitura no desktop e formulários
// centralizados em telas pequenas.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { abrirNavegacao, aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("responsividade", () => {
  test("no celular usa o menu lateral e centraliza os formulários", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toHaveCount(0);
    await expect(page.locator("aside")).toBeHidden();
    const cabecalho = page.getByRole("banner");
    const abrir = cabecalho.getByRole("button", { name: "Abrir menu", exact: true });
    const notificacoes = cabecalho.getByRole("button", {
      name: "Configurar notificações",
      exact: true,
    });
    const atualizar = cabecalho.getByRole("button", { name: "Atualizar tela", exact: true });
    const caixaAbrir = await abrir.boundingBox();
    const caixaAtualizar = await atualizar.boundingBox();
    const caixaNotificacoes = await notificacoes.boundingBox();
    expect(caixaAbrir).not.toBeNull();
    expect(caixaAtualizar).not.toBeNull();
    expect(caixaNotificacoes).not.toBeNull();
    expect((caixaAbrir?.x ?? 0) + (caixaAbrir?.width ?? 0)).toBeLessThanOrEqual(
      caixaAtualizar?.x ?? 0,
    );
    expect((caixaAtualizar?.x ?? 0) + (caixaAtualizar?.width ?? 0)).toBeLessThanOrEqual(
      caixaNotificacoes?.x ?? 0,
    );

    const semEstouro = await cabecalho.evaluate(
      (elemento) => elemento.scrollWidth <= elemento.clientWidth + 1,
    );
    expect(semEstouro).toBe(true);
    const tema = cabecalho.getByRole("button", { name: /tema/i });
    const caixaTema = await tema.boundingBox();
    expect(caixaTema).not.toBeNull();
    expect((caixaAtualizar?.x ?? 0) + (caixaAtualizar?.width ?? 0)).toBeLessThanOrEqual(
      caixaTema?.x ?? 0,
    );
    expect((caixaTema?.x ?? 0) + (caixaTema?.width ?? 0)).toBeLessThanOrEqual(
      caixaNotificacoes?.x ?? 0,
    );
    await expect(cabecalho.getByRole("button")).toHaveCount(4);
    await expect(page.locator("main").locator("+ nav")).toHaveCount(0);
    await info.attach("conteudo-mobile-390", {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
    const navegacao = await abrirNavegacao(page);
    await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toBeVisible();
    await info.attach("menu-mobile-390", {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });

    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("button", { name: "Nova série" }).click();
    const caixa = await page.locator('[data-slot="dialog-content"]').boundingBox();
    expect(caixa).not.toBeNull();
    // O formulário fica centralizado na tela, como no desktop.
    const centro = (caixa?.y ?? 0) + (caixa?.height ?? 0) / 2;
    expect(Math.abs(centro - 422)).toBeLessThan(30);
  });

  test("no desktop usa a barra lateral", async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Seções do aplicativo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toHaveCount(0);

    // As ações da conta cabem na barra lateral, sem estourar a largura.
    const semEstouro = await page
      .locator("aside")
      .evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1);
    expect(semEstouro).toBe(true);
    const asideCaixa = await page.locator("aside").boundingBox();
    const sairCaixa = await page.getByRole("button", { name: /^Conta de / }).boundingBox();
    expect((sairCaixa?.x ?? 0) + (sairCaixa?.width ?? 0)).toBeLessThanOrEqual(
      (asideCaixa?.x ?? 0) + (asideCaixa?.width ?? 0) + 1,
    );

    // O símbolo acompanha a coluna dos ícones da navegação, sem deslocamento.
    const marca = await page.locator('aside img[src$="icon.svg"]').first().boundingBox();
    const primeiroIcone = await page.locator("aside nav button svg").first().boundingBox();
    expect(marca).not.toBeNull();
    expect(primeiroIcone).not.toBeNull();
    const centroMarca = (marca?.x ?? 0) + (marca?.width ?? 0) / 2;
    const centroIcone = (primeiroIcone?.x ?? 0) + (primeiroIcone?.width ?? 0) / 2;
    expect(Math.abs(centroMarca - centroIcone)).toBeLessThanOrEqual(2);
    await info.attach("barra-lateral-desktop", {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  });

  for (const [largura, altura] of [
    [320, 568],
    [800, 600],
    [844, 390],
  ] as const) {
    test(`em ${largura} por ${altura} px, o menu permite alcançar todas as ações`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: largura, height: altura });
      await page.goto("/");
      await abrirNavegacao(page);
      const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
      await expect.poll(async () => (await menu.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0);
      const caixa = await menu.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((caixa?.x ?? 0) + (caixa?.width ?? Infinity)).toBeLessThanOrEqual(largura + 1);
      expect((caixa?.y ?? 0) + (caixa?.height ?? Infinity)).toBeLessThanOrEqual(altura + 1);
      expect(
        await menu.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const fechar = menu.getByRole("button", { name: "Fechar menu", exact: true });
      await expect(fechar).toBeInViewport();
      await expect(menu.getByRole("button", { name: /tema/i })).toHaveCount(0);
      expect(caixa?.width ?? Infinity).toBeLessThanOrEqual(240 + 1);
      for (const nome of ["Gestão"]) {
        const acao = menu.getByRole("button", { name: nome, exact: true });
        await acao.scrollIntoViewIfNeeded();
        await expect(acao).toBeInViewport();
        const tamanho = await acao.boundingBox();
        expect(tamanho?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      const perfil = menu.getByRole("button", { name: /^Conta de / });
      await perfil.scrollIntoViewIfNeeded();
      await expect(perfil).toBeInViewport();
      expect((await perfil.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await perfil.click();
      const conta = page.getByRole("menu", { name: "Conta", exact: true });
      for (const nome of ["Trocar senha", "Sair da conta"]) {
        const acao = conta.getByRole("menuitem", { name: nome, exact: true });
        await expect(acao).toBeInViewport();
        // O popover abre com zoom; aguarda o tamanho final do alvo de toque.
        await expect
          .poll(async () => (await acao.boundingBox())?.height ?? 0)
          .toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Escape");
      await expect(conta).toBeHidden();
      await info.attach(`menu-${largura}-${altura}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      });
      await fechar.click();
      await expect(menu).toBeHidden();
      await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
      const cabecalho = page.getByRole("banner");
      expect(
        await cabecalho.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1),
      ).toBe(true);
    });
  }

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

    // A marca e o título acompanham o centro do cartão, não só o espaço restante.
    const cartao = await page.locator("main .superficie").first().boundingBox();
    const titulo = await page
      .getByRole("heading", { name: "FrequenciApp", exact: true })
      .boundingBox();
    const marca = await page.locator('main img[src$="icon.svg"]').first().boundingBox();
    expect(cartao).not.toBeNull();
    expect(titulo).not.toBeNull();
    expect(marca).not.toBeNull();
    const centroCartao = (cartao?.x ?? 0) + (cartao?.width ?? 0) / 2;
    const centroTitulo = (titulo?.x ?? 0) + (titulo?.width ?? 0) / 2;
    const centroMarca = (marca?.x ?? 0) + (marca?.width ?? 0) / 2;
    expect(Math.abs(centroCartao - centroTitulo)).toBeLessThanOrEqual(1);
    expect(Math.abs(centroCartao - centroMarca)).toBeLessThanOrEqual(1);
  });
  // A massa permite conferir a largura das listas de frequência.
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
        ["Chamada Parcial", "chamada-parcial", 1152],
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
