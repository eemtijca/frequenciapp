// Configuração dos avisos pela Gestão e preferências da equipe na interface,
// com restauração das regras e imagens locais fora do versionamento.
import { expect, test } from "@playwright/test";
import type { ConfiguracaoNotificacoes } from "@/domain/notificacoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

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
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Categorias de configurações" })
      .getByRole("button", { name: "Acesso e avisos", exact: true })
      .click();
    const secao = page.locator('[data-secao="notificacoes"]');
    await secao.getByRole("button", { name: /Notificações/ }).click();
    const pendencias = secao.getByRole("switch", { name: "Chamadas pendentes para a coordenação" });
    await expect(pendencias).toHaveAttribute("aria-checked", "false");
    await pendencias.click();
    await secao.getByRole("button", { name: "Horário do aviso de pendências: 17:00" }).click();
    const horario = page.getByRole("dialog", { name: "Horário do aviso de pendências" });
    await horario
      .getByRole("listbox", { name: "Horas" })
      .getByRole("option", { name: "16", exact: true })
      .click();
    await horario
      .getByRole("listbox", { name: "Minutos" })
      .getByRole("option", { name: "30", exact: true })
      .click();
    await secao.getByRole("button", { name: "Salvar notificações", exact: true }).click();
    await expect(page.getByText("Configuração de notificações salva.")).toBeVisible();
    await page.reload();
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Categorias de configurações" })
      .getByRole("button", { name: "Acesso e avisos", exact: true })
      .click();
    await secao.getByRole("button", { name: /Notificações/ }).click();
    await expect(
      secao.getByRole("switch", { name: "Chamadas pendentes para a coordenação" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      secao.getByRole("button", { name: "Horário do aviso de pendências: 16:30" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await secao.screenshot({
      path: `docs/imagens/notificacoes-gestao-${test.info().project.name}.png`,
    });
  });
});

test.describe("notificações da coordenação", () => {
  test.use({ storageState: "tests/e2e/.auth/coordenacao.json" });
  test("mostra os avisos e a disponibilidade definidos para a equipe", async ({
    page,
    browser,
  }) => {
    const admin = await browser.newContext({
      storageState: "tests/e2e/.auth/admin.json",
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
      await page.getByRole("button", { name: "Configurar notificações" }).click();
      const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
      await expect(
        dialogo.getByRole("switch", { name: "Chamadas pendentes", exact: true }),
      ).toBeVisible();
      await expect(dialogo.getByRole("switch", { name: "Resumo diário" })).toHaveCount(0);
      await expect(dialogo.getByRole("switch", { name: "Novas chamadas" })).toHaveCount(0);
      await expect(dialogo.getByText("Este aviso está desligado pela Gestão.")).toBeVisible();
      await dialogo.screenshot({
        path: `docs/imagens/notificacoes-coordenacao-${test.info().project.name}.png`,
      });
    } finally {
      expect(
        (await admin.request.patch("/api/notificacoes/configuracao", { data: anterior })).ok(),
      ).toBe(true);
      await admin.close();
    }
  });
});
