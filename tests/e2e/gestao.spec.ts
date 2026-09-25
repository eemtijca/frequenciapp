// Abas da Gestão: seleção por toque, deslize do paginador e teclado.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("abas da Gestão", () => {
  test("sincroniza toque, deslize e teclado", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await expect(page.getByRole("tab", { name: "Séries" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "Turmas" }).click();
    await expect(page.getByRole("tab", { name: "Turmas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const pager = page.locator("[data-pager=gestao]");
    await expect
      .poll(
        async () => {
          await pager.evaluate((elemento) => {
            elemento.scrollTo({ left: elemento.clientWidth * 2 });
            elemento.dispatchEvent(new Event("scroll"));
          });
          return page.getByRole("tab", { name: "Alunos" }).getAttribute("aria-selected");
        },
        { timeout: 15_000 },
      )
      .toBe("true");

    await page.getByRole("tab", { name: "Alunos" }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Equipe" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
