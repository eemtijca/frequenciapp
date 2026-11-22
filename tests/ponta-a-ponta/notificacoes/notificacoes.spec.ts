// Configuração dos avisos pela Gestão e preferências da equipe na interface,
// com restauração das regras e imagens locais fora do versionamento.
import { abrirConfiguracoesDaGestao } from "../../helpers/categorias-configuracoes";
import { expect, test } from "@playwright/test";
import type { ConfiguracaoNotificacoes } from "@/domain/notificacoes";
import { abrirNotificacoes, aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { selecionarAcaoConfiguracoes, salvarConfiguracoes } from "../helpers/configuracoes";

test.describe("configuração de notificações", () => {
  let anterior: ConfiguracaoNotificacoes;
  test.beforeEach(async ({ request }) => {
    const resposta = await request.get("/api/notificacoes/configuracao");
    expect(resposta.ok()).toBe(true);
    anterior = (await resposta.json()).configuracao;
    expect(
      (
        await request.patch("/api/notificacoes/configuracao", {
          data: { chamadasPendentes: false, horarioPendencias: "17:00" },
        })
      ).ok(),
    ).toBe(true);
  });
  test.afterEach(async ({ request }) => {
    if (anterior)
      expect((await request.patch("/api/notificacoes/configuracao", { data: anterior })).ok()).toBe(
        true,
      );
  });
  test("a Gestão escolhe tipos e horário do aviso de chamadas pendentes", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await abrirConfiguracoesDaGestao(page);
    const secao = page.locator('[data-secao="notificacoes"]');
    await selecionarAcaoConfiguracoes(page, "Acesso e avisos", "Notificações");
    await expect(secao.getByRole("heading", { name: "Notificações", exact: true })).toBeVisible();
    const pendencias = secao.getByRole("switch", { name: "Chamadas pendentes para a coordenação" });
    await expect(pendencias).not.toBeChecked();
    await pendencias.click();
    const campoHorario = secao
      .locator("#horario-pendencias-notificacoes")
      .locator('xpath=ancestor::div[contains(@class,"MuiPickersInputBase-root")]')
      .first();
    await campoHorario.getByRole("button", { name: /^Escolha uma hora/ }).click();
    const horario = page.getByRole("dialog", { name: "Horário do aviso de pendências" });
    await horario
      .getByRole("listbox", { name: "Selecione horas", exact: true })
      .getByRole("option", { name: "16 horas", exact: true })
      .click();
    await horario
      .getByRole("listbox", { name: "Selecione minutos", exact: true })
      .getByRole("option", { name: "30 minutos", exact: true })
      .click();
    await horario.getByRole("button", { name: "OK", exact: true }).click();
    await salvarConfiguracoes(page);
    await expect(page.getByText("Configurações salvas.")).toBeVisible();
    await page.reload();
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await abrirConfiguracoesDaGestao(page);
    await selecionarAcaoConfiguracoes(page, "Acesso e avisos", "Notificações");
    await expect(secao.getByRole("heading", { name: "Notificações", exact: true })).toBeVisible();
    await expect(
      secao.getByRole("switch", { name: "Chamadas pendentes para a coordenação" }),
    ).toBeChecked();
    await expect(secao.locator("#horario-pendencias-notificacoes")).toHaveValue("16:30");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await secao.screenshot({
      path: `docs/imagens/locais/notificacoes-gestao-${test.info().project.name}.png`,
    });
  });
});

test.describe("notificações da coordenação", () => {
  test.use({ storageState: "tests/ponta-a-ponta/.auth/coordenacao.json" });
  test("mostra os avisos e a disponibilidade definidos para a equipe", async ({
    page,
    browser,
  }) => {
    const admin = await browser.newContext({
      storageState: "tests/ponta-a-ponta/.auth/admin.json",
      baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3000",
    });
    const anterior = (await (await admin.request.get("/api/notificacoes/configuracao")).json())
      .configuracao;
    expect(
      (
        await admin.request.patch("/api/notificacoes/configuracao", {
          data: { chamadasPendentes: false },
        })
      ).ok(),
    ).toBe(true);
    try {
      await page.goto("/");
      await aguardarHidratacao(page);
      await abrirNotificacoes(page);
      const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
      await expect(
        dialogo.getByRole("switch", { name: "Chamadas pendentes", exact: true }),
      ).toBeVisible();
      await expect(dialogo.getByRole("switch", { name: "Resumo diário" })).toHaveCount(0);
      await expect(dialogo.getByRole("switch", { name: "Novas chamadas" })).toHaveCount(0);
      await expect(dialogo.getByText("Este aviso está desligado pela Gestão.")).toBeVisible();
      await dialogo.screenshot({
        path: `docs/imagens/locais/notificacoes-coordenacao-${test.info().project.name}.png`,
      });
    } finally {
      expect(
        (await admin.request.patch("/api/notificacoes/configuracao", { data: anterior })).ok(),
      ).toBe(true);
      await admin.close();
    }
  });
});
