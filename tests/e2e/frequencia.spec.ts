// Chamada com saída por aula: marcação parcial, persistência, histórico,
// grade e falta justificada. O modo por aula é ligado pela configuração.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, liberarSabadoSeNecessario, trocarVisao } from "./helpers/pagina";

test.describe("chamada com saída por aula", () => {
  test.beforeAll(async ({ request }) => {
    await criarMassaE2E();
    await request.patch("/api/configuracoes", { data: { frequenciaPorAula: true } });
  });

  test.afterAll(async ({ request }) => {
    await request.patch("/api/configuracoes", { data: { frequenciaPorAula: false } });
    await limparMassaE2E();
  });

  test("registra saída parcial, mantém no histórico e mostra S na grade", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");

    const painel = page.locator('section[aria-label="Fazer chamada"]');
    const pilula = painel
      .getByRole("group", { name: "Turma atual" })
      .getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    await liberarSabadoSeNecessario(painel);
    await expect(painel.getByText("E2E Aluno Um")).toBeVisible();

    // O seletor próprio mostra o rótulo amigável e abre o painel no clique.
    await expect(painel.getByText("Hoje", { exact: true })).toBeVisible();
    const gatilhoDia = painel.locator("#dia-frequencia");
    // A coluna lateral do desktop preserva a data e o selo sem sobreposição.
    expect(
      await gatilhoDia.evaluate((botao) => {
        const data = botao.querySelector(".numerais-tabulares")?.getBoundingClientRect();
        const selo = botao.querySelector(".rounded-full")?.getBoundingClientRect();
        const caixa = botao.getBoundingClientRect();
        return Boolean(
          data &&
          selo &&
          data.left >= caixa.left &&
          data.right <= selo.left &&
          selo.right <= caixa.right,
        );
      }),
    ).toBe(true);
    await expect(gatilhoDia).toHaveAttribute("aria-haspopup", "dialog");
    await gatilhoDia.click();
    const painelDia = page.getByRole("dialog", { name: "Data da chamada" });
    await expect(painelDia).toBeVisible();
    // O seletor abre em popover ancorado, inclusive no celular, sem folha inferior.
    const caixa = await painelDia.boundingBox();
    const alvo = await gatilhoDia.boundingBox();
    const larguraJanela = page.viewportSize()?.width ?? 0;
    expect(caixa).not.toBeNull();
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(larguraJanela + 1);
    if (isMobile) {
      const centro = (caixa?.x ?? 0) + (caixa?.width ?? 0) / 2;
      const centroAlvo = (alvo?.x ?? 0) + (alvo?.width ?? 0) / 2;
      expect(Math.abs(centro - centroAlvo)).toBeLessThan(120);
    }
    // O teclado anda pela grade e Enter escolhe o dia anterior.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(painelDia).toBeHidden();
    await expect(painel.getByRole("button", { name: "Resumo do dia" })).toBeVisible();
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

    // Trocar de dia e voltar refaz a leitura e, aos sábados, a chamada volta a começar bloqueada.
    await liberarSabadoSeNecessario(painel);
    const linha = painel.locator("ul li").first();
    await linha.locator("button[aria-pressed]").first().click();
    await painel.getByRole("button", { name: /Aulas em que E2E Aluno Um/ }).click();

    const chips = linha.locator("button[aria-pressed]");
    const total = await chips.count();
    await chips.nth(total - 1).click();
    await painel.getByRole("button", { name: "Salvar" }).click();
    await expect(painel.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
    await expect(
      painel.getByRole("button", { name: /^Desbloquear chamada de E2E Ano A/ }),
    ).toBeVisible();
    await expect(
      painel.getByText("Chamada salva e bloqueada. Desbloqueie para corrigir as marcações."),
    ).toHaveCount(0);
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    // O dia futuro fica bloqueado na própria navegação de data.
    await expect(painel.getByRole("button", { name: "Dia seguinte" })).toBeDisabled();

    // A marcação sobrevive à recarga.
    await page.reload();
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    // Com a semente local, a turma padrão é outra; reabra a turma de teste.
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    await expect(painel.getByText("saiu em parte das aulas").first()).toBeVisible({
      timeout: 15_000,
    });

    // Recolher o resumo preserva o filtro, com uma saída acessível junto da lista.
    const botaoResumo = painel.getByRole("button", { name: "Resumo de hoje" });
    const resumo = painel.getByRole("region", { name: "Resumo de hoje" });
    const alunoPresente = painel.getByRole("button", { name: /^E2E Aluno Dois:/ });
    await expect(botaoResumo).toHaveAttribute("aria-expanded", "false");
    await expect(resumo).toBeHidden();
    if (isMobile) await botaoResumo.click();
    else {
      await botaoResumo.focus();
      await page.keyboard.press("Enter");
    }
    await expect(botaoResumo).toHaveAttribute("aria-expanded", "true");
    const faltas = resumo.getByRole("button", { name: /Faltas/ });
    await expect(resumo.getByRole("button", { name: /Justificadas/ })).toBeVisible();
    await expect(resumo.getByRole("button", { name: /Presentes/ })).toBeVisible();
    await faltas.click();
    await expect(alunoPresente).toBeHidden();
    await botaoResumo.click();
    await expect(resumo).toBeHidden();
    await expect(alunoPresente).toBeHidden();
    await botaoResumo.click();
    await expect(faltas).toHaveAttribute("aria-pressed", "true");
    await botaoResumo.click();
    await painel.getByRole("button", { name: "Ver todos", exact: true }).click();
    await expect(alunoPresente).toBeVisible();

    await trocarVisao(page, "Relatórios", "relatorios");
    await page.getByRole("tab", { name: "Histórico" }).click();
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

    await page.getByRole("tab", { name: "Grade" }).click();
    const grade = page.locator('section[aria-label="Grade de frequência"]');
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

  test("marca falta justificada com o código do catálogo", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");

    const painel = page.locator('section[aria-label="Fazer chamada"]');
    const pilula = painel
      .getByRole("group", { name: "Turma atual" })
      .getByRole("button", { name: /E2E Ano A/ });
    if (await pilula.isVisible().catch(() => false)) {
      await pilula.click();
    }
    const linha = painel.locator("ul li").filter({ hasText: "E2E Aluno Dois" }).first();
    await painel.getByRole("button", { name: /Desbloquear chamada de E2E Ano A/ }).click();
    await liberarSabadoSeNecessario(painel);
    await linha.locator("button[aria-pressed]").first().click();
    await linha.getByRole("combobox", { name: /Justificativa da falta/ }).click();
    await page.getByRole("option", { name: "D · Doente" }).click();
    await painel.getByRole("button", { name: "Salvar" }).click();
    await expect(linha.getByText("FJ")).toBeVisible({ timeout: 15_000 });
    await expect(linha.getByText("Doente").first()).toBeVisible();
  });
});
