// Navegação da Gestão e das configurações, com preservação de rascunhos e retorno do Google.
import {
  abrirConfiguracoesDaGestao,
  conferirCategoriaConfiguracoes,
  exporConfiguracoes,
  exporNavegacao,
  menuMovel,
  selecionarCadastroGestao,
  selecionarCategoriaConfiguracoes,
} from "../../helpers/categorias-configuracoes";
import { expect, test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { selecionarAcaoConfiguracoes } from "../helpers/configuracoes";

test.describe("navegação da Gestão", () => {
  test("Configurações tem contexto próprio e volta ao cadastro anterior com foco no gatilho", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await selecionarCadastroGestao(page, "Turmas");
    const nav = await exporNavegacao(page);
    const gatilho = nav.getByRole("button", { name: "Configurações", exact: true });
    await gatilho.press("Enter");
    const voltar = nav.getByRole("button", { name: "Voltar para Gestão", exact: true });
    await expect(voltar).toBeFocused();
    await expect(page.getByRole("tablist", { name: "Áreas de gestão" })).toHaveCount(0);
    await selecionarAcaoConfiguracoes(page, "Horários", "Provas");
    await expect(page.getByRole("form", { name: "Nova prova" })).toBeVisible();

    await voltar.press("Enter");
    await expect(nav.getByRole("button", { name: "Turmas", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(gatilho).toBeFocused();
    await expect(page.getByRole("heading", { name: "Turmas", level: 1 })).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(voltar).toBeFocused();
    await expect(page.getByRole("form", { name: "Nova prova" })).toBeVisible();
  });

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
      await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();
      await expect(page.getByText("Conta Google conectada. Escolha a planilha.")).toBeVisible();
      await conferirCategoriaConfiguracoes(page, "Planilhas");
      const nav = await exporConfiguracoes(page);
      await expect(nav.getByRole("button", { name: "Planilhas", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      if (await menuMovel(page).isVisible()) await page.keyboard.press("Escape");
      await expect(menuMovel(page)).toBeHidden();
      for (const secao of ["planilha-frequencia", "planilha-saidas", "planilha-parcial"]) {
        const cartao = page.locator(`[data-secao="${secao}"]`);
        await expect(cartao).toBeVisible();
        await expect(cartao.getByRole("button", { name: /^Planilha de/ })).toHaveAttribute(
          "aria-expanded",
          secao === retorno.secao ? "true" : "false",
        );
        if (secao === retorno.secao) {
          await expect(
            cartao
              .getByRole("tablist", { name: /^Ações da planilha/ })
              .getByRole("tab", { name: "Configurar", exact: true }),
          ).toHaveAttribute("aria-selected", "true");
        }
      }
    });
  }

  test("as configurações mostram uma categoria por vez e preservam um rascunho", async ({
    page,
  }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await abrirConfiguracoesDaGestao(page);
    const justificativas = page.locator('[data-secao="config-justificativas"]');
    const copia = page.locator('[data-secao="config-copia"]');
    await conferirCategoriaConfiguracoes(page, "Escola");
    await expect(justificativas).toBeHidden();
    await selecionarAcaoConfiguracoes(page, "Escola", "Cadastros");
    await expect(justificativas).toBeVisible();
    await expect(copia).toBeHidden();
    await expect(page.locator('[data-secao="planilha-frequencia"]')).toBeHidden();
    await expect(page.locator('[data-secao="config-acesso-diretores"]')).toBeHidden();

    await justificativas
      .getByRole("button", { name: "Adicionar justificativa", exact: true })
      .click();
    await justificativas.getByLabel("Código", { exact: true }).fill("E2E");
    await justificativas.getByLabel("Rótulo", { exact: true }).fill("E2E Rascunho preservado");
    await selecionarCategoriaConfiguracoes(page, "Dados");
    await expect(copia).toBeVisible();
    await expect(justificativas).toBeHidden();
    await expect(page.locator('[data-secao="planilha-frequencia"]')).toBeHidden();
    await expect(page.locator('[data-secao="config-acesso-diretores"]')).toBeHidden();

    await selecionarCategoriaConfiguracoes(page, "Escola", "Cadastros");
    await expect(copia).toBeHidden();
    await expect(justificativas).toBeVisible();
    await expect(justificativas.getByLabel("Código", { exact: true })).toHaveValue("E2E");
    await expect(justificativas.getByLabel("Rótulo", { exact: true })).toHaveValue(
      "E2E Rascunho preservado",
    );
  });

  test("no desktop, Tab percorre destinos sem trocar até a ativação", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    const nav = await exporNavegacao(page);
    const series = nav.getByRole("button", { name: "Séries", exact: true });
    await expect(series).toHaveAttribute("aria-current", "page");
    await series.focus();
    await page.keyboard.press("Tab");
    const turmas = nav.getByRole("button", { name: "Turmas", exact: true });
    await expect(turmas).toBeFocused();
    await expect(series).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Space");
    await expect(turmas).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Turmas", level: 1 })).toBeVisible();
    await expect(nav).toBeVisible();
  });

  test("campo de senha da equipe mostra e oculta", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await selecionarCadastroGestao(page, "Equipe");
    await page.getByRole("button", { name: "Nova conta" }).click();

    const campo = page.locator("#senha-usuario");
    await expect(campo).toHaveAttribute("type", "password");
    const grupo = campo.locator("xpath=..");
    await grupo.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(campo).toHaveAttribute("type", "text");
    await grupo.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(campo).toHaveAttribute("type", "password");
  });

  test("a edição da própria conta não oferece redefinir a senha", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await selecionarCadastroGestao(page, "Equipe");
    const propria = page.getByRole("row").filter({ hasText: "Você" });
    await propria.getByRole("button", { name: /^Editar conta de / }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText("A sua própria senha muda no ícone de senha")).toBeVisible();
    await expect(dialogo.locator("#senha-usuario")).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
  });

  test("no celular, a seleção final fecha o menu e permanece ao reabrir", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    await selecionarCadastroGestao(page, "Equipe");
    await expect(page.getByRole("heading", { name: "Equipe", level: 1 })).toBeFocused();
    const nav = await exporNavegacao(page);
    await expect(nav.getByRole("button", { name: "Equipe", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("button", { name: "Configurações", exact: true })).toHaveText(
      "Configurações",
    );
  });
});
