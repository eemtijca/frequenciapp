// Verifica fundos contextuais dos controles de navegação e conta.
import { expect, test, type Locator } from "@playwright/test";
import { abrirNavegacao, aguardarHidratacao } from "../helpers/pagina";

async function fundo(elemento: Locator): Promise<string> {
  return elemento.evaluate((no) => getComputedStyle(no).backgroundColor);
}

test.describe("fundos contextuais", () => {
  for (const tema of ["light", "dark"] as const) {
    test(`navegação lateral em ${tema}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      await page.goto("/");
      await aguardarHidratacao(page);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
      const navegacao = await abrirNavegacao(page);
      await page.mouse.move(389, 843);
      const ativo = navegacao.locator('[aria-current="page"]');
      const inativo = navegacao.locator('[role="button"]:not([aria-current="page"])').first();
      await expect(ativo).toHaveCount(1);
      await expect(ativo).toBeFocused();
      expect(await fundo(ativo)).not.toBe("rgba(0, 0, 0, 0)");
      expect(await fundo(inativo)).toBe("rgba(0, 0, 0, 0)");
      const caixa = await inativo.boundingBox();
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
      expect(await fundo(navegacao.getByRole("link", { name: "FrequenciBI, nova aba" }))).toBe(
        "rgba(0, 0, 0, 0)",
      );
      await page.keyboard.press("Tab");
      await expect(inativo).toBeFocused();
      expect(await inativo.evaluate((no) => no.matches(":focus-visible"))).toBe(true);
      expect(
        await inativo.evaluate((no) => {
          const css = getComputedStyle(no);
          return css.outlineStyle !== "none" || css.boxShadow !== "none";
        }),
      ).toBe(true);
    });
  }
});
