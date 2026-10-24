// Fumaça do shell: troca de visão pela navegação e tema.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import {
  abrirNavegacao,
  abrirSeletorTema,
  aguardarHidratacao,
  trocarVisao,
} from "./helpers/pagina";

test.describe("navegação", () => {
  test("troca de visão pela navegação", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.getByRole("heading", { name: "Chamada" })).toBeVisible();
    await trocarVisao(page, "Horários", "horarios");
    await expect(
      page.getByRole("region", { name: "Horários semanais", exact: true }),
    ).toBeVisible();
    await trocarVisao(page, "Relatórios", "relatorios");
    await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible();
    await page.getByRole("tab", { name: "Grade" }).click();
    await expect(page.getByRole("heading", { name: "Grade" })).toBeVisible();
    await trocarVisao(page, "Gestão", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão" })).toBeVisible();
  });

  test("troca de visão só pelos botões, sem gesto horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.getByRole("heading", { name: "Chamada" })).toBeVisible();
    await trocarVisao(page, "Painel", "painel");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  });

  test("a troca de visão é instantânea", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: "Chamada", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada");
    await expect(page.getByRole("heading", { name: "Chamada" })).toBeVisible();
  });

  test("alterna o tema pelo menu de três opções", async ({ page }, info) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    // O seletor fica no cabeçalho no celular e no cartão da barra lateral no desktop.
    await aguardarHidratacao(page, 'button[aria-label*="tema" i]');
    const inicioEscuro = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
    const alvo = inicioEscuro ? "Claro" : "Escuro";
    const temas = await abrirSeletorTema(page);
    await expect(temas.getByRole("radio")).toHaveCount(3);
    await temas.getByRole("radio", { name: alvo, exact: true }).click();
    await expect(page.locator("html")).toHaveClass(new RegExp(inicioEscuro ? "light" : "dark"));
    await page.keyboard.press("Escape");
    await expect(temas).toBeHidden();
    await info.attach(`menu-tema-${alvo.toLocaleLowerCase("pt-BR")}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  });

  test("o menu marca a visão ativa e fecha após a seleção no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator('[data-indicador="inferior"]')).toHaveCount(0);
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
    const navegacao = await abrirNavegacao(page);
    await expect(navegacao.getByRole("button", { name: "Chamada", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await navegacao.getByRole("button", { name: "Chamada", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
  });

  test("um link direto para Gestão mantém o painel ativo no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    await expect(page.locator("main")).toHaveAttribute("data-visao", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
    const navegacao = await abrirNavegacao(page);
    await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  // A massa permite conferir os registros ao alternar entre as seções.
  test.describe("com turmas cadastradas", () => {
    test.beforeAll(criarMassaE2E);
    test.afterAll(limparMassaE2E);

    test("no celular, Gestão fica no menu e segue acessível entre as visões", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await aguardarHidratacao(page);
      let navegacao = await abrirNavegacao(page);
      const gestao = navegacao.getByRole("button", { name: "Gestão", exact: true });
      await expect(gestao).toBeVisible();
      await expect(page.locator("header").getByRole("button", { name: "Gestão" })).toHaveCount(0);

      await trocarVisao(page, "Gestão", "gestao");
      await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
      navegacao = await abrirNavegacao(page);
      await expect(gestao).toHaveAttribute("aria-current", "page");
      await expect(navegacao.locator("[aria-current=page]")).toHaveCount(1);
      await expect(page.locator('[data-indicador="inferior"]')).toHaveCount(0);

      await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
      navegacao = await abrirNavegacao(page);
      await expect(gestao).not.toHaveAttribute("aria-current", "page");
      await expect(
        navegacao.getByRole("button", { name: "Chamada", exact: true }),
      ).not.toHaveAttribute("aria-current", "page");
      await expect(
        navegacao.getByRole("button", { name: "Chamada Parcial", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await trocarVisao(page, "Gestão", "gestao");
      await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
    });

    test("a Chamada Parcial tem item próprio logo abaixo de Chamada", async ({ page }, info) => {
      for (const largura of [1280, 390, 360]) {
        await page.setViewportSize({ width: largura, height: 844 });
        await page.goto("/");
        await aguardarHidratacao(page);
        let navegacao = await abrirNavegacao(page);
        const rotulos = await navegacao.getByRole("button").allTextContents();
        const indice = rotulos.indexOf("Chamada");
        expect(rotulos[indice + 1]).toBe("Chamada Parcial");
        expect(rotulos[indice + 2]).toBe("Horários");
        await trocarVisao(page, "Chamada", "chamada");
        await expect(
          page
            .locator('section[aria-label="Fazer chamada"]')
            .getByRole("button", { name: "Chamada Parcial", exact: true }),
        ).toHaveCount(0);
        await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
        await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
        navegacao = await abrirNavegacao(page);
        await expect(
          navegacao.getByRole("button", { name: "Chamada Parcial", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(
          navegacao.getByRole("button", { name: "Chamada", exact: true }),
        ).not.toHaveAttribute("aria-current", "page");
        await expect(navegacao.locator("[aria-current=page]")).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await info.attach(`chamada-parcial-menu-${largura}`, {
          body: await page.screenshot({ animations: "disabled" }),
          contentType: "image/png",
        });
        await trocarVisao(page, "Chamada", "chamada");
      }
    });
  });
});
