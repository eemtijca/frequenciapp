// Painel Turmas com séries recolhíveis, progresso e bloqueios de edição.
// Gestão mantém a seleção de origem recolhível. Dados sintéticos.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaDeChamada } from "./helpers/dia";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, liberarSabadoSeNecessario, trocarVisao } from "./helpers/pagina";

// As leituras interceptadas passam pelo navegador; a cobertura do worker é separada.
test.use({ serviceWorkers: "block" });

const series = ["Faixa Um E2E Serie", "Faixa Dois E2E Serie", "Faixa Tres E2E Serie"];
let inicial: ConfiguracaoOrigem;
const turmasDoProgresso = new Map<string, string>();

function diaAtual(): string {
  return diaDeChamada();
}

async function abrirChamada(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  return page.getByRole("region", { name: "Fazer chamada", exact: true });
}

async function abrirPrimeiraSerie(secao: Locator): Promise<Locator> {
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  if ((await gatilho.getAttribute("aria-expanded")) !== "true") await gatilho.click();
  const serie = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  if ((await serie.getAttribute("aria-expanded")) !== "true") await serie.click();
  return grupo;
}

async function salvarPelaApi(page: Page, turma: string, revisao = 0): Promise<void> {
  const resposta = await page.request.post("/api/frequencias", {
    data: { dia: diaAtual(), turmaId: turmasDoProgresso.get(turma), revisao, faltas: [] },
  });
  expect(resposta.ok()).toBe(true);
}

async function limpar(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = any($1)))",
      [series],
    );
    await cliente.query("delete from alunos where nome like 'E2E Serie %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = any($1))",
      [series],
    );
    await cliente.query("delete from series where nome = any($1)", [series]);
  });
}

test.beforeAll(async () => {
  inicial = await lerOrigem();
  await limpar();
  await comBanco(async (cliente) => {
    for (const [indice, nome] of series.entries()) {
      const serie = await cliente.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, $2) returning id",
        [nome, 80 + indice],
      );
      for (const turma of ["A", "B"]) {
        const criada = await cliente.query<{ id: string }>(
          "insert into turmas (serie_id, nome) values ($1, $2) returning id",
          [serie.rows[0]?.id, turma],
        );
        await cliente.query(
          "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $2, 1, true)",
          [`E2E Serie ${indice + 1}${turma}`, criada.rows[0]?.id],
        );
        await cliente.query(
          "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2)",
          [criada.rows[0]?.id, [1, 2, 3, 4, 5, 6, 7]],
        );
        if (indice === 0) turmasDoProgresso.set(turma, criada.rows[0]?.id ?? "");
      }
    }
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ('E2E Serie 1B Extra Um', $1, $1, 2, true, null), ('E2E Serie 1B Extra Dois', $1, $1, 3, true, null), ('E2E Serie 1B Desistente', $1, $1, 4, true, '2020-01-01')",
      [turmasDoProgresso.get("B")],
    );
    const neutras = await cliente.query<{ id: string; nome: string }>(
      "insert into turmas (serie_id, nome) select id, unnest(array['C', 'D']) from series where nome = $1 returning id, nome",
      [series[0]],
    );
    for (const turma of neutras.rows) turmasDoProgresso.set(turma.nome, turma.id);
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ('E2E Serie 1D Desistente', $1, $1, 1, true, '2020-01-01')",
      [turmasDoProgresso.get("D")],
    );
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = any($1)))",
      [series],
    );
  });
});

test.afterAll(async () => {
  await definirOrigem(inicial);
  await limpar();
});

test("Chamada: Turmas recolhe todo o painel e cada série contém suas turmas", async ({
  page,
  isMobile,
}) => {
  const secao = await abrirChamada(page);
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  const segunda = grupo.getByRole("button", { name: series[1] ?? "", exact: true });
  const turmaA = grupo.getByRole("button", { name: "Faixa Dois E2E Serie A", exact: true });
  const turmaB = grupo.getByRole("button", { name: "Faixa Dois E2E Serie B", exact: true });
  await expect(gatilho).toHaveAttribute("aria-expanded", "false");
  await expect(segunda).toBeHidden();
  await gatilho.click();
  await segunda.click();
  await expect(segunda).toHaveAttribute("aria-expanded", "true");
  await expect(turmaA).toHaveAttribute("aria-pressed", "true");
  const bloco = segunda.locator("..");
  await expect(
    bloco.getByRole("button", { name: "Faixa Dois E2E Serie B", exact: true }),
  ).toBeVisible();
  if (isMobile) await turmaB.click();
  else {
    await turmaB.focus();
    await page.keyboard.press("Enter");
  }
  await expect(turmaB).toHaveAttribute("aria-pressed", "true");
  await segunda.click();
  await expect(turmaB).toBeHidden();
  await segunda.click();
  await expect(turmaB).toHaveAttribute("aria-pressed", "true");
  await gatilho.click();
  await expect(segunda).toBeHidden();
  await expect(turmaB).toBeHidden();
  await gatilho.focus();
  await page.keyboard.press("Space");
  await expect(turmaB).toHaveAttribute("aria-pressed", "true");
  await turmaB.focus();
  await page.keyboard.press("Escape");
  await expect(gatilho).toBeFocused();
  await expect(turmaB).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(turmaB).toBeVisible();
  await expect(page.getByText("E2E Serie 2B", { exact: true }).first()).toBeVisible();
});

test("Chamada: painel compacto e barra cabem em telas pequenas e ampliadas", async ({
  page,
}, testInfo) => {
  const secao = await abrirChamada(page);
  const grupo = await abrirPrimeiraSerie(secao);
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  for (const largura of [320, 360, 768, 1280]) {
    await page.setViewportSize({ width: largura, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    const caixa = await gatilho.boundingBox();
    expect(caixa?.height).toBeGreaterThanOrEqual(44);
    expect(caixa?.height).toBeLessThanOrEqual(64);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(largura);
    await expect(gatilho.locator("[data-progresso]")).toHaveAttribute("data-progresso", "0");
    for (const nome of series)
      await expect(grupo.getByRole("button", { name: nome, exact: true })).toBeVisible();
    const serie = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
    const bloco = serie.locator("..");
    for (const nome of ["A", "B"]) {
      const turma = bloco.getByRole("button", { name: `Faixa Um E2E Serie ${nome}`, exact: true });
      await expect(turma.locator("[data-progresso]")).toHaveAttribute("data-progresso", "0");
      const circulo = await turma.boundingBox();
      expect(circulo?.height).toBeGreaterThanOrEqual(44);
      expect(circulo?.width).toBeLessThanOrEqual(64);
      const anel = await turma.locator("svg").boundingBox();
      expect(anel?.width).toBeGreaterThanOrEqual((circulo?.width ?? 0) - 10);
      expect(Math.abs((circulo?.width ?? 0) - (circulo?.height ?? 0))).toBeLessThanOrEqual(1);
      expect((circulo?.x ?? 0) + (circulo?.width ?? 0)).toBeLessThanOrEqual(largura);
      await expect(turma.locator('[aria-hidden="true"]').filter({ hasText: /%/ })).toHaveCount(0);
    }
    await testInfo.attach(`Turmas agrupadas ${largura}px`, {
      body: await grupo.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  }
});

test("Chamada: progresso por série acompanha o salvamento e muda com a data", async ({
  page,
}, testInfo) => {
  const secao = await abrirChamada(page);
  const grupo = await abrirPrimeiraSerie(secao);
  const serie = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  const turmaA = grupo.getByRole("button", { name: "Faixa Um E2E Serie A", exact: true });
  const turmaB = grupo.getByRole("button", { name: "Faixa Um E2E Serie B", exact: true });
  const percentual = serie.locator(':scope > span[aria-hidden="true"]').nth(1);

  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaA).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB).toHaveAttribute("data-situacao", "pendente");
  await expect(percentual).toHaveText("0%");
  for (const nome of ["C", "D"]) {
    const neutra = grupo.getByRole("button", { name: `Faixa Um E2E Serie ${nome}`, exact: true });
    await expect(neutra).toHaveAttribute("data-situacao", "sem-alunos");
    await expect(neutra.locator("[data-progresso]")).toHaveCount(0);
    await expect(neutra.locator('[aria-hidden="true"]').filter({ hasText: /%/ })).toHaveCount(0);
  }
  await expect(turmaB).toHaveAccessibleDescription(/3 alunos.*pendente/i);

  await liberarSabadoSeNecessario(secao);
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(turmaA).toHaveAttribute("data-situacao", "concluida");
  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(percentual).toHaveText("25%");
  await expect(serie.getByText("25%", { exact: true })).toBeVisible();
  await expect(turmaA.locator("[data-progresso]")).toHaveAttribute("data-progresso", "100");
  const corPendente = await turmaB
    .locator("[data-progresso]")
    .evaluate((anel) => getComputedStyle(anel).color);
  await expect
    .poll(() => turmaA.locator("[data-progresso]").evaluate((anel) => getComputedStyle(anel).color))
    .not.toBe(corPendente);
  await expect(turmaB.locator("[data-progresso]")).toHaveAttribute("data-progresso", "0");
  // Registra os dois temas na largura de cada projeto, sem incluir dados reais.
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await expect(page.locator("html")).toHaveClass(tema === "dark" ? /dark/ : /light/);
    await testInfo.attach(`Seletores com barras ${tema}`, {
      body: await grupo.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  }

  await turmaB.click();
  await liberarSabadoSeNecessario(secao);
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(turmaB).toHaveAttribute("data-situacao", "concluida");
  await expect(serie).toHaveAttribute("data-situacao", "concluida");
  await expect(percentual).toHaveText("100%");
  await expect(turmaB.locator("[data-progresso]")).toHaveAttribute("data-progresso", "100");
  await testInfo.attach("Barras com chamadas concluídas", {
    body: await grupo.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });

  await secao.getByRole("button", { name: "Dia anterior", exact: true }).click();
  await expect(turmaA).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB).toHaveAttribute("data-situacao", "pendente");
  await expect(percentual).toHaveText("0%");
  await expect(serie.getByText("100%", { exact: true })).toHaveCount(0);
  await secao.getByRole("button", { name: "Voltar para hoje", exact: true }).click();
  await expect(serie).toHaveAttribute("data-situacao", "concluida");
});

test("Chamada: rascunho e conflito deixam somente a turma alterada pendente", async ({ page }) => {
  await salvarPelaApi(page, "A");
  await salvarPelaApi(page, "B");
  let secao = await abrirChamada(page);
  let grupo = await abrirPrimeiraSerie(secao);
  const serie = () => grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  const turmaA = () => grupo.getByRole("button", { name: "Faixa Um E2E Serie A", exact: true });
  const turmaB = () => grupo.getByRole("button", { name: "Faixa Um E2E Serie B", exact: true });
  await expect(serie()).toHaveAttribute("data-situacao", "concluida");
  await secao.getByRole("button", { name: /^Desbloquear chamada de Faixa Um/ }).click();
  await secao.getByRole("button", { name: /^E2E Serie 1A:/ }).click();
  await expect(turmaA()).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB()).toHaveAttribute("data-situacao", "concluida");
  await expect(turmaA().locator("[data-progresso]")).toHaveAttribute("data-progresso", "0");
  await expect(turmaB().locator("[data-progresso]")).toHaveAttribute("data-progresso", "100");
  await expect(serie().getByText("75%", { exact: true })).toBeVisible();
  await expect(turmaB()).toBeDisabled();
  await expect(grupo.getByRole("button", { name: series[1] ?? "", exact: true })).toBeDisabled();
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  await gatilho.click();
  await gatilho.click();
  await expect(turmaA()).toHaveAttribute("data-situacao", "pendente");
  await expect(secao.getByRole("button", { name: "Dia anterior", exact: true })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => Object.keys(sessionStorage).some((chave) => chave.endsWith(`:${id}`)),
        turmasDoProgresso.get("A"),
      ),
    )
    .toBe(true);
  // Um rascunho recuperado mantém a pendência até ser salvo ou descartado.
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  // Aguarda o aviso antes de tocar no cabeçalho; o hover do teste pausa o aviso.
  const aviso = page.getByText("Rascunho recuperado. Desbloqueie a chamada, confira e salve.", {
    exact: true,
  });
  await expect(aviso).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(aviso).toHaveCount(0);
  grupo = await abrirPrimeiraSerie(secao);
  await expect(turmaA()).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB()).toHaveAttribute("data-situacao", "concluida");
  await secao.getByRole("button", { name: /^Desbloquear chamada de Faixa Um/ }).click();

  // Outra pessoa salva uma revisão posterior, enquanto o rascunho continua local.
  await salvarPelaApi(page, "A", 1);
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  const recarregar = secao.getByRole("button", { name: "Recarregar versão salva", exact: true });
  await expect(recarregar).toBeVisible();
  await expect(turmaA()).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB()).toHaveAttribute("data-situacao", "concluida");
  await expect(turmaB()).toBeDisabled();
  await recarregar.click();
  await expect(serie()).toHaveAttribute("data-situacao", "concluida");
  await expect(serie().getByText("100%", { exact: true })).toBeVisible();
});

test("Chamada: carregamento e falha de leitura mostram estado neutro até a recuperação", async ({
  page,
}) => {
  let liberarLeitura: (() => void) | undefined;
  const leituraPendente = new Promise<void>((resolver) => {
    liberarLeitura = resolver;
  });
  let falhar = true;
  await page.route("**/api/frequencias?dia=**", async (rota) => {
    await leituraPendente;
    await rota.fulfill(
      falhar
        ? { status: 503, json: { error: "Não foi possível carregar a frequência." } }
        : { json: { frequencias: [] } },
    );
  });
  const secao = await abrirChamada(page);
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const serie = grupo.getByRole("button", { name: "Turmas", exact: true });
  await expect(serie).toHaveAttribute("data-situacao", "carregando");
  await expect(serie.locator("[data-progresso]")).toHaveCount(0);
  liberarLeitura?.();
  await expect(serie).toHaveAttribute("data-situacao", "indisponivel");
  await expect(serie.locator("[data-progresso]")).toHaveCount(0);
  falhar = false;
  await secao.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(serie.getByText("0%", { exact: true })).toBeVisible();
});

test("Gestão: as turmas específicas da origem ficam numa seção recolhível", async ({ page }) => {
  await definirOrigem({
    origemNaChamada: true,
    origemNaChamadaSerieIds: [],
    origemNaChamadaTurmaIds: [],
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: /Config/ }).click();
  const secao = page.locator('[data-secao="config-origem-turmas"]');
  const gatilho = secao.getByRole("button", { name: /Turmas específicas/ });
  const caixa = page.getByRole("checkbox", {
    name: "Mostrar origem na turma Faixa Um E2E Serie A",
  });

  await expect(gatilho).toHaveAttribute("aria-expanded", "false");
  await expect(caixa).toHaveCount(0);
  await gatilho.click();
  await expect(gatilho).toHaveAttribute("aria-expanded", "true");
  await expect(caixa).toBeVisible();
  await gatilho.click();
  await expect(caixa).toHaveCount(0);
});
