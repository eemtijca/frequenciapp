// Banco sem turmas: a Chamada precisa mostrar o estado vazio, nunca um
// carregamento eterno. No CI a base nasce limpa; localmente com dados, pula.
import { expect, test } from "@playwright/test";
import { contarTurmas } from "./helpers/banco";
import { trocarVisao } from "./helpers/pagina";

test.describe("banco sem turmas", () => {
  test("mostra o estado vazio acionável", async ({ page }) => {
    const total = await contarTurmas();
    test.skip(total > 0, "A base local tem turmas; o cenário vazio roda no CI limpo.");
    await page.goto("/");
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.getByText("Nenhuma turma cadastrada")).toBeVisible();
    await expect(page.getByText("Carregando chamada...")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ir para a Gestão" })).toBeVisible();
  });
});
