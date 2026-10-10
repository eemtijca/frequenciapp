// Chamada com um botão por série, que expande e recolhe as turmas, e Gestão com
// as turmas específicas da origem numa seção recolhível. Dados sintéticos.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

// As leituras interceptadas passam pelo navegador; a cobertura do worker é separada.
test.use({ serviceWorkers: "block" });

const series = ["Faixa Um E2E Serie", "Faixa Dois E2E Serie", "Faixa Tres E2E Serie"];
let inicial: ConfiguracaoOrigem;
const turmasDoProgresso = new Map<string, string>();

function diaAtual(): string {
  return diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
}

async function abrirChamada(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  return page.getByRole("region", { name: "Fazer chamada", exact: true });
}

async function abrirPrimeiraSerie(secao: Locator): Promise<Locator> {
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const serie = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  await expect(serie).toBeEnabled();
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

test("Chamada: tocar na série mostra só as turmas dela e seleciona a primeira", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const botaoUm = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  const botaoDois = grupo.getByRole("button", { name: series[1] ?? "", exact: true });
  const turmaDoisA = grupo.getByRole("button", { name: /Faixa Dois E2E Serie A/ });
  const turmaDoisB = grupo.getByRole("button", { name: /Faixa Dois E2E Serie B/ });
  const turmaUmA = grupo.getByRole("button", { name: /Faixa Um E2E Serie A/ });

  await botaoDois.click();
  await expect(botaoDois).toHaveAttribute("aria-pressed", "true");
  await expect(botaoUm).toHaveAttribute("aria-pressed", "false");
  await expect(turmaDoisA).toHaveAttribute("aria-pressed", "true");
  await expect(botaoDois).toHaveAccessibleDescription(/2 alunos.*pendente/i);
  await expect(turmaDoisA).toHaveAccessibleDescription(/1 aluno.*pendente/i);
  await expect(turmaUmA).toHaveCount(0);
  await expect(page.getByText("E2E Serie 2A", { exact: true }).first()).toBeVisible();

  if (isMobile) await turmaDoisB.click();
  else {
    await expect(turmaDoisB).toBeEnabled();
    await turmaDoisB.focus();
    await page.keyboard.press("Enter");
  }
  await expect(turmaDoisB).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisA).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("E2E Serie 2B", { exact: true }).first()).toBeVisible();

  // Recolher e reabrir a série preserva a turma B, por toque ou teclado.
  if (isMobile) await botaoDois.click();
  else {
    await botaoDois.focus();
    await page.keyboard.press("Space");
  }
  await expect(botaoDois).toHaveAttribute("aria-expanded", "false");
  await expect(botaoDois).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisB).toHaveCount(0);
  if (isMobile) await botaoDois.click();
  else await page.keyboard.press("Enter");
  await expect(botaoDois).toHaveAttribute("aria-expanded", "true");
  await expect(turmaDoisB).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("E2E Serie 2B", { exact: true }).first()).toBeVisible();

  // Voltar à primeira série seleciona a primeira turma dela.
  await botaoUm.click();
  await expect(botaoUm).toHaveAttribute("aria-pressed", "true");
  await expect(turmaUmA).toHaveAttribute("aria-pressed", "true");
  await expect(turmaDoisA).toHaveCount(0);
});

test("Chamada: no celular, as séries ficam lado a lado sem cortar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .locator('section[aria-label="Fazer chamada"]')
    .getByRole("group", { name: "Turma atual", exact: true });
  const serieInicial = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  if ((await serieInicial.getAttribute("aria-expanded")) !== "true") await serieInicial.click();
  await expect(grupo.getByRole("button", { name: /Faixa Um E2E Serie A/ })).toBeVisible();
  for (const largura of [320, 360]) {
    await page.setViewportSize({ width: largura, height: 740 });
    const estouro = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(estouro).toBe(false);
    if (largura === 320) {
      await testInfo.attach("Seletores circulares em 320px", {
        body: await grupo.screenshot(),
        contentType: "image/png",
      });
    }
    // O nome customizado, a contagem e o progresso cabem sem se sobrepor.
    for (const nome of [...series, "Faixa Um E2E Serie A", "Faixa Um E2E Serie B"]) {
      const botao = grupo.getByRole("button", { name: nome, exact: true });
      const caixa = await botao.boundingBox();
      expect(caixa).not.toBeNull();
      expect(caixa?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(largura);
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(Math.abs((caixa?.width ?? 0) - (caixa?.height ?? 0))).toBeLessThan(1);
      const linhas = botao.locator(':scope > span[aria-hidden="true"]');
      await expect(linhas).toHaveCount(3);
      const rotulo = linhas.nth(0).locator("span").first();
      const [nomeCaixa, alunosCaixa, progressoCaixa] = await Promise.all([
        rotulo.boundingBox(),
        linhas.nth(1).boundingBox(),
        linhas.nth(2).boundingBox(),
      ]);
      expect(nomeCaixa).not.toBeNull();
      expect(alunosCaixa).not.toBeNull();
      expect(progressoCaixa).not.toBeNull();
      if (caixa && nomeCaixa && alunosCaixa && progressoCaixa) {
        expect(nomeCaixa.y).toBeGreaterThanOrEqual(caixa.y);
        expect(nomeCaixa.y + nomeCaixa.height).toBeLessThanOrEqual(alunosCaixa.y + 1);
        expect(alunosCaixa.y + alunosCaixa.height).toBeLessThanOrEqual(progressoCaixa.y + 1);
        expect(progressoCaixa.y + progressoCaixa.height).toBeLessThanOrEqual(
          caixa.y + caixa.height,
        );
      }
    }
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
  const anel = serie.locator("svg[data-progresso]");

  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaA).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB).toHaveAttribute("data-situacao", "pendente");
  await expect(anel).toHaveAttribute("data-progresso", "0");
  await expect(serie.locator("[data-turma-id]")).toHaveCount(2);
  for (const nome of ["C", "D"]) {
    const neutra = grupo.getByRole("button", { name: `Faixa Um E2E Serie ${nome}`, exact: true });
    await expect(neutra).toHaveAttribute("data-situacao", "sem-alunos");
    await expect(serie.locator(`[data-turma-id="${turmasDoProgresso.get(nome)}"]`)).toHaveCount(0);
  }
  await expect(turmaB).toHaveAccessibleDescription(/3 alunos.*pendente/i);

  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(turmaA).toHaveAttribute("data-situacao", "concluida");
  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(anel).toHaveAttribute("data-progresso", "25");
  await expect(serie.getByText("25%", { exact: true })).toBeVisible();
  await expect(serie.locator(`[data-turma-id="${turmasDoProgresso.get("A")}"]`)).toHaveAttribute(
    "data-situacao",
    "concluida",
  );
  await expect(serie.locator(`[data-turma-id="${turmasDoProgresso.get("B")}"]`)).toHaveAttribute(
    "data-situacao",
    "pendente",
  );
  // Registra os dois temas na largura de cada projeto, sem incluir dados reais.
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await expect(page.locator("html")).toHaveClass(tema === "dark" ? /dark/ : /light/);
    await testInfo.attach(`Seletores circulares ${tema}`, {
      body: await grupo.screenshot(),
      contentType: "image/png",
    });
  }

  await turmaB.click();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(turmaB).toHaveAttribute("data-situacao", "concluida");
  await expect(serie).toHaveAttribute("data-situacao", "concluida");
  await expect(anel).toHaveAttribute("data-progresso", "100");
  await expect(serie.locator("[data-turma-id]")).toHaveCount(0);
  await expect(anel.locator('[data-situacao="concluida"]')).toHaveCount(1);

  await secao.getByRole("button", { name: "Dia anterior", exact: true }).click();
  await expect(turmaA).toHaveAttribute("data-situacao", "pendente");
  await expect(turmaB).toHaveAttribute("data-situacao", "pendente");
  await expect(anel).toHaveAttribute("data-progresso", "0");
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
  await expect(serie().locator("svg[data-progresso]")).toHaveAttribute("data-progresso", "75");
  await expect(turmaB()).toBeDisabled();
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
  await expect(serie().locator("svg[data-progresso]")).toHaveAttribute("data-progresso", "100");
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
  const serie = grupo.getByRole("button", { name: series[0] ?? "", exact: true });
  await expect(serie).toHaveAttribute("data-situacao", "carregando");
  await expect(serie.locator("svg[data-progresso]")).toHaveCount(0);
  liberarLeitura?.();
  await expect(serie).toHaveAttribute("data-situacao", "indisponivel");
  await expect(serie.locator("svg[data-progresso]")).toHaveCount(0);
  falhar = false;
  await secao.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(serie).toHaveAttribute("data-situacao", "pendente");
  await expect(serie.locator("svg[data-progresso]")).toHaveAttribute("data-progresso", "0");
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
