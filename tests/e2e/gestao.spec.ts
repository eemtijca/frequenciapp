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

  test("no desktop a troca é instantânea com deslize curto", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");

    const pager = page.locator("[data-pager=gestao]");
    await page.getByRole("tab", { name: "Alunos" }).click();
    const medida = await pager.evaluate((elemento) => ({
      scrollLeft: elemento.scrollLeft,
      largura: elemento.clientWidth,
    }));
    // Sem rolagem longa: o paginador já está no painel de destino.
    expect(medida.scrollLeft).toBe(medida.largura * 2);
    await expect(page.getByRole("tab", { name: "Alunos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("campo de senha da equipe mostra e oculta", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Equipe" }).click();
    await page.getByRole("button", { name: "Nova conta" }).click();

    const campo = page.locator("#senha-usuario");
    await expect(campo).toHaveAttribute("type", "password");
    const grupo = campo.locator("xpath=..");
    await grupo.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(campo).toHaveAttribute("type", "text");
    await grupo.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(campo).toHaveAttribute("type", "password");
  });
});
