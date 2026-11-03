import { expect, test, type Page } from "@playwright/test";

const diagnosticos = new WeakMap<Page, { erros: string[]; avisos: string[] }>();
test.beforeEach(async ({ page }) => {
  const registros = { erros: [] as string[], avisos: [] as string[] };
  diagnosticos.set(page, registros);
  page.on("pageerror", (erro) => registros.erros.push(`pageerror: ${erro.message}`));
  page.on("console", (mensagem) => {
    if (mensagem.type() === "error") registros.erros.push(`console.error: ${mensagem.text()}`);
    if (mensagem.type() === "warning") registros.avisos.push(mensagem.text());
  });
});
test.afterEach(async ({ page }, info) => {
  const registros = diagnosticos.get(page);
  if (!registros) throw new Error("Diagnósticos da página não inicializados");
  const erroDeliberado = info.title === "mantém o estado de falha do limite ao ocultar e reabrir";
  if (erroDeliberado) {
    expect(registros.erros.some((erro) => erro.includes("Falha deliberada do gráfico"))).toBe(true);
  }
  expect(
    registros.erros.filter(
      (erro) => !(erroDeliberado && erro.includes("Falha deliberada do gráfico")),
    ),
  ).toEqual([]);
  expect(registros.avisos.filter((aviso) => /width\(|height\(/i.test(aviso))).toEqual([]);
});

async function graficoVisivel(page: Page, nome: string) {
  const container = page.getByRole("img", { name: nome }).locator(".recharts-responsive-container");
  await expect(container.locator("svg")).toBeVisible();
  const box = await container.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
}

test("mantém o estado de falha do limite ao ocultar e reabrir", async ({ page }) => {
  await page.goto("/tests/fixtures/graficos-visibilidade/?erro");
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar o gráfico");
  await page.getByRole("tab", { name: "Chamada" }).click();
  await page.getByRole("button", { name: "Corrigir causa" }).click();
  await page.getByRole("tab", { name: "Painel" }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar o gráfico");
  await expect(page.getByText("Gráfico recuperado sem reiniciar o limite")).toHaveCount(0);
});

for (const tema of ["light", "dark"] as const) {
  for (const largura of [390, 1280]) {
    test(`gráficos sobrevivem às trocas, ${largura}px ${tema}`, async ({ page }, info) => {
      const avisos: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning") avisos.push(msg.text());
      });
      await page.setViewportSize({ width: largura, height: 850 });
      await page.goto("/tests/fixtures/graficos-visibilidade/");
      await page.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "dark",
      );
      await graficoVisivel(page, "Rosca primeiro");
      await page.getByLabel("Observação").fill("estado preservado");
      const cartoes = page.getByRole("group", { name: "Cartões de gráficos" });
      await cartoes.focus();
      await page.keyboard.press("ArrowRight");
      await graficoVisivel(page, "Rosca segundo");
      await expect(
        page.locator('[data-cartao="primeiro"] [data-grafico-sob-demanda]'),
      ).toHaveAttribute("data-grafico-sob-demanda", "visitado");
      await expect(
        page.locator('[data-cartao="primeiro"] .recharts-responsive-container'),
      ).toHaveCount(1);
      await expect(page.locator('[data-cartao="primeiro"]')).toHaveAttribute("data-ativo", "false");
      await expect(page.locator('[data-cartao="primeiro"]')).toHaveCSS("visibility", "hidden");
      await page.getByRole("tab", { name: "Gráficos" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: "Outra" })).toBeFocused();
      await page.waitForTimeout(300);
      await expect(page.locator("#painel-graficos .recharts-responsive-container")).toHaveCount(0);
      await page.getByRole("tab", { name: "Gráficos" }).click();
      await graficoVisivel(page, "Rosca segundo");
      await page.getByRole("tab", { name: "Chamada" }).click();
      await page.waitForTimeout(300);
      await expect(page.locator("#painel-painel")).toHaveAttribute("inert", "");
      await expect(page.locator("#painel-painel .recharts-responsive-container")).toHaveCount(0);
      await expect(
        page.locator('[data-cartao="segundo"] [data-grafico-sob-demanda]'),
      ).toHaveAttribute("data-grafico-sob-demanda", "visitado");
      await page.getByRole("tab", { name: "Painel" }).click();
      await graficoVisivel(page, "Rosca segundo");
      await expect(page.getByLabel("Observação")).toHaveValue("estado preservado");
      await expect(page.getByRole("tab", { name: "Gráficos" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("status").filter({ hasText: "2 de 2" })).toHaveText(/Segundo/);
      await cartoes.focus();
      await page.keyboard.press("ArrowLeft");
      await graficoVisivel(page, "Rosca primeiro");
      await page.screenshot({ path: info.outputPath("graficos.png") });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        avisos.filter((aviso) => /width\(0\).*height\(0\)/s.test(aviso)),
        avisos.join("\n"),
      ).toEqual([]);
    });
  }
}

test("aquece o cartão visível fora da viewport e mantém estados vazios", async ({ page }) => {
  const avisos: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") avisos.push(msg.text());
  });
  await page.goto("/tests/fixtures/graficos-visibilidade/?aquecimento");
  const card = page.locator('[data-cartao="aquecido"]');
  await expect(card.locator('[data-grafico-sob-demanda="visitado"]')).toBeAttached();
  await expect(card.locator("svg.recharts-surface")).toBeAttached();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: "Próximo gráfico" }).click();
  await expect(page.getByText("Nenhuma falta registrada")).toBeVisible();
  await expect(page.locator('[aria-label="Gráficos do painel"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Gráfico anterior" }).click();
  await graficoVisivel(page, "Rosca aquecida");
  await page.waitForTimeout(300);
  expect(
    avisos.filter((aviso) => /width\(0\).*height\(0\)/s.test(aviso)),
    avisos.join("\n"),
  ).toEqual([]);
});

test("não carrega código lazy enquanto gráfico pronto está oculto", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "IntersectionObserver");
  });
  const downloads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/src/components/painel/grafico-rosca.tsx"))
      downloads.push(request.url());
  });
  await page.goto("/tests/fixtures/graficos-visibilidade/?lazy-oculto");
  await expect(page.locator('[data-grafico-sob-demanda="visitado"]')).toBeAttached();
  expect(downloads).toEqual([]);
  await page.getByRole("button", { name: "Mostrar gráfico" }).click();
  await graficoVisivel(page, "Rosca inicialmente oculta");
  expect(downloads).toHaveLength(1);
});

test("funciona sem IntersectionObserver nas trocas de abas e cartões", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "IntersectionObserver");
  });
  await page.goto("/tests/fixtures/graficos-visibilidade/");
  await graficoVisivel(page, "Rosca primeiro");
  await page.getByRole("button", { name: "Próximo gráfico" }).click();
  await graficoVisivel(page, "Rosca segundo");
  await page.getByRole("tab", { name: "Chamada" }).click();
  await expect(page.locator("#painel-painel .recharts-responsive-container")).toHaveCount(0);
  await page.getByRole("tab", { name: "Painel" }).click();
  await graficoVisivel(page, "Rosca segundo");
});

test("desmonta o gráfico oculto e não retém foco que deixa de existir", async ({ page }) => {
  await page.goto("/tests/fixtures/graficos-visibilidade/");
  await graficoVisivel(page, "Rosca primeiro");
  const grafico = page.getByRole("img", { name: "Rosca primeiro" }).getByRole("application");
  await grafico.focus();
  await expect(grafico).toBeFocused();
  // A troca programática não transfere o foco antes de ocultar o ancestral.
  await page
    .getByRole("button", { name: "Próximo gráfico" })
    .evaluate((botao: HTMLElement) => botao.click());
  await expect(grafico).toHaveCount(0);
  await page.getByRole("button", { name: "Gráfico anterior" }).click();
  await graficoVisivel(page, "Rosca primeiro");
  await expect(grafico).not.toBeFocused();
});

test("mostra espera durante carregamento lazy e exibe gráfico depois", async ({ page }) => {
  let liberar!: () => void;
  let requisitado!: () => void;
  const requisicao = new Promise<void>((resolve) => {
    requisitado = resolve;
  });
  const atraso = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await page.route("**/src/components/painel/grafico-rosca.tsx*", async (rota) => {
    requisitado();
    await atraso;
    await rota.continue();
  });
  await page.goto("/tests/fixtures/graficos-visibilidade/");
  await expect(page.getByRole("status").filter({ hasText: "Carregando gráfico" })).toBeVisible();
  await requisicao;
  await page.getByRole("tab", { name: "Chamada" }).click();
  await expect(page.locator("#painel-painel .recharts-responsive-container")).toHaveCount(0);
  await page.getByRole("tab", { name: "Painel" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Carregando gráfico" })).toBeVisible();
  liberar();
  await graficoVisivel(page, "Rosca primeiro");
});
