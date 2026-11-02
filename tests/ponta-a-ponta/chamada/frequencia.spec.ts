// Chamada com saída por aula: marcação parcial, persistência, histórico,
// grade e falta justificada. O modo por aula é ligado pela configuração.
import { expect, test } from "@playwright/test";
import {
  diaDaSemanaIso,
  diaDeChamadaVizinho,
  diaSeguinte,
  mesSeguinte,
  nomeDoMes,
  rotuloData,
  rotuloMes,
} from "@/domain/frequencia";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { escolherMesNoPeriodo } from "../helpers/calendario";
import { diaCorrente, diaDeChamada, tituloResumoDoDia } from "../helpers/dia";
import {
  abrirDiaSeResumo,
  aguardarHidratacao,
  desbloquearChamada,
  liberarSabadoSeNecessario,
  salvarChamada,
  trocarVisao,
} from "../helpers/pagina";

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
    const gatilhoDia = painel.locator("#dia-frequencia");
    await expect(gatilhoDia).toHaveAttribute(
      "aria-label",
      new RegExp(`Data da chamada: ${rotuloData(diaDeChamada())}`),
    );
    if (diaDeChamada() === diaCorrente()) {
      await expect(painel.getByText("Hoje", { exact: true })).toBeVisible();
    }
    // A coluna lateral preserva a data e, quando há selo "Hoje", os dois ficam
    // dentro do gatilho e sem sobreposição. Em telas estreitas o selo pode
    // ocupar uma segunda linha, por isso a checagem é bidimensional.
    expect(
      await gatilhoDia.evaluate((botao) => {
        const data = botao.querySelector(".numerais-tabulares")?.getBoundingClientRect();
        const selo = botao.querySelector(".rounded-full")?.getBoundingClientRect();
        const caixa = botao.getBoundingClientRect();
        if (
          !data ||
          data.left < caixa.left ||
          data.right > caixa.right ||
          data.top < caixa.top ||
          data.bottom > caixa.bottom
        )
          return false;
        if (!selo) return true;
        const sobrepoe =
          data.left < selo.right &&
          selo.left < data.right &&
          data.top < selo.bottom &&
          selo.top < data.bottom;
        return !sobrepoe && selo.right <= caixa.right && selo.bottom <= caixa.bottom;
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
    // O calendário semanal inclui o domingo, que abre o resumo da semana.
    // Escolha o dia de chamada anterior, inclusive na virada de mês ou ano.
    const diaAtual = diaDeChamada();
    const diaAnterior = diaDeChamadaVizinho(diaAtual, -1);
    const celulaAnterior = painelDia.locator(`button[data-dia="${diaAnterior}"]`);
    await expect(painelDia.locator(`button[data-dia="${diaAtual}"]`)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    if (diaDaSemanaIso(diaAtual) === 1) {
      const domingo = diaSeguinte(diaAtual, -1);
      await expect(painelDia.locator(`button[data-dia="${domingo}"]`)).toBeFocused();
      await page.keyboard.press("ArrowLeft");
    }
    await expect(celulaAnterior).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(painelDia).toBeHidden();
    await expect(gatilhoDia).toHaveAttribute(
      "aria-label",
      new RegExp(`^Data da chamada: ${rotuloData(diaAnterior)}`),
    );
    await expect(painel.getByRole("button", { name: "Resumo do dia" })).toBeVisible();
    await expect(painel.getByRole("button", { name: "Voltar para hoje" })).toBeVisible();
    await painel.getByRole("button", { name: "Voltar para hoje" }).click();
    await abrirDiaSeResumo(page);
    await expect(gatilhoDia).toHaveAttribute(
      "aria-label",
      new RegExp(`Data da chamada: ${rotuloData(diaDeChamada())}`),
    );
    if (diaDeChamada() === diaCorrente()) {
      await expect(painel.getByText("Hoje", { exact: true })).toBeVisible();
    }

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
    await salvarChamada(painel);
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

    // O sábado só avança ao resumo quando o domingo já chegou.
    // No sábado corrente, a seta continua bloqueando datas futuras.
    if (diaDaSemanaIso(diaDeChamada()) === 6) {
      const seguinte = painel.getByRole("button", { name: "Dia seguinte" });
      if (diaDaSemanaIso(diaCorrente()) === 7) {
        await expect(seguinte).toBeEnabled();
        await seguinte.click();
        await expect(
          page.getByRole("region", { name: "Resumo da semana", exact: true }),
        ).toBeVisible();
      }
      await expect(seguinte).toBeDisabled();
    }

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
    const botaoResumo = painel.getByRole("button", { name: tituloResumoDoDia() });
    const resumo = painel.getByRole("region", { name: tituloResumoDoDia() });
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
    const historico = page.locator('section[aria-label="Histórico de frequências"]');
    await escolherMesNoPeriodo(page, historico, "Mês do histórico", diaDeChamada().slice(0, 7));
    await expect(
      page
        .locator('[data-pager="principal"] > section:not([hidden])')
        .getByText(/saída parcial/)
        .first(),
    ).toBeVisible();

    // O seletor de mês abre em painel, aceita teclado e volta para este mês.
    await escolherMesNoPeriodo(page, historico, "Mês do histórico", diaCorrente().slice(0, 7));
    await expect(historico.getByText("Este mês", { exact: true })).toBeVisible();
    await historico.locator("#mes-historico").click();
    const painelMes = page.getByRole("dialog", { name: "Mês do histórico" });
    await expect(painelMes).toBeVisible();
    const gradeMes = painelMes.getByRole("group", { name: /^Meses de \d{4}$/ });
    const anoVisivel = (await gradeMes.getAttribute("aria-label"))?.match(/\d{4}/)?.[0];
    if (!anoVisivel) throw new Error("Ano visível do seletor de mês não encontrado.");
    const selecionado = gradeMes.locator('button[aria-pressed="true"]');
    await expect(selecionado).toBeFocused();
    const nomeSelecionado = (await selecionado.textContent())?.trim();
    const meses = Array.from(
      { length: 12 },
      (_, indice) => `${anoVisivel}-${String(indice + 1).padStart(2, "0")}`,
    );
    const mesSelecionado = meses.find((mes) => nomeDoMes(mes) === nomeSelecionado);
    if (!mesSelecionado) throw new Error("Mês selecionado não encontrado na grade.");
    const mesAnterior = mesSeguinte(mesSelecionado, -1);
    if (mesAnterior.slice(0, 4) !== anoVisivel) {
      await painelMes.getByRole("button", { name: "Ano anterior", exact: true }).click();
      const dezembro = painelMes
        .getByRole("group", { name: `Meses de ${mesAnterior.slice(0, 4)}`, exact: true })
        .getByRole("button", { name: nomeDoMes(mesAnterior), exact: true });
      await expect(dezembro).toBeEnabled();
      await dezembro.focus();
      await expect(dezembro).toBeFocused();
    } else {
      await page.keyboard.press("ArrowLeft");
      await expect(
        gradeMes.getByRole("button", { name: nomeDoMes(mesAnterior), exact: true }),
      ).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(painelMes).toBeHidden();
    await expect(historico.locator("#mes-historico")).toHaveAttribute(
      "aria-label",
      `Mês do histórico: ${rotuloMes(mesAnterior)}`,
    );
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
    await escolherMesNoPeriodo(page, grade, "Mês da consulta", diaDeChamada().slice(0, 7));
    await expect(
      grade.getByRole("img", { name: /presente em parte das aulas/ }).first(),
    ).toBeVisible();

    // O seletor de mês da Grade abre, fecha com Esc e mantém este mês.
    await escolherMesNoPeriodo(page, grade, "Mês da consulta", diaCorrente().slice(0, 7));
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
    const desbloquear = painel.getByRole("button", { name: /Desbloquear chamada de E2E Ano A/ });
    const liberarSabado = painel
      .getByRole("button", { name: "Desbloquear sábado letivo", exact: true })
      .and(painel.locator("button:not(:disabled)"));
    // Espera a leitura ou a liberação do sábado antes de exigir a lista editável.
    await expect(
      desbloquear
        .or(liberarSabado)
        .or(painel.locator("ul li button[aria-pressed]:not([disabled])").first())
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    if (await desbloquear.isVisible().catch(() => false)) await desbloquearChamada(painel);
    await liberarSabadoSeNecessario(painel);
    await linha.locator("button[aria-pressed]").first().click();
    await linha.getByRole("combobox", { name: /Justificativa da falta/ }).click();
    await page.getByRole("option", { name: "Doente", exact: true }).click();
    await salvarChamada(painel);
    await expect(linha.getByText("FJ", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(linha.getByText("Doente").first()).toBeVisible();
  });
});
