// Abas da Gestão: seleção por toque e teclado.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("abas da Gestão", () => {
  test("sincroniza toque e teclado", async ({ page }) => {
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

    await page.getByRole("tab", { name: "Alunos" }).click();
    await expect(page.getByRole("tab", { name: "Alunos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "Alunos" }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Equipe" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("no desktop a troca é instantânea", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");

    await page.getByRole("tab", { name: "Alunos" }).click();
    await expect(page.getByRole("tab", { name: "Alunos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel", { name: "Alunos" })).toBeVisible();
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

  test("a seleção vai direto à aba tocada", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");

    await page.getByRole("tab", { name: "Equipe" }).click();
    await expect(page.getByRole("tab", { name: "Equipe" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const abasGestao = page.getByRole("tablist", { name: "Áreas de gestão" });
    for (let i = 0; i < 8; i += 1) {
      const ativa = await abasGestao.getByRole("tab", { selected: true }).textContent();
      expect(ativa).toBe("Equipe");
      await page.waitForTimeout(70);
    }
  });

  test("a aba de configurações encurta no celular e volta ao nome cheio no desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");

    // O nome acessível segue completo, mesmo com o rótulo curto na tela.
    const aba = page.getByRole("tab", { name: "Configurações" });
    await expect(aba).toBeVisible();
    expect(await aba.innerText()).toBe("Config.");

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(async () => aba.innerText()).toBe("Configurações");
  });
});
