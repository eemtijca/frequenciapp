// Fumaça do shell: troca de visão pela navegação e tema.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("navegação", () => {
  test("troca de visão pela navegação", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.getByRole("heading", { name: "Chamada" })).toBeVisible();
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

  test("alterna o tema pelo menu de três opções", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
    await aguardarHidratacao(page, 'button[aria-label*="tema" i]');
    const inicioEscuro = await page.locator("html").evaluate((el) => el.classList.contains("dark"));
    const alvo = inicioEscuro ? "Claro" : "Escuro";
    // A hidratação pode demorar; repetir a escolha até o tema mudar resolve.
    await expect
      .poll(
        async () => {
          const botao = page.getByRole("button", { name: /tema/i }).first();
          if (await botao.isVisible().catch(() => false))
            await botao.click().catch(() => undefined);
          const opcao = page.getByRole("radio", { name: alvo });
          if (await opcao.isVisible().catch(() => false))
            await opcao.click().catch(() => undefined);
          return (await page.locator("html").getAttribute("class")) ?? "";
        },
        { timeout: 20_000 },
      )
      .toContain(inicioEscuro ? "light" : "dark");
  });

  test("o indicador inferior marca a visão ativa", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "a barra inferior é do celular");
    await page.goto("/");
    await aguardarHidratacao(page);
    const indicador = page.locator('[data-indicador="inferior"]');
    await expect(indicador).toBeVisible();
    const botoes = page
      .getByRole("navigation", { name: "Seções do aplicativo" })
      .getByRole("button");
    await trocarVisao(page, "Chamada", "chamada");
    const caixaBotao = await botoes.nth(1).boundingBox();
    const caixaIndicador = await indicador.boundingBox();
    expect(caixaBotao).not.toBeNull();
    expect(caixaIndicador).not.toBeNull();
    const centroBotao = (caixaBotao?.x ?? 0) + (caixaBotao?.width ?? 0) / 2;
    const centroIndicador = (caixaIndicador?.x ?? 0) + (caixaIndicador?.width ?? 0) / 2;
    expect(Math.abs(centroIndicador - centroBotao)).toBeLessThan(12);
  });

  test("um link direto para Gestão mantém o painel ativo no celular", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    await expect(page.locator("main")).toHaveAttribute("data-visao", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Gestão" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  // A Chamada Parcial abre pelo ícone da Chamada, que só existe com turmas cadastradas.
  test.describe("com turmas cadastradas", () => {
    test.beforeAll(criarMassaE2E);
    test.afterAll(limparMassaE2E);

    test("no celular, Gestão fica no cabeçalho e segue acessível entre as visões", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await aguardarHidratacao(page);
      const navegacao = page.getByRole("navigation", { name: "Seções do aplicativo" });
      const gestao = page.locator("header").getByRole("button", { name: "Gestão", exact: true });
      await expect(gestao).toBeVisible();
      await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toHaveCount(0);

      await trocarVisao(page, "Gestão", "gestao");
      await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
      await expect(gestao).toHaveAttribute("aria-current", "page");
      await expect(navegacao.locator("[aria-current=page]")).toHaveCount(0);
      await expect(page.locator('[data-indicador="inferior"]')).toHaveCount(0);

      await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
      await expect(gestao).not.toHaveAttribute("aria-current", "page");
      await expect(navegacao.getByRole("button", { name: "Chamada Parcial" })).toHaveCount(0);
      await expect(navegacao.getByRole("button", { name: "Chamada", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await trocarVisao(page, "Gestão", "gestao");
      await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
    });

    test("a Chamada Parcial abre por um ícone ao lado do Resumo, sem item na navegação", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await aguardarHidratacao(page);
      const navegacao = page.getByRole("navigation", { name: "Seções do aplicativo" });
      await expect(navegacao.getByRole("button", { name: "Chamada Parcial" })).toHaveCount(0);
      await trocarVisao(page, "Chamada", "chamada");
      const chamada = page.locator('section[aria-label="Fazer chamada"]');
      const icone = chamada.getByRole("button", { name: "Chamada Parcial", exact: true });
      const resumo = chamada.getByRole("button", { name: /^Resumo d/ });
      await expect(icone).toBeVisible();
      await expect(icone).toHaveText("");
      const [caixaResumo, caixaIcone] = await Promise.all([
        resumo.boundingBox(),
        icone.boundingBox(),
      ]);
      expect(caixaResumo).not.toBeNull();
      expect(caixaIcone).not.toBeNull();
      if (caixaResumo && caixaIcone) {
        // Aos sábados o resumo divide a linha com a liberação e o ícone desce para a linha seguinte.
        const sabado = await chamada
          .getByRole("button", { name: /^(Desbloquear sábado letivo|Sábado letivo)$/ })
          .count();
        if (sabado > 0) {
          expect(caixaIcone.y).toBeGreaterThanOrEqual(caixaResumo.y + caixaResumo.height - 1);
        } else {
          expect(Math.abs(caixaResumo.y - caixaIcone.y)).toBeLessThan(8);
          expect(caixaIcone.x).toBeGreaterThan(caixaResumo.x + caixaResumo.width);
        }
        expect(caixaIcone.x + caixaIcone.width).toBeLessThanOrEqual(390);
      }
      await page.setViewportSize({ width: 360, height: 780 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.setViewportSize({ width: 390, height: 844 });

      await icone.click();
      await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada-parcial");
      await expect(navegacao.getByRole("button", { name: "Chamada", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await trocarVisao(page, "Chamada", "chamada");
      await expect(navegacao.getByRole("button", { name: "Chamada", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });
});
