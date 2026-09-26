// Fumaça do shell: troca de visão pela navegação e tema.
import { expect, test } from "@playwright/test";
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
    await page.getByRole("button", { name: "Chamada" }).click();
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
});
