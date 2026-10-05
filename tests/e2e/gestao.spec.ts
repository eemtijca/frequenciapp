// Navegação da Gestão e das configurações, com preservação de rascunhos e retorno do Google.
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("abas da Gestão", () => {
  const retornosGoogle = [
    { finalidade: "FREQUENCIA", secao: "planilha-frequencia" },
    { finalidade: "SAIDAS", secao: "planilha-saidas" },
    { finalidade: "PARCIAL", secao: "planilha-parcial" },
    { finalidade: "", secao: "planilha-frequencia" },
  ];

  for (const retorno of retornosGoogle) {
    test(`retorno do Google ${retorno.finalidade || "antigo"} abre a planilha correspondente`, async ({
      page,
    }) => {
      const finalidade = retorno.finalidade ? `&googleFinalidade=${retorno.finalidade}` : "";
      await page.goto(`/?visao=gestao&google=conectado${finalidade}`);
      await aguardarHidratacao(page);
      await expect(page.getByRole("tab", { name: "Configurações" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByText("Conta Google conectada. Escolha a planilha.")).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Categorias de configurações" })
          .getByRole("button", { name: "Planilhas", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      for (const secao of ["planilha-frequencia", "planilha-saidas", "planilha-parcial"]) {
        const cartao = page.locator(`[data-secao="${secao}"]`);
        await expect(cartao).toBeVisible();
        await expect(cartao.getByRole("button", { name: /^Planilha de/ })).toHaveAttribute(
          "aria-expanded",
          secao === retorno.secao ? "true" : "false",
        );
      }
    });
  }

  test("as configurações mostram uma categoria por vez e preservam um rascunho", async ({
    page,
  }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações" }).click();
    const categorias = page.getByRole("navigation", { name: "Categorias de configurações" });
    const justificativas = page.locator('[data-secao="config-justificativas"]');
    const copia = page.locator('[data-secao="config-copia"]');
    await expect(categorias.getByRole("button", { name: "Escola", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(justificativas).toBeVisible();
    await expect(copia).toBeHidden();
    await expect(page.locator('[data-secao="planilha-frequencia"]')).toBeHidden();
    await expect(page.locator('[data-secao="config-acesso-diretores"]')).toBeHidden();

    await justificativas.getByRole("button", { name: /^Justificativas/ }).click();
    await justificativas.getByLabel("Código", { exact: true }).fill("E2E");
    await justificativas.getByLabel("Rótulo", { exact: true }).fill("E2E Rascunho preservado");
    await categorias.getByRole("button", { name: "Dados", exact: true }).click();
    await expect(copia).toBeVisible();
    await expect(justificativas).toBeHidden();
    await expect(page.locator('[data-secao="planilha-frequencia"]')).toBeHidden();
    await expect(page.locator('[data-secao="config-acesso-diretores"]')).toBeHidden();

    await categorias.getByRole("button", { name: "Escola", exact: true }).click();
    await expect(copia).toBeHidden();
    await expect(justificativas.getByLabel("Código", { exact: true })).toHaveValue("E2E");
    await expect(justificativas.getByLabel("Rótulo", { exact: true })).toHaveValue(
      "E2E Rascunho preservado",
    );
  });

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
