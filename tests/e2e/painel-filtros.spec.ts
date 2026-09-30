// Painel: cada botão mostra só o seu escopo. Escola tem um gráfico, a série
// escolhida mostra só as próprias turmas e Desistentes tem gráfico à parte.
import { expect, test, type Page } from "@playwright/test";
import type { Aluno, Frequencia } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

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

test("cada botão do Painel mostra só o gráfico do seu escopo", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const filtros = page.getByRole("group", { name: "Filtro por série" });
  // Só o chip da Cobertura do dia: o mesmo nome também está em seletores da página.
  const pendente = (turma: string) => page.locator("span.bg-falta-fraca", { hasText: turma });

  await expect(filtros.getByRole("button", { name: "Escola" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^E2E Painel (Um|Dois)$/ })).toHaveCount(0);
  await expect(pendente("E2E Painel Dois A")).toBeVisible();

  await filtros.getByRole("button", { name: "E2E Painel Um" }).click();
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
  await filtros.getByRole("button", { name: "E2E Painel Dois" }).click();
  await expect(page.getByRole("heading", { name: "E2E Painel Dois", exact: true })).toBeVisible();
  await expect(page.getByText("por turma original")).toHaveCount(0);

  await filtros.getByRole("button", { name: "Desistentes" }).click();
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Desistentes por série" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cobertura do dia" })).toHaveCount(0);
});

test("no celular, a fila de botões quebra linha sem cortar o Desistentes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const botao = page
    .getByRole("group", { name: "Filtro por série" })
    .getByRole("button", { name: "Desistentes" });
  await expect(botao).toBeInViewport({ ratio: 1 });
});

test.describe("gráfico personalizado por período", () => {
  // A consulta simulada cobre estados de rede sem interferência do cache do PWA.
  test.use({ serviceWorkers: "block" });

  async function abrirPersonalizado(page: Page) {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Painel", "painel");
    await page
      .getByRole("group", { name: "Filtro por série" })
      .getByRole("button", { name: "Personalizado" })
      .click();
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
    const filtros = page.getByRole("group", { name: "Filtro por série" });
    const nomes = await filtros.getByRole("button").allTextContents();
    expect(nomes.at(-2)).toBe("Personalizado");
    expect(nomes.at(-1)).toBe("Desistentes");
    await expect(page.getByRole("group", { name: "Resumo do dia" })).toHaveCount(0);
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

    await filtros.getByRole("button", { name: "Escola", exact: true }).click();
    await expect(painel).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Resumo do dia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Toda a escola", exact: true })).toBeVisible();
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
                : chamadas.map((item) => ({ ...item, dia: "2026-09-01", faltas: [] })),
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
        json: { frequencias: chamadas.filter((item) => item.dia === "2026-09-01") },
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
