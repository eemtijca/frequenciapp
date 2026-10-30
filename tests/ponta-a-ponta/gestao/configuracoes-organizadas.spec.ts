// Navegação das configurações no celular, preservando o rascunho e a revisão antes de gravar.
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { descartarConfiguracoes, selecionarAcaoConfiguracoes } from "../helpers/configuracoes";

test.use({ serviceWorkers: "block", viewport: { width: 360, height: 800 }, hasTouch: true });

async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
}

test("troca tarefas por toque e teclado sem perder o cadastro pendente ou gravar antes da revisão", async ({
  page,
}) => {
  const gravacoes: unknown[] = [];
  await page.route("**/api/configuracoes/lote", (rota) => {
    gravacoes.push(rota.request().postDataJSON());
    return rota.fulfill({ status: 500, json: { error: "E2E Gravação inesperada." } });
  });
  await abrir(page);
  const escola = page.getByRole("navigation", { name: "Ações da escola", exact: true });
  await escola.getByRole("button", { name: "Cadastros", exact: true }).tap();
  const justificativas = page.locator('[data-secao="config-justificativas"]');
  await justificativas.getByRole("button", { name: /^Justificativas/ }).tap();
  await expect(justificativas.getByLabel("Código", { exact: true })).toBeHidden();
  await justificativas.getByText("Adicionar justificativa", { exact: true }).tap();
  await justificativas.getByLabel("Código", { exact: true }).fill("E2EUI");
  await justificativas.getByLabel("Rótulo", { exact: true }).fill("E2E Cadastro em revisão");
  await justificativas.getByRole("button", { name: "Adicionar", exact: true }).tap();
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toBeVisible();
  const frequencia = escola.getByRole("button", { name: "Frequência", exact: true });
  await frequencia.focus();
  await page.keyboard.press("Enter");
  await expect(frequencia).toHaveAttribute("aria-pressed", "true");
  await expect(justificativas).toBeHidden();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Dados", exact: true })
    .tap();
  const copia = page.locator('[data-secao="config-copia"]');
  await copia.getByRole("button", { name: /^Cópia de segurança/ }).tap();
  await copia.getByRole("button", { name: "Importar cópia", exact: true }).tap();
  const importar = page.getByRole("alertdialog", { name: "Importar cópia?", exact: true });
  await expect(importar).toContainText("registros que já existem são mantidos");
  await importar.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await selecionarAcaoConfiguracoes(page, "Escola", "Cadastros");
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Salvar configurações", exact: true }).tap();
  const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?", exact: true });
  await expect(revisao).toContainText("Justificativas");
  await revisao.getByRole("button", { name: "Continuar revisando", exact: true }).tap();
  expect(gravacoes).toHaveLength(0);
  await descartarConfiguracoes(page);
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toHaveCount(0);
  expect(gravacoes).toHaveLength(0);
});

test("as tarefas das categorias cabem no celular e seus painéis ficam acessíveis", async ({
  page,
}) => {
  await abrir(page);
  const grupos = [
    {
      categoria: "Escola",
      nome: "Ações da escola",
      acoes: ["Geral", "Frequência", "Calendário", "Cadastros"],
    },
    { categoria: "Horários", nome: "Ações dos horários", acoes: ["Aulas", "Almoço"] },
    {
      categoria: "Acesso e avisos",
      nome: "Ações de acesso e avisos",
      acoes: ["Diretores", "Notificações", "FrequenciBI"],
    },
  ] as const;
  for (const grupo of grupos) {
    await page
      .getByRole("navigation", { name: "Categorias de configurações" })
      .getByRole("button", { name: grupo.categoria, exact: true })
      .tap();
    const navegacao = page.getByRole("navigation", { name: grupo.nome, exact: true });
    for (const acao of grupo.acoes) {
      const botao = navegacao.getByRole("button", { name: acao, exact: true });
      await botao.tap();
      await expect(botao).toHaveAttribute("aria-pressed", "true");
      const painelId = await botao.getAttribute("aria-controls");
      expect(painelId).toBeTruthy();
      const painel = page.locator(`[id="${painelId}"]`);
      await expect(painel).toBeVisible();
      for (const gatilho of await painel
        .locator('[data-secao] > div:first-child > button[aria-expanded="false"]')
        .all()) {
        if (await gatilho.isVisible()) await gatilho.tap();
      }
      const caixa = await botao.boundingBox();
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});
