// Fumaça do shell: troca de visão pela navegação, deslize e tema.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, rolarPager, trocarVisao } from "./helpers/pagina";

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

  test("desliza o paginador e acompanha a visão ativa", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect
      .poll(
        async () => {
          await rolarPager(page, 1);
          return page.locator("main").getAttribute("data-visao");
        },
        { timeout: 20_000 },
      )
      .toBe("chamada");
    await expect
      .poll(
        async () => {
          await rolarPager(page, 0);
          return page.locator("main").getAttribute("data-visao");
        },
        { timeout: 20_000 },
      )
      .toBe("painel");
  });

  test("no desktop a troca de visão é instantânea", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    const pager = page.locator("[data-pager=principal]");
    await page.getByRole("button", { name: "Chamada" }).click();
    const medida = await pager.evaluate((elemento) => ({
      scrollLeft: elemento.scrollLeft,
      largura: elemento.clientWidth,
    }));
    expect(medida.scrollLeft).toBe(medida.largura);
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

  test("o indicador inferior acompanha a rolagem", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "a barra inferior é do celular");
    await page.goto("/");
    await aguardarHidratacao(page);
    const indicador = page.locator('[data-indicador="inferior"]');
    await expect(indicador).toBeVisible();
    const botoes = page
      .getByRole("navigation", { name: "Seções do aplicativo" })
      .getByRole("button");
    const caixaA = await botoes.nth(0).boundingBox();
    const caixaB = await botoes.nth(1).boundingBox();
    const pager = page.locator("[data-pager=principal]");
    // Sem o encaixe, a rolagem pode parar entre dois painéis e medir o meio.
    await pager.evaluate((elemento) => {
      elemento.style.scrollSnapType = "none";
      elemento.scrollTo({ left: elemento.clientWidth / 2 });
      elemento.dispatchEvent(new Event("scroll"));
    });
    const centroA = (caixaA?.x ?? 0) + (caixaA?.width ?? 0) / 2;
    const centroB = (caixaB?.x ?? 0) + (caixaB?.width ?? 0) / 2;
    const alvo = (centroA + centroB) / 2;
    await expect
      .poll(
        async () => {
          const caixa = await indicador.boundingBox();
          if (!caixa) return 999;
          return Math.abs(caixa.x + caixa.width / 2 - alvo);
        },
        { timeout: 10_000 },
      )
      .toBeLessThan(10);
  });
});
