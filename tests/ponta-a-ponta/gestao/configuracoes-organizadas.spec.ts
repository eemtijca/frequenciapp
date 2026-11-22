// Navegação das configurações no celular, preservando o rascunho e a revisão antes de gravar.
import { selecionarCategoriaConfiguracoes } from "../../helpers/categorias-configuracoes";
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { descartarConfiguracoes, selecionarAcaoConfiguracoes } from "../helpers/configuracoes";

test.use({ serviceWorkers: "block", viewport: { width: 320, height: 844 }, hasTouch: true });

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
  let importacoes = 0;
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === "/api/backup" && pedido.method() === "POST") {
      importacoes++;
    }
  });
  await page.route("**/api/configuracoes/lote", (rota) => {
    gravacoes.push(rota.request().postDataJSON());
    return rota.fulfill({ status: 500, json: { error: "E2E Gravação inesperada." } });
  });
  await abrir(page);
  const escola = page.getByRole("tablist", { name: "Ações da escola", exact: true });
  await escola.getByRole("tab", { name: "Cadastros", exact: true }).tap();
  const justificativas = page.locator('[data-secao="config-justificativas"]');
  await expect(
    justificativas.getByRole("heading", { name: "Justificativas", exact: true }),
  ).toBeVisible();
  await expect(justificativas.getByLabel("Código", { exact: true })).toBeHidden();
  await justificativas.getByRole("button", { name: "Adicionar justificativa", exact: true }).tap();
  await justificativas.getByLabel("Código", { exact: true }).fill("E2EUI");
  await justificativas.getByLabel("Rótulo", { exact: true }).fill("E2E Cadastro em revisão");
  await justificativas.getByRole("button", { name: "Adicionar ao rascunho", exact: true }).tap();
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toBeVisible();
  const frequencia = escola.getByRole("tab", { name: "Frequência", exact: true });
  await frequencia.focus();
  await page.keyboard.press("Enter");
  await expect(frequencia).toHaveAttribute("aria-selected", "true");
  await expect(justificativas).toBeHidden();
  await selecionarCategoriaConfiguracoes(page, "Dados");
  const copia = page.locator('[data-secao="config-copia"]');
  await expect(
    copia.getByRole("heading", { name: "Cópia de segurança", exact: true }),
  ).toBeVisible();
  await expect(copia.getByText(/sem substituir os que já existem/)).toBeVisible();
  await expect(copia.getByText(/Por padrão, o ZIP é protegido por senha/)).toBeVisible();
  await expect(copia.getByText(/JSON original sem senha/)).toBeVisible();
  const importarCopia = copia.getByRole("button", { name: "Importar cópia", exact: true });
  await importarCopia.focus();
  await page.keyboard.press("Enter");
  const importar = page.getByRole("alertdialog", { name: "Importar cópia?", exact: true });
  await expect(importar).toContainText("registros que já existem são mantidos");
  await importar.getByRole("button", { name: "Cancelar", exact: true }).tap();
  await expect(importarCopia).toBeFocused();
  expect(importacoes).toBe(0);
  await selecionarAcaoConfiguracoes(page, "Escola", "Cadastros");
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revisar alterações", exact: true }).tap();
  const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?", exact: true });
  await expect(revisao).toContainText("Justificativas");
  await revisao.getByRole("button", { name: "Continuar revisando", exact: true }).tap();
  expect(gravacoes).toHaveLength(0);
  await descartarConfiguracoes(page);
  await expect(justificativas.getByText("E2E Cadastro em revisão", { exact: true })).toHaveCount(0);
  expect(gravacoes).toHaveLength(0);
  expect(importacoes).toBe(0);
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
    { categoria: "Horários", nome: "Ações dos horários", acoes: ["Aulas", "Almoço", "Provas"] },
    {
      categoria: "Acesso e avisos",
      nome: "Ações de acesso e avisos",
      acoes: ["Diretores", "Notificações", "FrequenciBI"],
    },
  ] as const;
  for (const grupo of grupos) {
    await selecionarCategoriaConfiguracoes(page, grupo.categoria);
    const navegacao = page.getByRole("tablist", { name: grupo.nome, exact: true });
    for (const acao of grupo.acoes) {
      const botao = navegacao.getByRole("tab", { name: acao, exact: true });
      await botao.tap();
      await expect(botao).toHaveAttribute("aria-selected", "true");
      const painelId = await botao.getAttribute("aria-controls");
      expect(painelId).toBeTruthy();
      const painel = page.locator(`[id="${painelId}"]`);
      await expect(painel).toBeVisible();
      for (const gatilho of await painel
        .locator('[data-secao] button[aria-expanded="false"]')
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

test("Planilhas separa preferências em rascunho das operações de cada integração", async ({
  page,
}) => {
  await abrir(page);
  await selecionarCategoriaConfiguracoes(page, "Planilhas");
  const finalidades = [
    ["Planilha de frequência", ["Integração ativa", "Enviar ao salvar a chamada"]],
    [
      "Planilha de entradas e saídas",
      ["Integração de entradas e saídas ativa", "Enviar ao registrar saídas e entradas"],
    ],
    ["Planilha de chamada parcial", ["Integração de chamada parcial ativa"]],
  ] as const;
  for (const [titulo, rotulos] of finalidades) {
    const gatilho = page
      .getByRole("heading", { level: 3 })
      .filter({ has: page.getByText(titulo, { exact: true }) })
      .getByRole("button");
    await gatilho.tap();
    const preferencias = page.getByRole("group", { name: "Preferências no rascunho", exact: true });
    for (const rotulo of rotulos) {
      await expect(preferencias.getByRole("switch", { name: rotulo, exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Operações da planilha", exact: true }),
    ).toBeVisible();
    await expect(preferencias.getByRole("tablist")).toHaveCount(0);
    await gatilho.tap();
    await expect(preferencias).toBeHidden();
  }
});
