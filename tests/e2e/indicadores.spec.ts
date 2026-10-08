// Fluxo administrativo do painel externo em desktop e celulares, com Google sintético.
import { expect, test } from "@playwright/test";
import { criarGoogleIndicadoresFalso } from "../helpers/google-indicadores-falso";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
let google: Awaited<ReturnType<typeof criarGoogleIndicadoresFalso>>;
test.beforeAll(async () => {
  google = await criarGoogleIndicadoresFalso();
  await comBanco(async (cliente) => {
    await cliente.query("delete from paineis_indicadores");
    await google.conectar(cliente);
  });
});
test.afterAll(async () => {
  await comBanco(async (cliente) => {
    await cliente.query("delete from paineis_indicadores");
    await cliente.query(
      "update integracoes_planilha set google_refresh_token=null, google_planilha_id=null, ativa=false where id='principal'",
    );
  });
  await google.fechar();
});
test("prepara fonte privada, configura agenda e abre o relatório sem expor nomes", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const secao = page.locator('[data-secao="indicadores"]');
  await expect(
    secao.getByRole("button", { name: "Painel externo (Looker Studio)" }),
  ).toHaveAttribute("aria-expanded", "false");
  await secao.getByRole("button", { name: "Painel externo (Looker Studio)" }).click();
  await secao.getByRole("button", { name: "Preparar indicadores", exact: true }).click();
  await expect(secao.getByRole("link", { name: "Abrir planilha" })).toBeVisible();
  expect(google.ids()).toHaveLength(1);
  await secao.getByLabel("Ano dos indicadores").fill("2026");
  await secao
    .getByLabel("Endereço do relatório")
    .fill("https://lookerstudio.google.com/reporting/QA_relatorio");
  await secao.getByRole("button", { name: "Salvar opções" }).click();
  await expect(secao.getByRole("link", { name: "Abrir painel" })).toHaveAttribute(
    "href",
    "https://lookerstudio.google.com/reporting/QA_relatorio",
  );
  await secao.getByRole("switch", { name: "Atualização automática" }).click();
  await expect(secao.getByRole("switch", { name: "Atualização automática" })).toBeChecked();
  await secao.getByRole("button", { name: "Atualizar indicadores", exact: true }).click();
  await expect(
    secao.getByRole("button", { name: "Atualizar indicadores", exact: true }),
  ).toBeEnabled();
  await expect(secao.getByText(/Último envio:/)).toBeVisible();
  expect(google.ids()).toHaveLength(1);
  await secao.getByText("Criar painel no Looker Studio", { exact: true }).click();
  await expect(secao.getByText(/Compartilhe apenas com contas autorizadas/)).toBeVisible();
  const largura = await secao.evaluate((elemento) => ({
    conteudo: elemento.scrollWidth,
    tela: document.documentElement.clientWidth,
  }));
  expect(largura.conteudo).toBeLessThanOrEqual(largura.tela);
  await page.screenshot({
    path: `docs/imagens/locais/looker-${test.info().project.name}.png`,
    fullPage: true,
  });
});
