// Navegação dos cartões de saídas e chamada parcial, com integração sintética e rascunhos locais.
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { selecionarAcaoPlanilha } from "../helpers/planilhas";

test.use({ serviceWorkers: "block" });

async function abrirPlanilhas(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
}

test("chamada parcial prepara somente após confirmar e abre a vista pelo painel Enviar", async ({
  page,
}) => {
  const preparos: unknown[] = [];
  const integracao = {
    ativa: true,
    contaGoogle: true,
    googlePlanilha: { id: "e2e-parcial", nome: "E2E Chamada Parcial" },
    aba: "Chamada Parcial",
    preparada: false,
    podeEnviar: false,
  };
  await page.route("**/api/planilha-parcial", (rota) => rota.fulfill({ json: { integracao } }));
  await page.route("**/api/planilha-parcial/preparar", (rota) => {
    preparos.push(rota.request().postDataJSON());
    integracao.preparada = true;
    integracao.podeEnviar = true;
    return rota.fulfill({ json: { criada: true, integracao } });
  });
  await abrirPlanilhas(page);
  const cartao = page.locator('[data-secao="planilha-parcial"]');
  await cartao.getByRole("button", { name: /^Planilha de chamada parcial/ }).click();
  const navegacao = cartao.getByRole("navigation", {
    name: "Ações da planilha de chamada parcial",
  });
  await expect(navegacao.getByRole("button", { name: "Configurar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await selecionarAcaoPlanilha(cartao, "Configurar");
  const preparar = cartao.getByRole("button", { name: "Preparar aba parcial", exact: true });
  await preparar.click();
  const dialogo = page.getByRole("dialog", { name: "Preparar Chamada Parcial", exact: true });
  await expect(dialogo).toContainText("E2E Chamada Parcial");
  expect(preparos).toHaveLength(0);
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(preparos).toHaveLength(0);
  await preparar.click();
  await dialogo.getByRole("button", { name: "Confirmar preparação", exact: true }).click();
  await expect(dialogo).toBeHidden();
  expect(preparos).toEqual([{ confirmacao: true }]);
  await expect(cartao.getByRole("button", { name: "Conferir aba parcial" })).toBeVisible();
  await selecionarAcaoPlanilha(cartao, "Enviar");
  await expect(cartao.getByRole("button", { name: "Conferir aba parcial" })).toBeHidden();
  await cartao.getByRole("button", { name: "Abrir Chamada Parcial", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada-parcial");
  expect(preparos).toHaveLength(1);
});

test("saídas no celular preserva o formulário ao trocar de ação e recolhe o histórico", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const gravacoes: string[] = [];
  await page.route("**/api/planilha-saidas", (rota) =>
    rota.fulfill({
      json: {
        integracao: {
          ativa: true,
          contaGoogle: true,
          googlePlanilha: { id: "e2e-saidas", nome: "E2E Saídas" },
          esquema: {
            planilha: { nome: "E2E Saídas", url: "", fuso: "America/Fortaleza" },
            abas: [{ nome: "Saiu mais cedo", colunas: [] }],
            aba: "Saiu mais cedo",
          },
          esquemaEm: "2026-10-01T12:00:00.000Z",
          modo: "conservador",
          modoCompletoAte: null,
          envioAutomatico: false,
          atualizadoEm: "2026-10-01T12:00:00.000Z",
          fuso: "America/Fortaleza",
          ultimoErro: null,
          sincronizacoes: [
            {
              id: "e2e-envio",
              de: "2026-10-01",
              ate: "2026-10-01",
              modalidade: "conservador",
              linhasCriadas: 3,
              preenchidas: 0,
              substituidas: 0,
              removidasLinhas: 0,
              resultado: "SUCESSO",
              criadoEm: "2026-10-01T12:00:00.000Z",
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/planilha-saidas/**", (rota) => {
    if (rota.request().method() !== "GET") gravacoes.push(rota.request().url());
    return rota.abort();
  });
  await abrirPlanilhas(page);
  const cartao = page.locator('[data-secao="planilha-saidas"]');
  await cartao.getByRole("button", { name: /^Planilha de entradas e saídas/ }).click();
  const navegacao = cartao.getByRole("navigation", {
    name: "Ações da planilha de entradas e saídas",
  });
  await expect(navegacao.getByRole("button", { name: "Enviar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const historico = cartao.getByText(/3 linhas criadas/);
  await expect(historico).toBeHidden();
  await cartao.getByText("Histórico de envios", { exact: true }).click();
  await expect(historico).toBeVisible();
  await selecionarAcaoPlanilha(cartao, "Configurar");
  await expect(cartao.getByRole("button", { name: "Abrir a vista Saídas" })).toBeHidden();
  await cartao.getByRole("button", { name: "Revisar estrutura", exact: true }).click();
  const nomeAba = cartao.getByLabel("Nome da nova aba", { exact: true });
  await nomeAba.fill("E2E Rascunho de aba");
  await selecionarAcaoPlanilha(cartao, "Organizar");
  await expect(nomeAba).toBeHidden();
  await expect(cartao.getByRole("button", { name: "Preparar aba Entradas" })).toBeVisible();
  await expect(
    cartao.getByRole("button", { name: "Organizar apresentação de Entradas", exact: true }),
  ).toBeVisible();
  await selecionarAcaoPlanilha(cartao, "Configurar");
  await expect(nomeAba).toHaveValue("E2E Rascunho de aba");
  await selecionarAcaoPlanilha(cartao, "Enviar");
  await expect(cartao.getByRole("button", { name: "Abrir a vista Saídas" })).toBeVisible();
  for (const acao of ["Enviar", "Organizar", "Configurar"] as const) {
    await selecionarAcaoPlanilha(cartao, acao);
    const caixa = await navegacao.getByRole("button", { name: acao, exact: true }).boundingBox();
    expect(caixa?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(gravacoes).toHaveLength(0);
});
