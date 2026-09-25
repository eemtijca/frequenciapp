// Frequência com saída por aula: marcação parcial, persistência, histórico e grade.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("frequência com saída por aula", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("registra saída parcial, mantém no histórico e mostra S na grade", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await aguardarHidratacao(page);

    const painel = page.locator('section[aria-label="Registrar frequência"]');
    const pilula = painel.getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    await expect(painel.getByText("E2E Aluno Um")).toBeVisible();

    // O seletor próprio mostra o rótulo amigável e abre o painel no clique.
    await expect(painel.getByText("Hoje", { exact: true })).toBeVisible();
    const gatilhoDia = painel.locator("#dia-frequencia");
    await expect(gatilhoDia).toHaveAttribute("aria-haspopup", "dialog");
    await gatilhoDia.click();
    const painelDia = page.getByRole("dialog", { name: "Data da frequência" });
    await expect(painelDia).toBeVisible();
    // O teclado anda pela grade e Enter escolhe o dia anterior.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(painelDia).toBeHidden();
    await expect(painel.getByRole("button", { name: "Voltar para hoje" })).toBeVisible();
    await painel.getByRole("button", { name: "Voltar para hoje" }).click();
    await expect(painel.getByText("Hoje", { exact: true })).toBeVisible();

    // No desktop, a lista fica à esquerda e o painel de informações à direita.
    if (!isMobile) {
      await page.setViewportSize({ width: 1440, height: 900 });
      const lista = await painel.locator("div[class*='xl:order-1']").boundingBox();
      const info = await painel.locator("div[class*='xl:order-2']").boundingBox();
      expect(lista?.x ?? 0).toBeLessThan(info?.x ?? 0);
    }

    const linha = painel.locator("ul li").first();
    await linha.locator("button[aria-pressed]").first().click();
    await painel.getByRole("button", { name: /Aulas em que E2E Aluno Um/ }).click();

    const chips = linha.locator("button[aria-pressed]");
    const total = await chips.count();
    await chips.nth(total - 1).click();
    await painel.getByRole("button", { name: "Salvar" }).click();
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    // O dia futuro fica bloqueado na própria navegação de data.
    await expect(painel.getByRole("button", { name: "Dia seguinte" })).toBeDisabled();

    // A marcação sobrevive à recarga.
    await page.reload();
    await aguardarHidratacao(page);
    // Com a semente local, a turma padrão é outra; reabra a turma de teste.
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    await trocarVisao(page, "Histórico", "historico");
    await expect(page.getByText(/saída parcial/).first()).toBeVisible();

    // O seletor de mês abre em painel, aceita teclado e volta para este mês.
    const historico = page.locator('section[aria-label="Histórico de frequências"]');
    await expect(historico.getByText("Este mês", { exact: true })).toBeVisible();
    await historico.locator("#mes-historico").click();
    const painelMes = page.getByRole("dialog", { name: "Mês do histórico" });
    await expect(painelMes).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(painelMes).toBeHidden();
    await expect(historico.getByRole("button", { name: "Voltar para este mês" })).toBeVisible();
    await historico.getByRole("button", { name: "Voltar para este mês" }).click();
    await expect(historico.getByText("Este mês", { exact: true })).toBeVisible();

    await trocarVisao(page, "Grade", "grade");
    const grade = page.locator('section[aria-label="Grade do mês"]');
    // Com a semente local, escolha a turma de origem do teste.
    const pilulaGrade = grade.getByRole("button", { name: /E2E Ano A/ });
    if (await pilulaGrade.isVisible().catch(() => false)) {
      await pilulaGrade.click();
    }
    await expect(
      grade.getByRole("img", { name: /presente em parte das aulas/ }).first(),
    ).toBeVisible();

    // O seletor de mês da Grade abre, fecha com Esc e mantém este mês.
    await expect(grade.getByText("Este mês", { exact: true })).toBeVisible();
    await grade.locator("#mes-grade").click();
    const painelGrade = page.getByRole("dialog", { name: "Mês da consulta" });
    await expect(painelGrade).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(painelGrade).toBeHidden();
    await expect(grade.getByText("Este mês", { exact: true })).toBeVisible();

    // O seletor de mês ocupa a largura da tela, como nas outras telas.
    const larguraMes = (await grade.locator("#mes-grade").boundingBox())?.width ?? 0;
    expect(larguraMes).toBeGreaterThan(200);

    // A grade tem divisórias verticais entre os dias e depois dos nomes.
    const bordaDia = await grade
      .locator("tbody td")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).borderLeftWidth);
    expect(bordaDia).toBe("1px");
    const bordaNome = await grade
      .locator("tbody th")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).borderRightWidth);
    expect(bordaNome).toBe("1px");
  });
});
