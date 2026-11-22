// Verifica ações contextuais dos cadastros nos componentes reais e nos dois temas.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { conferirRegistrosEmpilhados } from "../../apoio/linhas-cadastros";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const diretores = [
  {
    id: "diretor-1",
    nome: "Dora Teste",
    identificador: "dora.teste",
    ativo: true,
    estado: "em_uso",
    emitidaEm: null,
    expiraEm: null,
    primeiroUsoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    turmas: [],
  },
  {
    id: "diretor-2",
    nome: "Eva Teste",
    identificador: "eva.teste",
    ativo: false,
    estado: "revogada",
    emitidaEm: null,
    expiraEm: null,
    primeiroUsoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    turmas: [],
  },
] as const;

beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.join(tmpdir(), "vite-acoes-cadastros"),
    define: { "process.env": "{}" },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/gestao/acoes-cadastros.html`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

async function conferirAcao(botao: Locator) {
  await botao.page().mouse.move(0, 0);
  await botao.waitFor({ state: "visible" });
  const estado = await botao.evaluate((el) => {
    const retangulo = el.getBoundingClientRect();
    const alvo = getComputedStyle(el, "::after");
    return {
      fundo: getComputedStyle(el).backgroundColor,
      largura: retangulo.width,
      altura: retangulo.height,
      alvoLargura: Number.parseFloat(alvo.width) || 0,
      alvoAltura: Number.parseFloat(alvo.height) || 0,
    };
  });
  expect(estado.fundo).toBe("rgba(0, 0, 0, 0)");
  expect(estado.largura).toBeGreaterThanOrEqual(40);
  expect(estado.altura).toBeGreaterThanOrEqual(40);
  if (estado.alvoLargura > 0) expect(estado.alvoLargura).toBeGreaterThanOrEqual(48);
  if (estado.alvoAltura > 0) expect(estado.alvoAltura).toBeGreaterThanOrEqual(48);
}

async function conferirPerigo(botao: Locator) {
  await expect
    .poll(() =>
      botao.evaluate((el) => {
        const amostra = document.createElement("span");
        amostra.style.color = "var(--template-palette-falta-texto)";
        el.appendChild(amostra);
        const resultado = getComputedStyle(el).color === getComputedStyle(amostra).color;
        amostra.remove();
        return resultado;
      }),
    )
    .toBe(true);
}

async function aguardarEsquema(page: Page, tema: "light" | "dark") {
  await expect
    .poll(() => page.locator("html").getAttribute("data-mui-color-scheme"), { timeout: 15000 })
    .toBe(tema);
}

async function conferirTema(botao: Locator, tema: "light" | "dark") {
  await botao.waitFor({ state: "visible" });
  await expect
    .poll(
      () =>
        botao.evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--template-palette-background-default").trim(),
        ),
      { timeout: 15000 },
    )
    .toBe(tema === "dark" ? "#141413" : "#f6f6f6");
  expect(
    await botao
      .page()
      .evaluate(() => document.documentElement.getAttribute("data-mui-color-scheme")),
  ).toBe(tema);
}

for (const tema of ["light", "dark"] as const) {
  for (const largura of [390, 1280]) {
    it(`ações de diretores sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.route("**/api/diretores", (route) => route.fulfill({ json: { diretores } }));
        await page.goto(`${url}?aba=diretores&tema=${tema}`);
        await aguardarEsquema(page, tema);
        for (const nome of [
          "Editar Dora Teste",
          "Desativar Dora Teste",
          "Revogar a palavra-chave de Dora Teste",
          "Editar Eva Teste",
          "Reativar Eva Teste",
        ]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar Dora Teste" }), tema);
        await conferirPerigo(
          page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }),
        );
        expect(
          await page.getByRole("button", { name: "Revogar a palavra-chave de Eva Teste" }).count(),
        ).toBe(0);
        const gerarEva = page.getByRole("button", {
          name: "Gerar nova palavra-chave para Eva Teste",
          exact: true,
        });
        expect(await gerarEva.isDisabled()).toBe(true);
        const principal = page.getByRole("button", { name: "Novo diretor" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        const gerarNova = page.getByRole("button", {
          name: "Gerar nova palavra-chave para Dora Teste",
          exact: true,
        });
        expect(await gerarNova.evaluate((el) => el.classList.contains("MuiButton-outlined"))).toBe(
          true,
        );
        expect(await gerarNova.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
      } finally {
        await page.close();
      }
    });
    it(`ações de alunos sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.goto(`${url}?aba=alunos&tema=${tema}`);
        await aguardarEsquema(page, tema);
        for (const nome of [
          "Editar Ana Teste",
          "Desativar Ana Teste",
          "Excluir Ana Teste",
          "Editar Bia Teste",
          "Reativar Bia Teste",
          "Excluir Bia Teste",
          "Reativar Caio Teste",
        ]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar Ana Teste" }), tema);
        await conferirPerigo(page.getByRole("button", { name: "Excluir Ana Teste" }));
        expect(await page.getByRole("button", { name: "Reativar Caio Teste" }).isDisabled()).toBe(
          true,
        );
        const principal = page.getByRole("button", { name: "Novo aluno" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      } finally {
        await page.close();
      }
    });
    it(`ações de séries sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.goto(`${url}?tema=${tema}`);
        await aguardarEsquema(page, tema);
        for (const nome of ["Editar série 1º ano", "Excluir série 1º ano"]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar série 1º ano" }), tema);
        await conferirPerigo(page.getByRole("button", { name: "Excluir série 1º ano" }));
        const principal = page.getByRole("button", { name: "Nova série" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      } finally {
        await page.close();
      }
    });
  }
}

it("edição, teclado e confirmação de exclusão de série são preservados", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      chamadas.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(url);
    const editar = page.getByRole("button", { name: "Editar série 1º ano" });
    await editar.focus();
    expect(await editar.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(
      await editar.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.getByRole("dialog", { name: "Editar série" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Excluir série 1º ano" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Excluir série 1º ano" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => chamadas).toEqual(["DELETE /api/series/serie-1"]);
  } finally {
    await page.close();
  }
});

it("alunos mantêm edição, seleção e confirmações antes de alterar ou excluir", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      chamadas.push({
        metodo: request.method(),
        caminho: new URL(request.url()).pathname,
        corpo: request.postDataJSON(),
      });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${url}?aba=alunos`);
    await page.getByRole("button", { name: "Editar Ana Teste" }).click();
    expect(await page.getByRole("dialog", { name: "Editar Ana Teste" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Desativar Ana Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Desativar Ana Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Desativar", exact: true })
      .click();
    await expect
      .poll(() => chamadas)
      .toEqual([{ metodo: "PATCH", caminho: "/api/alunos/aluno-1", corpo: { ativo: false } }]);
    await page.getByRole("button", { name: "Excluir Ana Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toHaveLength(1);
    await page.getByRole("button", { name: "Excluir Ana Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => chamadas.length).toBe(2);
    expect(chamadas[1]).toMatchObject({ metodo: "DELETE", caminho: "/api/alunos/aluno-1" });
    await page.getByRole("button", { name: "Reativar Bia Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toHaveLength(2);
    await page.getByRole("button", { name: "Reativar Bia Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Reativar", exact: true })
      .click();
    await expect.poll(() => chamadas.length).toBe(3);
    expect(chamadas[2]).toEqual({
      metodo: "PATCH",
      caminho: "/api/alunos/aluno-2",
      corpo: { ativo: true },
    });
    await page.getByRole("button", { name: "Definir origem" }).click();
    expect(await page.getByRole("button", { name: "Editar Ana Teste" }).count()).toBe(0);
    await page.getByRole("button", { name: "Selecionar Ana Teste" }).click();
    expect(
      await page.getByRole("button", { name: "Selecionar Ana Teste" }).getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await page.close();
  }
});

it("diretores mantêm acesso contextual e confirmação de revogação com motivo", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({ json: { diretores } });
        return;
      }
      chamadas.push({
        metodo: request.method(),
        caminho: new URL(request.url()).pathname,
        corpo: request.postDataJSON(),
      });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${url}?aba=diretores`);
    await page.getByRole("button", { name: "Editar Dora Teste" }).click();
    expect(await page.getByRole("dialog", { name: "Editar Dora Teste" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }).click();
    const dialogo = page.getByRole("dialog", {
      name: "Revogar a palavra-chave de Dora Teste?",
    });
    await dialogo.waitFor();
    expect(await dialogo.getByRole("button", { name: "Revogar", exact: true }).isDisabled()).toBe(
      true,
    );
    await dialogo.getByLabel("Motivo").fill("Teste");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }).click();
    expect(await dialogo.getByLabel("Motivo").inputValue()).toBe("");
    await dialogo.getByLabel("Motivo").fill("Teste de revogação");
    await dialogo.getByRole("button", { name: "Revogar", exact: true }).click();
    await expect
      .poll(() => chamadas)
      .toEqual([
        {
          metodo: "POST",
          caminho: "/api/diretores/diretor-1/revogar",
          corpo: { motivo: "Teste de revogação" },
        },
      ]);
    await expect.poll(() => dialogo.isVisible()).toBe(false);
    await page.getByRole("button", { name: "Desativar Dora Teste" }).click();
    await expect.poll(() => chamadas.length).toBe(2);
    expect(chamadas[1]).toEqual({
      metodo: "PATCH",
      caminho: "/api/diretores/diretor-1",
      corpo: { ativo: false },
    });
  } finally {
    await page.close();
  }
});

it.each([320, 390])("Revisão 5C: registros consecutivos de Diretores a %i px", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const registrosLongos = [
    {
      ...diretores[0],
      nome: "Diretora".repeat(10),
      identificador: "acompanhamento".repeat(2),
      turmas: [
        {
          id: "vinculo-1",
          turmaId: "turma-1",
          turma: "Turma de referência do acompanhamento no contraturno",
          inicio: "2026-03-10",
          fim: null,
        },
      ],
    },
    diretores[1],
  ];
  try {
    await page.route("**/api/diretores", (rota) =>
      rota.request().method() === "GET"
        ? rota.fulfill({ json: { diretores: registrosLongos } })
        : rota.abort(),
    );
    await page.goto(`${url}?aba=diretores`);
    const registros = registrosLongos.map(({ nome, identificador }) => {
      const linha = page.getByRole("row").filter({ hasText: identificador });
      return { linha, editar: linha.getByRole("button", { name: `Editar ${nome}`, exact: true }) };
    });
    for (const { editar } of registros) await editar.waitFor();
    await conferirRegistrosEmpilhados(registros);
  } finally {
    await page.close();
  }
});

it("Revisão 5C: emitir e regenerar têm nome acessível contextual", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", (rota) => {
      const pedido = rota.request();
      const chamada = `${pedido.method()} ${new URL(pedido.url()).pathname}`;
      chamadas.push(chamada);
      return chamada === "GET /api/diretores"
        ? rota.fulfill({
            json: {
              diretores: [diretores[0], { ...diretores[1], ativo: true, estado: "sem_palavra" }],
            },
          })
        : rota.abort();
    });
    await page.goto(`${url}?aba=diretores`);
    const dora = page.getByRole("row").filter({ hasText: "dora.teste" });
    const eva = page.getByRole("row").filter({ hasText: "eva.teste" });
    await dora.getByText("Gerar nova", { exact: true }).waitFor();
    await eva.getByText("Gerar palavra-chave", { exact: true }).waitFor();
    const regenerar = page.getByRole("button", {
      name: "Gerar nova palavra-chave para Dora Teste",
      exact: true,
    });
    const emitir = page.getByRole("button", {
      name: "Gerar palavra-chave para Eva Teste",
      exact: true,
    });
    expect.soft(await regenerar.count(), "nome acessível contextual ao regenerar").toBe(1);
    expect.soft(await emitir.count(), "nome acessível contextual ao emitir").toBe(1);
    if ((await regenerar.count()) === 1 && (await emitir.count()) === 1) {
      expect(
        await dora
          .getByRole("button", { name: "Gerar nova palavra-chave para Dora Teste", exact: true })
          .count(),
      ).toBe(1);
      expect(
        await eva
          .getByRole("button", { name: "Gerar palavra-chave para Eva Teste", exact: true })
          .count(),
      ).toBe(1);
      await regenerar.focus();
      await page.keyboard.press("Enter");
      const confirmacao = page.getByRole("alertdialog", {
        name: "Gerar nova palavra-chave para Dora Teste?",
      });
      await confirmacao.getByRole("button", { name: "Cancelar" }).click();
      await expect.poll(() => regenerar.evaluate((el) => document.activeElement === el)).toBe(true);
    }
    expect(chamadas).toEqual(["GET /api/diretores"]);
  } finally {
    await page.close();
  }
});

it("5C: a 320 px o vínculo e a situação ficam legíveis antes das ações", async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 760 },
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  const nome = "Diretora".repeat(10);
  const identificador = "acompanhamento".repeat(2) + "estudantes";
  const motivo = "Fim de acompanhamento na turma de referência do período anterior.";
  const turma = "Turma de referência do acompanhamento no contraturno";
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const pedido = route.request();
      const chamada = `${pedido.method()} ${new URL(pedido.url()).pathname}`;
      chamadas.push(chamada);
      if (chamada !== "GET /api/diretores") {
        await route.abort();
        return;
      }
      await route.fulfill({
        json: {
          diretores: [
            {
              ...diretores[0],
              nome,
              identificador,
              estado: "revogada",
              motivoRevogacao: motivo,
              turmas: [
                { id: "vinculo-1", turmaId: "turma-1", turma, inicio: "2026-03-10", fim: null },
              ],
            },
            {
              ...diretores[1],
              ativo: true,
              estado: "emitida",
              expiraEm: "2026-04-10T12:00:00.000Z",
            },
          ],
        },
      });
    });
    await page.goto(`${url}?aba=diretores&tema=dark`);
    const registro = page.getByRole("row").filter({ hasText: identificador });
    const editar = registro.getByRole("button", { name: `Editar ${nome}`, exact: true });
    await editar.waitFor();
    expect(await registro.getByText("Revogada", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(/palavra válida até 10\/04\/2026/i).isVisible()).toBe(true);
    for (const texto of [nome, identificador, turma, motivo]) {
      const leitura = await registro
        .getByText(texto, { exact: texto === nome || texto === identificador })
        .evaluate((el) => {
          const faixa = document.createRange();
          faixa.selectNodeContents(el);
          const quadro = faixa.getBoundingClientRect();
          const caixa = el.getBoundingClientRect();
          return (
            quadro.left >= 0 &&
            quadro.right <= document.documentElement.clientWidth &&
            quadro.right <= caixa.right + 1 &&
            el.scrollWidth <= el.clientWidth + 1
          );
        });
      expect(leitura, "texto integral sem rolagem").toBe(true);
    }
    const tabela = page.getByRole("table");
    expect(
      await tabela.evaluate((el) => {
        const area = el.parentElement;
        return area !== null && area.scrollWidth === area.clientWidth;
      }),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    const gerar = registro.getByRole("button", {
      name: `Gerar nova palavra-chave para ${nome}`,
      exact: true,
    });
    for (const botao of [
      gerar,
      editar,
      registro.getByRole("button", { name: `Desativar ${nome}` }),
    ]) {
      const caixa = await botao.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(48);
      expect(caixa?.height).toBeGreaterThanOrEqual(48);
      expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= 320).toBe(true);
    }
    await gerar.focus();
    await page.keyboard.press("Enter");
    const confirmacao = page.getByRole("alertdialog", {
      name: `Gerar nova palavra-chave para ${nome}?`,
    });
    await confirmacao.getByRole("button", { name: "Cancelar" }).click();
    await expect.poll(() => gerar.evaluate((el) => document.activeElement === el)).toBe(true);
    await editar.focus();
    await page.keyboard.press("Enter");
    const dialogo = page.getByRole("dialog", { name: `Editar ${nome}` });
    expect(await dialogo.getByLabel("Identificador de acesso").isDisabled()).toBe(true);
    const turmaMarcada = dialogo.getByRole("checkbox", { name: "1º ano A" });
    expect(await turmaMarcada.isChecked()).toBe(true);
    await turmaMarcada.focus();
    await page.keyboard.press("Space");
    expect(await turmaMarcada.isChecked()).toBe(false);
    const data = dialogo.getByRole("button", { name: /^Data de início do acompanhamento/ });
    await data.focus();
    await page.keyboard.press("Enter");
    const dia = page.getByRole("button", { name: "9 de março de 2026", exact: true });
    await dia.focus();
    await page.keyboard.press("Enter");
    expect(await data.getAttribute("aria-label")).toContain("09/03/2026");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect.poll(() => editar.evaluate((el) => document.activeElement === el)).toBe(true);

    // Simula a largura que a gaveta permanente subtrai do painel, sem montar o shell.
    await page.addStyleTag({
      content: "@media (min-width: 905px) { main { margin-inline-start: 256px; } }",
    });
    const medidas = [
      { tela: 390, empilha: true },
      { tela: 600, empilha: true },
      { tela: 631, empilha: true },
      { tela: 632, empilha: false },
      { tela: 904, empilha: false },
      { tela: 905, empilha: false },
      { tela: 1440, empilha: false },
    ];
    for (const { tela, empilha } of medidas) {
      await page.setViewportSize({ width: tela, height: 760 });
      const identidade = await registro.getByRole("rowheader").boundingBox();
      const acoes = await registro.getByRole("cell").boundingBox();
      expect(identidade && acoes && acoes.y >= identidade.y + identidade.height - 1).toBe(empilha);
      expect(await editar.count()).toBe(1);
      expect(await editar.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(tela);
    }
    expect(chamadas).toEqual(["GET /api/diretores"]);
  } finally {
    await page.close();
  }
});
