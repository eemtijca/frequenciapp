// Identidade visual compartilhada: tipografia carregada, enquadramento e
// alternativas acessíveis ao vidro, com capturas de dados sintéticos.
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { contraste, type Rgb } from "../helpers/cor";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block", actionTimeout: 15_000 });

async function conferirEnquadramento(page: Page): Promise<void> {
  expect(
    await page.evaluate(() =>
      [
        document.documentElement,
        document.body,
        document.querySelector("main > div > section:not([hidden])"),
      ]
        .filter((elemento): elemento is HTMLElement => elemento instanceof HTMLElement)
        .map((elemento) => ({
          elemento: elemento.tagName,
          largura: elemento.clientWidth,
          conteudo: elemento.scrollWidth,
        }))
        .filter((elemento) => elemento.conteudo > elemento.largura + 1),
    ),
  ).toEqual([]);
}

async function conferirFonte(page: Page, elementos: Locator[]): Promise<void> {
  const fonte = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      corpo: getComputedStyle(document.body).fontFamily,
      carregada: Array.from(document.fonts).some(
        (face) =>
          /jakarta/i.test(face.family) &&
          !/fallback/i.test(face.family) &&
          face.status === "loaded",
      ),
    };
  });
  expect(fonte.corpo).toMatch(/jakarta/i);
  expect(fonte.carregada).toBe(true);
  for (const elemento of elementos) {
    await expect(elemento).toBeVisible();
    expect(await elemento.evaluate((no) => getComputedStyle(no).fontFamily)).toBe(fonte.corpo);
  }
}

async function capturar(page: Page, info: TestInfo, nome: string): Promise<void> {
  await conferirEnquadramento(page);
  const caminho = info.outputPath(`${nome}.png`);
  await page.screenshot({ path: caminho, animations: "disabled" });
  await info.attach(nome, { path: caminho, contentType: "image/png" });
}

async function abrirFormulario(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("button", { name: "Nova série", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Nova série", exact: true });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function conferirSuperficieSolida(elemento: Locator): Promise<void> {
  const estilo = await elemento.evaluate((no) => {
    const css = getComputedStyle(no);
    const tela = document.createElement("canvas");
    tela.width = tela.height = 1;
    const desenho = tela.getContext("2d");
    if (!desenho) throw new Error("Não foi possível analisar as cores.");
    function cor(valor: string): number[] {
      if (!desenho) return [];
      desenho.clearRect(0, 0, 1, 1);
      desenho.fillStyle = valor;
      desenho.fillRect(0, 0, 1, 1);
      return Array.from(desenho.getImageData(0, 0, 1, 1).data);
    }
    return {
      filtro: css.backdropFilter || css.getPropertyValue("-webkit-backdrop-filter"),
      imagem: css.backgroundImage,
      fundo: cor(css.backgroundColor),
      texto: cor(css.color),
    };
  });
  expect(estilo.filtro).toBe("none");
  expect(estilo.imagem).toBe("none");
  expect(estilo.fundo[3]).toBe(255);
  const rgb = (cor: number[]): Rgb => [
    (cor[0] ?? 0) / 255,
    (cor[1] ?? 0) / 255,
    (cor[2] ?? 0) / 255,
  ];
  expect(contraste(rgb(estilo.texto), rgb(estilo.fundo))).toBeGreaterThanOrEqual(4.5);
}

test.describe("interface compartilhada", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
    await comBanco(async (cliente) => {
      await cliente.query(
        "insert into turmas (serie_id, nome) select id, 'B' from series where nome = 'E2E Ano'",
      );
      await cliente.query(
        `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo)
         select 'E2E Aluno Três', t.id, t.id, 1, true
         from turmas t join series s on s.id = t.serie_id
         where s.nome = 'E2E Ano' and t.nome = 'B'`,
      );
    });
  });
  test.afterAll(limparMassaE2E);

  for (const tema of ["light", "dark"] as const) {
    test(`visões e entrada preservam fonte e largura no tema ${tema}`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      await page.goto("/");
      await aguardarHidratacao(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(tema));

      for (const [rotulo, visao] of [
        ["Painel", "painel"],
        ["Chamada", "chamada"],
        ["Chamada Parcial", "chamada-parcial"],
        ["Saídas e entradas", "saidas"],
        ["Relatórios", "relatorios"],
        ["Gestão", "gestao"],
      ] as const) {
        await trocarVisao(page, rotulo, visao);
        if (visao === "chamada") {
          const chamada = page.getByRole("region", { name: "Fazer chamada", exact: true });
          if (await chamada.getByRole("group", { name: "Turma atual", exact: true }).count()) {
            await escolherTurmaNaChamada(chamada, /E2E Ano A/);
          }
          await expect(chamada.getByText("E2E Aluno Um", { exact: true })).toBeVisible();
          await conferirFonte(page, [
            chamada.getByRole("button", { name: "Resumo de hoje", exact: true }),
            chamada.getByPlaceholder("Buscar aluno ou turma de origem"),
          ]);
          const data = chamada
            .getByRole("button", { name: /^Data da chamada:/ })
            .getByText(/^\d{2}\/\d{2}\/\d{4}$/);
          await expect(data).toBeVisible();
          expect(
            await data.evaluate((elemento) => {
              const limite = elemento.closest("button")?.getBoundingClientRect();
              const caixa = elemento.getBoundingClientRect();
              return Boolean(
                limite &&
                elemento.scrollWidth <= elemento.clientWidth + 1 &&
                caixa.left >= limite.left &&
                caixa.right <= limite.right,
              );
            }),
          ).toBe(true);
        }
        if (visao === "chamada-parcial") {
          await page.locator("#parcial-turma").click();
          await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
          await expect(
            page.getByRole("button", {
              name: "Registrar frequência parcial de E2E Aluno Um",
              exact: true,
            }),
          ).toBeVisible();
        }
        if (visao === "relatorios")
          await page.getByRole("tab", { name: "Resumo", exact: true }).click();
        if (visao === "gestao")
          await page.getByRole("tab", { name: "Configurações", exact: true }).click();
        await capturar(page, info, `${visao}-${tema}`);
      }

      await page.getByRole("tab", { name: "Séries", exact: true }).click();
      await page.getByRole("button", { name: "Nova série", exact: true }).click();
      const dialogo = page.getByRole("dialog", { name: "Nova série", exact: true });
      await conferirFonte(page, [
        dialogo.getByRole("heading", { name: "Nova série", exact: true }),
        dialogo.getByLabel("Nome", { exact: true }),
        dialogo.getByRole("button", { name: "Cancelar", exact: true }),
      ]);
      await capturar(page, info, `formulario-${tema}`);
      await page.keyboard.press("Escape");
      await expect(dialogo).toBeHidden();

      await page.context().clearCookies();
      await page.goto("/");
      await aguardarHidratacao(page, "form button");
      await conferirFonte(page, [
        page.getByLabel("E-mail ou identificador"),
        page.getByRole("button", { name: "Entrar", exact: true }),
      ]);
      await capturar(page, info, `entrada-${tema}`);
    });
  }

  test("a transparência reduzida mantém o formulário opaco e legível", async ({
    page,
    browserName,
  }, info) => {
    test.skip(
      browserName !== "chromium",
      "Emulação da transparência reduzida disponível pelo CDP.",
    );
    const sessao = await page.context().newCDPSession(page);
    try {
      await sessao.send("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-reduced-transparency", value: "reduce" },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      });
      const dialogo = await abrirFormulario(page);
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches),
      ).toBe(true);
      await conferirSuperficieSolida(dialogo);
      await conferirSuperficieSolida(
        dialogo.getByRole("button", { name: "Cancelar", exact: true }),
      );
      await capturar(page, info, "transparencia-reduzida");
    } finally {
      await sessao.detach();
    }
  });

  test("as cores forçadas preservam leitura, foco e operação por teclado", async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== "chromium", "Cores forçadas verificadas no Chromium.");
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    const dialogo = await abrirFormulario(page);
    await conferirSuperficieSolida(dialogo);
    await conferirSuperficieSolida(dialogo.getByRole("button", { name: "Cancelar", exact: true }));
    const nome = dialogo.getByLabel("Nome", { exact: true });
    await nome.focus();
    await expect(nome).toBeFocused();
    const foco = await nome.evaluate((elemento) => {
      const css = getComputedStyle(elemento);
      return { largura: Number.parseFloat(css.outlineWidth), estilo: css.outlineStyle };
    });
    expect(foco.largura).toBeGreaterThanOrEqual(2);
    expect(foco.estilo).toBe("solid");
    await capturar(page, info, "cores-forcadas");
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
  });
});
