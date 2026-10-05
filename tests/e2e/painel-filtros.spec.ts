// Painel: rolagem lateral entre escola, séries, período personalizado e desistentes.
// Confere os recortes, teclado, gesto no celular e preservação do formulário.
import { expect, test, type Page } from "@playwright/test";
import type { Aluno, Frequencia } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, rolarAteGrafico, trocarVisao } from "./helpers/pagina";

async function limparMassa(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Painel %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome like 'E2E Painel %')",
    );
    await cliente.query("delete from series where nome like 'E2E Painel %'");
  });
}

let origemOriginal: ConfiguracaoOrigem | null = null;

test.beforeAll(async () => {
  await limparMassa();
  origemOriginal = await lerOrigem();
  const serieUm: string[] = [];
  await comBanco(async (cliente) => {
    for (const [indice, nome] of ["E2E Painel Um", "E2E Painel Dois"].entries()) {
      const serie = await cliente.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, $2) returning id",
        [nome, 90 + indice],
      );
      const turma = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
        [serie.rows[0]?.id],
      );
      await cliente.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ($1, $2, $2, 1, true, $3)",
        [`E2E Painel Aluno ${indice + 1}`, turma.rows[0]?.id, indice === 0 ? "2020-01-01" : null],
      );
      // Aluno remanejado nas duas séries: chama na turma B e é da turma A de origem.
      const turmaB = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
        [serie.rows[0]?.id],
      );
      await cliente.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $3, 1, true)",
        [`E2E Painel Remanejado ${indice + 1}`, turmaB.rows[0]?.id, turma.rows[0]?.id],
      );
      if (indice === 0 && serie.rows[0]) serieUm.push(serie.rows[0].id);
    }
  });
  // Só a série "Um" está indicada em Origem na Chamada; a "Dois" tem dado divergente e não pode mostrar.
  await definirOrigem({
    origemNaChamada: true,
    origemNaChamadaSerieIds: serieUm,
    origemNaChamadaTurmaIds: [],
  });
});

test.afterAll(async () => {
  if (origemOriginal) await definirOrigem(origemOriginal);
  await limparMassa();
});

test("cada cartão do Painel mostra o gráfico e a cobertura do próprio escopo", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  await expect(page.getByRole("group", { name: "Filtro por série" })).toHaveCount(0);
  // Só o chip da Cobertura do dia: o mesmo nome também está em seletores da página.
  const pendente = (turma: string) =>
    page.getByRole("article").locator("span.bg-falta-fraca", { hasText: turma });

  await expect(page.getByRole("article", { name: /: Toda a escola$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^E2E Painel (Um|Dois)$/ })).toHaveCount(0);
  await expect(pendente("E2E Painel Dois A")).toBeVisible();

  await rolarAteGrafico(page, "E2E Painel Um");
  await expect(page.getByRole("heading", { name: "E2E Painel Um", exact: true })).toBeVisible();
  // Série com aluno remanejado: o gráfico pela turma original vem logo abaixo.
  await expect(
    page.getByRole("heading", { name: "E2E Painel Um por turma original" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "E2E Painel Dois" })).toHaveCount(0);
  await expect(pendente("E2E Painel Dois A")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toHaveCount(0);

  // Série sem remanejamento: um gráfico só.
  await rolarAteGrafico(page, "E2E Painel Dois");
  await expect(page.getByRole("heading", { name: "E2E Painel Dois", exact: true })).toBeVisible();
  await expect(page.getByRole("article").getByText("por turma original")).toHaveCount(0);

  await rolarAteGrafico(page, "Desistentes");
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Desistentes por série" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cobertura do dia" })).toHaveCount(0);
});

test("a faixa aceita teclado e mantém o cartão ao mudar a largura", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const faixa = page.getByRole("group", { name: "Cartões de gráficos" });
  await faixa.focus();
  await faixa.press("End");
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toBeVisible();
  await faixa.press("ArrowLeft");
  await expect(page.getByRole("region", { name: "Infrequência personalizada" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  const cartao = page.getByRole("article", { name: /: Personalizado$/ });
  await expect(cartao).toBeVisible();
  await expect
    .poll(() =>
      cartao.evaluate((elemento) => {
        const pai = elemento.parentElement;
        return pai
          ? Math.abs(elemento.getBoundingClientRect().left - pai.getBoundingClientRect().left)
          : Infinity;
      }),
    )
    .toBeLessThan(1);
  const seletor = page.getByRole("combobox", { name: "Série", exact: true });
  await seletor.focus();
  await seletor.press("ArrowLeft");
  await expect(cartao).toBeVisible();
  await expect(seletor).toBeFocused();
  await trocarVisao(page, "Chamada", "chamada");
  await trocarVisao(page, "Painel", "painel");
  await expect(cartao).toBeVisible();
  await faixa.focus();
  await faixa.press("Home");
  await expect(page.getByRole("heading", { name: "Toda a escola", exact: true })).toBeVisible();
  await faixa.press("ArrowRight");
  await expect(page.getByRole("article", { name: /: Toda a escola$/ })).toHaveCount(0);
});

test("no computador, setas e seletor alternam os gráficos e respeitam os limites", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Controles visíveis na largura de computador.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const controles = page.getByRole("group", { name: "Navegação dos gráficos" });
  const anterior = controles.getByRole("button", { name: "Gráfico anterior" });
  const proximo = controles.getByRole("button", { name: "Próximo gráfico" });
  const seletor = controles.getByRole("combobox", { name: "Gráfico em exibição" });
  await expect(controles).toBeVisible();
  await expect(anterior).toBeDisabled();
  await expect(seletor).toContainText("Toda a escola");
  await proximo.click();
  await expect(page.getByRole("article", { name: /: Toda a escola$/ })).toHaveCount(0);
  await expect(anterior).toBeEnabled();
  await anterior.click();
  await expect(page.getByRole("article", { name: /: Toda a escola$/ })).toBeInViewport();
  await expect(anterior).toBeDisabled();
  await seletor.click();
  await page.getByRole("option", { name: "Desistentes", exact: true }).click();
  await expect(page.getByRole("article", { name: /: Desistentes$/ })).toBeInViewport();
  await expect(proximo).toBeDisabled();
  await expect(seletor).toBeFocused();
  await anterior.click();
  await expect(page.getByRole("article", { name: /: Personalizado$/ })).toBeInViewport();
  await expect(seletor).toContainText("Personalizado");
  await page.getByRole("group", { name: "Cartões de gráficos" }).press("Home");
  await expect(seletor).toContainText("Toda a escola");
  await expect(anterior).toBeDisabled();
});

test("no celular, a faixa rola sem alargar a página e ajusta a altura", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  await expect(page.getByRole("group", { name: "Navegação dos gráficos" })).toHaveCount(0);
  await rolarAteGrafico(page, "Personalizado");
  await rolarAteGrafico(page, "Desistentes");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect
    .poll(() =>
      page.getByRole("group", { name: "Cartões de gráficos" }).evaluate((elemento) => {
        const cartao = elemento.querySelector('[aria-hidden="false"]');
        return cartao ? elemento.clientHeight - cartao.getBoundingClientRect().height : Infinity;
      }),
    )
    .toBeLessThan(12);
  // O Playwright não oferece roda do mouse no WebKit móvel.
  if (browserName === "chromium") {
    const faixa = page.getByRole("group", { name: "Cartões de gráficos" });
    const pagina = page.getByRole("group", { name: "Painel", exact: true });
    await pagina.evaluate((elemento) => elemento.scrollTo({ top: 0 }));
    await faixa.hover();
    await page.mouse.wheel(0, 200);
    await expect.poll(() => pagina.evaluate((elemento) => elemento.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => faixa.evaluate((elemento) => elemento.scrollTop)).toBe(0);
  }
});

test("o gesto de deslizar no Android troca o gráfico", async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "Gesto nativo por CDP disponível no Android.");
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const faixa = page.getByRole("group", { name: "Cartões de gráficos" });
  await faixa.scrollIntoViewIfNeeded();
  const caixa = await faixa.boundingBox();
  if (!caixa) throw new Error("Faixa não encontrada.");
  const sessao = await page.context().newCDPSession(page);
  const y = caixa.y + 80;
  const x = caixa.x + caixa.width - 30;
  await sessao.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let passo = 1; passo <= 10; passo += 1) {
    await sessao.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x - ((caixa.width - 60) * passo) / 10, y }],
    });
    await page.waitForTimeout(20);
  }
  await sessao.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sessao.detach();
  await expect(page.getByRole("article", { name: /: Toda a escola$/ })).toHaveCount(0);
  await expect(page.getByRole("article")).toBeInViewport();
});

test.describe("gráfico personalizado por período", () => {
  // A consulta simulada cobre estados de rede sem interferência do cache do PWA.
  test.use({ serviceWorkers: "block" });

  async function abrirPersonalizado(page: Page) {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Painel", "painel");
    await rolarAteGrafico(page, "Personalizado");
    return page.getByRole("region", { name: "Infrequência personalizada" });
  }

  async function escolherDia(page: Page, id: string, mes: string, dia: string) {
    await page.locator(id).click();
    const calendario = page.getByRole("dialog", {
      name: id === "#periodo-painel-de" ? "Data inicial do gráfico" : "Data final do gráfico",
      exact: true,
    });
    for (let indice = 0; indice < 36; indice += 1) {
      if (await calendario.getByRole("group", { name: `Dias de ${mes}` }).count()) break;
      const grade = calendario.getByRole("group", { name: /^Dias de / });
      const anterior = await grade.getAttribute("aria-label");
      await calendario.getByRole("button", { name: "Mês anterior" }).click();
      await expect(grade).not.toHaveAttribute("aria-label", anterior ?? "");
    }
    await calendario.getByRole("button", { name: dia, exact: true }).click();
    await expect(calendario).toHaveCount(0);
  }

  async function chamadasSinteticas(page: Page): Promise<Frequencia[]> {
    const { alunos } = (await (await page.request.get("/api/alunos")).json()) as {
      alunos: Aluno[];
    };
    const um = alunos.find((item) => item.nome === "E2E Painel Remanejado 1");
    const dois = alunos.find((item) => item.nome === "E2E Painel Remanejado 2");
    if (!um || !dois) throw new Error("Massa sintética do Painel não encontrada.");
    return [
      {
        dia: "2026-08-31",
        turmaId: um.turmaId,
        alunos: [um.id],
        faltas: [{ alunoId: um.id, horarios: ["aula-sintetica"] }],
        revisao: 1,
        atualizadoEm: "2026-08-31T12:00:00Z",
      },
      {
        dia: "2026-09-01",
        turmaId: um.turmaId,
        alunos: [um.id],
        faltas: [],
        revisao: 1,
        atualizadoEm: "2026-09-01T12:00:00Z",
      },
      {
        dia: "2026-09-01",
        turmaId: dois.turmaId,
        alunos: [dois.id],
        faltas: [{ alunoId: dois.id, horarios: ["aula-sintetica"], justificativa: "D" }],
        revisao: 1,
        atualizadoEm: "2026-09-01T12:00:00Z",
      },
    ];
  }

  test("gera entre meses, filtra série e turma e volta ao gráfico diário", async ({ page }) => {
    const painel = await abrirPersonalizado(page);
    const chamadas = await chamadasSinteticas(page);
    const consultas: string[] = [];
    await page.route("**/api/frequencias?de=**", async (rota) => {
      consultas.push(new URL(rota.request().url()).search);
      await rota.fulfill({ json: { frequencias: chamadas } });
    });
    const nomes = await page
      .locator('article[aria-roledescription="cartão"]')
      .evaluateAll((elementos) => elementos.map((item) => item.getAttribute("aria-label")));
    expect(nomes.at(-2)).toMatch(/: Personalizado$/);
    expect(nomes.at(-1)).toMatch(/: Desistentes$/);
    await expect(page.getByRole("group", { name: "Resumo do dia" })).toBeVisible();
    await escolherDia(page, "#periodo-painel-de", "Agosto de 2026", "31 de agosto de 2026");
    await escolherDia(page, "#periodo-painel-ate", "Setembro de 2026", "1 de setembro de 2026");
    await expect(painel.getByRole("combobox", { name: "Turma", exact: true })).toBeDisabled();
    await painel.getByRole("button", { name: "Gerar gráfico", exact: true }).click();
    await expect(painel.getByRole("img", { name: "Faltas do período por série" })).toBeVisible();
    await expect(painel.getByText("De 31/08/2026 a 01/09/2026", { exact: true })).toBeVisible();
    const resumo = painel.getByRole("group", { name: "Resumo do período" });
    await expect(resumo).toContainText("66,7%");
    await expect(resumo.locator("strong")).toHaveText(["2", "3", "66,7%"]);
    expect(consultas).toEqual(["?de=2026-08-31&ate=2026-09-01"]);

    await painel.getByRole("combobox", { name: "Série", exact: true }).click();
    await page.getByRole("option", { name: "E2E Painel Um", exact: true }).click();
    await expect(resumo).toHaveCount(0);
    await painel.getByRole("combobox", { name: "Turma", exact: true }).click();
    await page.getByRole("option", { name: "E2E Painel Um B", exact: true }).click();
    await painel.getByRole("button", { name: "Gerar gráfico", exact: true }).click();
    await expect(
      painel.getByRole("img", { name: "Faltas do período por turma da E2E Painel Um" }),
    ).toBeVisible();
    await expect(resumo.locator("strong")).toHaveText(["1", "2", "50%"]);
    await expect(painel.getByRole("list")).not.toContainText("E2E Painel Dois");

    await rolarAteGrafico(page, "Toda a escola");
    await expect(painel).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Resumo do dia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Toda a escola", exact: true })).toBeVisible();
    await rolarAteGrafico(page, "Personalizado");
    await expect(
      painel.getByRole("group", { name: "Resumo do período" }).locator("strong"),
    ).toHaveText(["1", "2", "50%"]);
    await expect(painel.getByRole("combobox", { name: "Turma", exact: true })).toContainText(
      "E2E Painel Um B",
    );
  });

  test("distingue período vazio, presença sem falta e falha com nova tentativa", async ({
    page,
  }) => {
    const painel = await abrirPersonalizado(page);
    const chamadas = await chamadasSinteticas(page);
    let estado: "vazio" | "presenca" | "erro" = "vazio";
    await page.route("**/api/frequencias?de=**", async (rota) => {
      if (estado === "erro")
        await rota.fulfill({
          status: 503,
          json: { error: "Não foi possível carregar o período." },
        });
      else
        await rota.fulfill({
          json: {
            frequencias:
              estado === "vazio"
                ? []
                : chamadas.map((item) => ({
                    ...item,
                    dia: new URL(rota.request().url()).searchParams.get("de") ?? "",
                    faltas: [],
                  })),
          },
        });
    });
    const gerar = painel.getByRole("button", { name: "Gerar gráfico", exact: true });
    await gerar.click();
    await expect(painel.getByText("Nenhuma chamada salva neste período e recorte")).toBeVisible();
    await expect(painel.getByRole("group", { name: "Resumo do período" })).toContainText(
      "Sem dados",
    );
    estado = "presenca";
    await gerar.click();
    await expect(
      painel.getByText("Nenhuma falta registrada neste período e recorte"),
    ).toBeVisible();
    await expect(painel.getByRole("group", { name: "Resumo do período" })).toContainText("0%");
    estado = "erro";
    await gerar.click();
    await expect(painel.getByRole("alert")).toHaveText("Não foi possível carregar o período.");
    await expect(painel.getByRole("group", { name: "Resumo do período" })).toHaveCount(0);
    estado = "vazio";
    await gerar.click();
    await expect(painel.getByRole("alert")).toHaveCount(0);
    await expect(painel.getByText("Nenhuma chamada salva neste período e recorte")).toBeVisible();
  });

  test("recusa intervalo invertido e maior que 366 dias sem consultar a API", async ({ page }) => {
    const painel = await abrirPersonalizado(page);
    let consultas = 0;
    await page.route("**/api/frequencias?de=**", async (rota) => {
      consultas += 1;
      await rota.fulfill({ json: { frequencias: [] } });
    });
    await escolherDia(page, "#periodo-painel-ate", "Agosto de 2026", "31 de agosto de 2026");
    await painel.getByRole("button", { name: "Gerar gráfico", exact: true }).click();
    await expect(painel.getByRole("alert")).toHaveText(
      "A data final deve ser igual ou posterior à inicial.",
    );
    await escolherDia(page, "#periodo-painel-de", "Agosto de 2025", "1 de agosto de 2025");
    await painel.getByRole("button", { name: "Gerar gráfico", exact: true }).click();
    await expect(painel.getByRole("alert")).toHaveText(
      "O período é grande demais. Escolha até 366 dias.",
    );
    expect(consultas).toBe(0);
  });

  test("no celular, os controles e o gráfico cabem em 360 pixels", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const painel = await abrirPersonalizado(page);
    const chamadas = await chamadasSinteticas(page);
    await page.route("**/api/frequencias?de=**", async (rota) => {
      await rota.fulfill({
        json: {
          frequencias: chamadas
            .filter((item) => item.dia === "2026-09-01")
            .map((item) => ({
              ...item,
              dia: new URL(rota.request().url()).searchParams.get("de") ?? "",
            })),
        },
      });
    });
    await painel.getByRole("button", { name: "Gerar gráfico", exact: true }).click();
    await expect(painel.getByRole("img", { name: "Faltas do período por série" })).toBeVisible();
    const semCorte = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(semCorte).toBe(true);
  });
});
