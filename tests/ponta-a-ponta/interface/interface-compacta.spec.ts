// Barra de salvamento da Chamada compacta e atualização global da tela ativa.
import { expect, test } from "@playwright/test";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaDeChamada } from "../helpers/dia";
import {
  abrirDiaSeResumo,
  aguardarHidratacao,
  escolherTurmaNaChamada,
  liberarSabadoSeNecessario,
  trocarVisao,
} from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  await criarMassaE2E();
  await comBanco(async (cliente) => {
    await cliente.query(
      `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, criado_em)
       select 'E2E Aluno da Lista ' || linha, t.id, t.id, linha, true, $1
       from turmas t join series s on s.id = t.serie_id
       cross join generate_series(3, 24) as linhas(linha)
       where s.nome = 'E2E Ano' and t.nome = 'A'`,
      [`${diaDeChamada()}T12:00:00Z`],
    );
  });
});
test.afterAll(limparMassaE2E);

for (const [nome, largura, altura] of [
  ["desktop", 1440, 900],
  ["desktop com gaveta", 905, 900],
  ["tablet", 768, 900],
  ["celular", 390, 844],
  ["celular estreito", 320, 844],
] as const) {
  test(`rodapé de salvamento no ${nome}`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?visao=chamada");
    await aguardarHidratacao(page);
    await abrirDiaSeResumo(page);
    const chamada = page.getByRole("region", { name: "Fazer chamada", exact: true });
    const turmas = chamada.getByRole("group", { name: "Turma atual", exact: true });
    if (await turmas.count()) {
      await escolherTurmaNaChamada(chamada, /E2E Ano A/);
      const seletor = turmas.getByRole("button", { name: "Turmas", exact: true });
      if ((await seletor.getAttribute("aria-expanded")) === "true") await seletor.click();
    }
    await liberarSabadoSeNecessario(chamada);

    const lista = chamada.getByRole("list", { name: "Alunos da chamada" });
    const linhas = lista.getByRole("listitem");
    await expect(linhas).toHaveCount(24);
    const aluno = lista.getByRole("button", { name: /^E2E Aluno Um\b/ });
    const salvar = chamada.getByRole("button", { name: "Salvar", exact: true });
    await expect(salvar).toBeEnabled();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await chamada.evaluate((elemento) => elemento.closest('section[role="group"]')?.scrollTo(0, 0));
    const barra = page.locator('[aria-label="Barra de salvamento"]');
    await expect(barra).toBeVisible();
    const caixaInicial = await barra.boundingBox();
    const primeira = await linhas.first().boundingBox();
    const sexta = await linhas.nth(5).boundingBox();
    if (!caixaInicial || !primeira || !sexta) throw new Error("A barra ou a lista não apareceu.");
    expect(primeira.height).toBeGreaterThanOrEqual(48);
    expect(primeira.height).toBeLessThanOrEqual(64);
    expect(primeira.y).toBeLessThan(altura / 2);
    expect(sexta.y + sexta.height).toBeLessThanOrEqual(caixaInicial.y);
    expect(caixaInicial.height).toBeLessThan(84);
    await expect(chamada.getByText("E2E Ano A", { exact: true })).toBeVisible();
    await expect(chamada.getByRole("button", { name: /^Data da chamada:/ })).toBeVisible();

    await expect(aluno).toBeEnabled();
    await aluno.click();
    await expect(aluno).toHaveAttribute("aria-pressed", "true");
    const descartar = barra.getByRole("button", { name: "Descartar" });
    await expect(descartar).toBeVisible();

    const ultima = linhas.last();
    const ultimoAluno = ultima.getByRole("button", { name: /presença|presente/i });
    await linhas
      .nth(22)
      .getByRole("button", { name: /presença|presente/i })
      .focus();
    await page.keyboard.press("Tab");
    await expect(ultimoAluno).toBeFocused();
    await expect
      .poll(async () => {
        const linha = await ultima.boundingBox();
        const rodape = await barra.boundingBox();
        return Boolean(linha && rodape && linha.y >= 0 && linha.y + linha.height <= rodape.y);
      })
      .toBe(true);
    const rodape = await barra.boundingBox();
    const secao = await chamada.boundingBox();
    if (!rodape || !secao) throw new Error("A barra saiu da área da chamada.");
    expect(Math.abs(rodape.x - secao.x)).toBeLessThan(2);
    expect(Math.abs(rodape.width - secao.width)).toBeLessThan(2);
    expect(rodape.x).toBeGreaterThanOrEqual(0);
    expect(rodape.x + rodape.width).toBeLessThanOrEqual(largura);
    expect(rodape.y + rodape.height).toBeLessThanOrEqual(altura);
    await page.keyboard.press("Space");
    await expect(ultima.getByRole("button", { name: /falta em/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await salvar.click();
    const confirmacao = page.getByRole("alertdialog", { name: "Salvar chamada?", exact: true });
    await confirmacao.getByRole("button", { name: "Continuar revisando" }).click();
    await expect(confirmacao).toBeHidden();
    await descartar.click();
    const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?" });
    await dialogo.getByRole("button", { name: "Descartar", exact: true }).click();
    await expect(descartar).toHaveCount(0);
  });
}

test("o botão global atualiza a tela ativa e não descarta um rascunho", async ({ page }) => {
  await page.goto("/?visao=painel");
  await aguardarHidratacao(page);
  const pedido = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/frequencias" && item.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  expect((await pedido).status()).toBe(200);

  // Em Configurações, o rascunho bloqueia a atualização com uma orientação clara.
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  const recursos = page.locator('[data-secao="config-recursos"]');
  await recursos.getByRole("switch", { name: "Saídas e Entradas" }).click();
  const barra = page.locator('div[role="region"][aria-label^="Salvar"]');
  await expect(barra).toBeVisible();

  // A barra de Configurações segue a lógica compacta da Chamada.
  const caixaBarra = await barra.boundingBox();
  const caixaConteudo = await page.locator("#config-grupo-escola").boundingBox();
  const largura = page.viewportSize()?.width ?? 0;
  expect(caixaBarra).not.toBeNull();
  expect(caixaConteudo).not.toBeNull();
  expect(caixaBarra?.width ?? 0).toBeLessThan(caixaConteudo?.width ?? 0);
  if (largura < 1024) {
    const centro = (caixaBarra?.x ?? 0) + (caixaBarra?.width ?? 0) / 2;
    expect(Math.abs(centro - largura / 2)).toBeLessThan(3);
  } else {
    expect((caixaBarra?.x ?? 0) + (caixaBarra?.width ?? 0)).toBeGreaterThan(
      (caixaConteudo?.x ?? 0) + (caixaConteudo?.width ?? 0) - 24,
    );
  }

  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  await expect(
    page.getByText("Salve ou descarte as alterações antes de atualizar.", { exact: true }),
  ).toBeVisible();
  await expect(barra).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?" });
  await dialogo.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(barra).toHaveCount(0);
});

test("sem conexão preserva os dados e não dispara a atualização", async ({ page, context }) => {
  await page.goto("/?visao=painel");
  await aguardarHidratacao(page);
  const pedidos: string[] = [];
  page.on("request", (pedido) => {
    if (pedido.url().includes("/api/frequencias")) pedidos.push(pedido.url());
  });
  await page.waitForTimeout(800);
  const antes = pedidos.length;
  await context.setOffline(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
  });
  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  await expect(
    page.getByText("Sem conexão. Os dados atuais continuam na tela.", { exact: true }),
  ).toBeVisible();
  expect(pedidos).toHaveLength(antes);
  await context.setOffline(false);
});
