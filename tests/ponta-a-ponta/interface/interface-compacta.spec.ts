// Barra de salvamento e foco da Chamada, além da atualização global da tela ativa.
import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function abrirChamadaDoDia(page: Page) {
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
  return chamada;
}

for (const [nome, largura, altura] of [
  ["desktop", 1440, 900],
  ["logo antes das duas colunas", 1439, 900],
  ["desktop com gaveta", 905, 900],
  ["tablet", 768, 900],
  ["celular", 390, 844],
  ["celular estreito", 320, 844],
] as const) {
  test(`rodapé de salvamento no ${nome}`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const chamada = await abrirChamadaDoDia(page);

    const lista = chamada.getByRole("list", { name: "Alunos da chamada" });
    const linhas = lista.getByRole("listitem");
    await expect(linhas).toHaveCount(24);
    const aluno = lista.getByRole("button", { name: /^E2E Aluno Um\b/ });
    const salvar = chamada.getByRole("button", { name: "Salvar", exact: true });
    await expect(salvar).toBeEnabled();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await chamada.evaluate((elemento) => elemento.closest('section[role="group"]')?.scrollTo(0, 0));
    const barra = chamada.locator('footer[aria-label="Barra de salvamento"]');
    await expect(barra).toHaveCount(1);
    await expect(barra).toBeVisible();
    const raioDoBotao = await salvar.evaluate((botao) => getComputedStyle(botao).borderRadius);
    await expect(barra).toHaveCSS("border-radius", raioDoBotao);
    const caixaInicial = await barra.boundingBox();
    const primeira = await linhas.first().boundingBox();
    const sexta = await linhas.nth(5).boundingBox();
    if (!caixaInicial || !primeira || !sexta) throw new Error("A barra ou a lista não apareceu.");
    expect(primeira.height).toBeGreaterThanOrEqual(48);
    expect(primeira.height).toBeLessThanOrEqual(64);
    expect(primeira.y).toBeLessThan(altura / 2);
    if (largura >= 1440) {
      const contexto = chamada.locator('[data-coluna="painel"]');
      const painel = await contexto.boundingBox();
      const fimDosControles = await contexto.evaluate((elemento) =>
        Math.max(
          ...Array.from(elemento.children)
            .filter((filho) => filho.tagName !== "FOOTER" && filho.getClientRects().length > 0)
            .map((filho) => filho.getBoundingClientRect().bottom),
        ),
      );
      const alunos = await lista.boundingBox();
      if (!painel || !alunos) throw new Error("O contexto da Chamada não apareceu.");
      expect(Number.isFinite(fimDosControles)).toBe(true);
      expect(caixaInicial.x).toBeGreaterThan(alunos.x + alunos.width);
      expect(Math.abs(caixaInicial.x - painel.x)).toBeLessThan(2);
      expect(Math.abs(caixaInicial.width - painel.width)).toBeLessThan(2);
      expect(caixaInicial.y - fimDosControles).toBeCloseTo(8, 0);
      expect(sexta.y + sexta.height).toBeLessThanOrEqual(altura);
    } else {
      expect(sexta.y + sexta.height).toBeLessThanOrEqual(caixaInicial.y);
    }
    expect(caixaInicial.height).toBeLessThan(84);
    await expect(chamada.getByText("E2E Ano A", { exact: true })).toBeVisible();
    await expect(chamada.getByRole("button", { name: /^Data da chamada:/ })).toBeVisible();

    await expect(aluno).toBeEnabled();
    await aluno.click();
    await expect(aluno).toHaveAttribute("aria-pressed", "true");
    const descartar = barra.getByRole("button", { name: "Descartar" });
    await expect(descartar).toBeVisible();

    if (largura === 1440) {
      const lateral = chamada.locator('[data-coluna="painel"] > footer');
      await salvar.focus();
      await page.setViewportSize({ width: 1439, height: altura });
      await expect(lateral).toHaveCount(0);
      await expect(salvar).toBeFocused();
      await page.keyboard.press("Enter");
      const revisao = page.getByRole("alertdialog", { name: "Salvar chamada?", exact: true });
      await expect(revisao).toBeVisible();
      await page.setViewportSize({ width: largura, height: altura });
      // O fundo do diálogo fica fora da árvore de acessibilidade enquanto ele está aberto.
      await expect(page.locator('[data-coluna="painel"] > footer')).toHaveCount(1);
      await revisao.getByRole("button", { name: "Continuar revisando" }).click();
      await expect(salvar).toBeFocused();
      await expect(aluno).toHaveAttribute("aria-pressed", "true");
    }

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
        return Boolean(
          linha &&
          rodape &&
          linha.y >= 0 &&
          linha.y + linha.height <= altura &&
          (largura >= 1440 ? !sobrepoe(linha, rodape) : linha.y + linha.height <= rodape.y),
        );
      })
      .toBe(true);
    const rodape = await barra.boundingBox();
    const secao = await chamada.boundingBox();
    if (!rodape || !secao) throw new Error("A barra saiu da área da chamada.");
    if (largura < 1440) {
      expect(Math.abs(rodape.x - secao.x)).toBeLessThan(2);
      expect(Math.abs(rodape.width - secao.width)).toBeLessThan(2);
    }
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

type Caixa = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

function sobrepoe(a: Caixa, b: Caixa) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const [largura, altura, tema, faltasFiltradas] of [
  [320, 844, "dark", 0],
  [390, 844, "light", 0],
  [390, 844, "light", 3],
  [1440, 900, "light", 0],
] as const) {
  const recorte = faltasFiltradas ? ` com ${faltasFiltradas} faltas filtradas` : "";
  test(`a falha de salvamento não cobre o último aluno focado a ${largura} px${recorte}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    const mensagem = "Falha simulada na gravação da chamada.";
    let enviosSimulados = 0;
    await page.route("**/api/frequencias", async (rota) => {
      if (rota.request().method() !== "POST") return rota.continue();
      enviosSimulados += 1;
      await rota.fulfill({ status: 503, json: { error: mensagem } });
    });

    const chamada = await abrirChamadaDoDia(page);
    const lista = chamada.getByRole("list", { name: "Alunos da chamada" });
    const linhas = lista.getByRole("listitem");
    await expect(linhas).toHaveCount(24);
    await lista.getByRole("button", { name: /^E2E Aluno Um\b/ }).click();
    if (faltasFiltradas) {
      for (let i = 1; i < faltasFiltradas; i++) {
        await linhas
          .nth(i)
          .getByRole("button", { name: /presença|presente/i })
          .click();
      }
      const resumo = chamada.getByRole("button", { name: /^Resumo (de hoje|do dia)$/ });
      await resumo.click();
      await chamada
        .getByRole("region", { name: /^Resumo (de hoje|do dia)$/ })
        .getByRole("button", { name: /Faltas\b/ })
        .click();
      await resumo.click();
      await expect(linhas).toHaveCount(faltasFiltradas);
    }
    await chamada.getByRole("button", { name: "Salvar", exact: true }).click();
    const confirmar = page.getByRole("alertdialog", { name: "Salvar chamada?", exact: true });
    await confirmar.getByRole("button", { name: "Salvar chamada", exact: true }).click();
    const aviso = page.getByRole("alert").filter({
      hasText: mensagem,
      has: page.getByRole("button", { name: "Fechar aviso", exact: true }),
    });
    await expect(aviso).toBeVisible();
    expect(enviosSimulados).toBe(1);

    const ultima = linhas.last();
    const rotuloMarcacao = faltasFiltradas ? /: falta em/i : /presença|presente/i;
    const ultimoAluno = ultima.getByRole("button", { name: rotuloMarcacao });
    await linhas
      .nth((await linhas.count()) - 2)
      .getByRole("button", { name: rotuloMarcacao })
      .focus();
    for (let i = 0; i < (faltasFiltradas ? 8 : 1); i++) {
      await page.keyboard.press("Tab");
      if (await ultimoAluno.evaluate((elemento) => elemento === document.activeElement)) break;
    }
    await expect(ultimoAluno).toBeFocused();
    const barra = chamada.locator('footer[aria-label="Barra de salvamento"]');
    await expect
      .poll(
        async () => {
          const [linha, alerta, rodape] = await Promise.all([
            ultima.boundingBox(),
            aviso.boundingBox(),
            barra.boundingBox(),
          ]);
          return Boolean(
            linha &&
            alerta &&
            rodape &&
            linha.y >= (largura >= 905 ? 64 : 56) &&
            linha.y + linha.height <= altura &&
            (largura >= 1440 ? !sobrepoe(linha, rodape) : linha.y + linha.height <= rodape.y) &&
            !sobrepoe(linha, alerta) &&
            !sobrepoe(rodape, alerta),
          );
        },
        { timeout: 2_000, message: "A linha focada e o rodapé ficam livres com o aviso visível." },
      )
      .toBe(true);
    await expect(ultimoAluno).toBeFocused();
    await page.keyboard.press("Space");
    if (faltasFiltradas) {
      await expect(linhas).toHaveCount(faltasFiltradas - 1);
    } else {
      await expect(ultima.getByRole("button", { name: /falta em/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
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
  const barra = page.getByRole("region", { name: "Rascunho de configurações", exact: true });
  await expect(barra).toBeVisible();

  // A barra segue a largura do conteúdo e não invade a coluna das categorias.
  const caixaBarra = await barra.boundingBox();
  const caixaConteudo = await page.locator("#config-grupo-escola").boundingBox();
  if (!caixaBarra || !caixaConteudo) throw new Error("O rascunho ou o conteúdo não apareceu.");
  expect(Math.abs(caixaBarra.x - caixaConteudo.x)).toBeLessThan(2);
  expect(Math.abs(caixaBarra.width - caixaConteudo.width)).toBeLessThan(2);

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
