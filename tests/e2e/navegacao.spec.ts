// Fumaça do shell: troca de visão pela navegação, deslize e tema.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, rolarPager, trocarVisao } from "./helpers/pagina";

test.describe("navegação", () => {
  test("troca de visão pela navegação", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Frequência diária" })).toBeVisible();
    await trocarVisao(page, "Histórico", "historico");
    await expect(page.getByRole("heading", { name: "Histórico" })).toBeVisible();
    await trocarVisao(page, "Grade", "grade");
    await expect(page.getByRole("heading", { name: "Grade do mês" })).toBeVisible();
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
      .toBe("historico");
    await expect
      .poll(
        async () => {
          await rolarPager(page, 0);
          return page.locator("main").getAttribute("data-visao");
        },
        { timeout: 20_000 },
      )
      .toBe("frequencia");
  });

  test("alterna o tema pelo menu de três opções", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Frequência diária" })).toBeVisible();
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
});
