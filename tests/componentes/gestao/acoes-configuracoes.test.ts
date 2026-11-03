// Componentes reais, CSS real e API inteiramente simulada em navegador isolado.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const completo = {
  configuracoes: {
    frequenciaPorAula: false,
    saidaAntecipada: true,
    origemNaChamada: false,
    origemNaChamadaSerieIds: [],
    origemNaChamadaTurmaIds: [],
    feriados: [],
    infrequenciaAtencaoPercentual: 10,
    infrequenciaCriticaPercentual: 20,
  },
  notificacoes: {},
  acesso: { categoriasDiretor: [], validadePalavraDias: 30 },
  beneficios: [],
  feriados: [],
  chavesBi: [],
  revisoes: {},
  planilhas: {
    frequencia: { ativa: false, envioAutomatico: false },
    saidas: { ativa: false, envioAutomatico: false },
    parcial: { ativa: false, envioAutomatico: false },
  },
  justificativas: [
    { codigo: "At", rotulo: "Atestado", ativo: true },
    { codigo: "Jx", rotulo: "Justificativa inativa", ativo: false },
  ],
  liberadores: [
    { codigo: "lx", rotulo: "Responsável teste", ativo: true },
    { codigo: "ly", rotulo: "Responsável inativo", ativo: false },
  ],
  ordemAlmoco: [
    {
      diaSemana: 1,
      itens: [
        { turmaId: "turma-0", posicao: 1, inicio: "11:30" },
        { turmaId: "turma-1", posicao: 2, inicio: null },
      ],
    },
  ],
};
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.join(tmpdir(), "vite-acoes-configuracoes"),
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/gestao/acoes-configuracoes.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
async function abrir(page: Page, tema: "light" | "dark") {
  const gravacoes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET")
      gravacoes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return new URL(route.request().url()).pathname === "/api/configuracoes/completo"
      ? route.fulfill({ json: completo })
      : route.fulfill({ status: 503, json: { erro: "Indisponível no teste" } });
  });
  await page.goto(url);
  await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), tema);
  await page
    .getByRole("navigation", { name: "Ações da escola" })
    .getByRole("button", { name: "Cadastros" })
    .click();
  await page
    .locator('[data-secao="config-justificativas"]')
    .getByRole("button", { name: /Justificativas/ })
    .click();
  await page
    .locator('[data-secao="config-liberadores"]')
    .getByRole("button", { name: /Quem libera as saídas/ })
    .click();
  return gravacoes;
}
async function abrirAlmoco(page: Page) {
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Horários", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Ações dos horários" })
    .getByRole("button", { name: "Almoço", exact: true })
    .click();
  await page
    .locator('[data-secao="config-ordem-almoco"]')
    .getByRole("button", { name: /Ordem do almoço/ })
    .click();
}
async function conferirPerigo(botao: Locator) {
  await expect
    .poll(() =>
      botao.evaluate((el) => {
        const amostra = document.createElement("span");
        amostra.style.color = "var(--falta-texto)";
        el.appendChild(amostra);
        const resultado = getComputedStyle(el).color === getComputedStyle(amostra).color;
        amostra.remove();
        return resultado;
      }),
    )
    .toBe(true);
}
async function conferirFoco(botao: Locator) {
  await botao.page().keyboard.press("Tab");
  await botao.focus();
  expect(await botao.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(
    await botao.evaluate((el) => {
      const estilo = getComputedStyle(el);
      return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
    }),
  ).toBe(true);
}
async function conferirAcao(botao: Locator) {
  await botao.waitFor({ state: "visible" });
  // O redimensionamento pode manter o hover por um instante; aguarda o repouso.
  await expect
    .poll(() => botao.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  const estado = await botao.evaluate((el) => ({
    largura: el.getBoundingClientRect().width,
    altura: el.getBoundingClientRect().height,
  }));
  expect(estado.largura).toBeGreaterThanOrEqual(44);
  expect(estado.altura).toBeGreaterThanOrEqual(44);
}
for (const tema of ["light", "dark"] as const) {
  it(`ações repetidas dos cadastros são transparentes em ${tema}`, async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await abrir(page, tema);
      for (const nome of [
        "Editar rótulo de At",
        "Excluir At",
        "Editar rótulo de Jx",
        "Excluir Jx",
        "Editar rótulo de lx",
        "Excluir lx",
        "Editar rótulo de ly",
        "Excluir ly",
      ])
        await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
      await conferirPerigo(page.getByRole("button", { name: "Excluir At", exact: true }));
      await conferirPerigo(page.getByRole("button", { name: "Excluir lx", exact: true }));
      await conferirFoco(page.getByRole("button", { name: "Editar rótulo de At", exact: true }));
      expect(
        await page.getByRole("switch", { name: "Desativar At" }).getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        await page.getByRole("switch", { name: "Reativar Jx" }).getAttribute("aria-checked"),
      ).toBe("false");
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.mouse.move(0, 0);
      await conferirAcao(page.getByRole("button", { name: "Editar rótulo de At", exact: true }));
      await conferirAcao(page.getByRole("button", { name: "Excluir lx", exact: true }));
    } finally {
      await page.close();
    }
  });
  it(`ações repetidas da ordem do almoço são transparentes em ${tema}`, async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      await abrir(page, tema);
      await abrirAlmoco(page);
      for (const nome of [
        "Subir 1º ano A",
        "Descer 1º ano A",
        "Tirar 1º ano A da ordem",
        "Limpar horário de 1º ano A",
        "Subir 1º ano B",
        "Descer 1º ano B",
        "Tirar 1º ano B da ordem",
      ])
        await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
      expect(await page.getByRole("button", { name: "Subir 1º ano A" }).isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Descer 1º ano B" }).isDisabled()).toBe(true);
      await conferirPerigo(page.getByRole("button", { name: "Tirar 1º ano A da ordem" }));
      await conferirFoco(page.getByRole("button", { name: "Descer 1º ano A" }));
      expect(
        await page
          .getByRole("button", { name: "Copiar para os outros dias" })
          .getAttribute("data-variant"),
      ).toBe("outline");
      expect(
        await page.getByRole("button", { name: "Adicionar à ordem" }).getAttribute("data-variant"),
      ).toBe("default");
      if (process.env.CAPTURAS_CONFIG) {
        await page.screenshot({ path: path.join(tmpdir(), `config-almoco-${tema}.png`) });
      }
      const mover = page.getByRole("button", { name: "Descer 1º ano A" });
      await mover.hover();
      expect(await mover.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.mouse.move(0, 0);
      await conferirAcao(mover);
      await conferirAcao(page.getByRole("button", { name: "Limpar horário de 1º ano A" }));
    } finally {
      await page.close();
    }
  });
}

for (const tema of ["light", "dark"] as const) {
  it(`edição, alternância e confirmações preservadas em ${tema}`, async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      const gravacoes = await abrir(page, tema);
      for (const codigo of ["At", "lx"]) {
        const editar = page.getByRole("button", {
          name: `Editar rótulo de ${codigo}`,
          exact: true,
        });
        await conferirFoco(editar);
        await page.keyboard.press("Enter");
        const campo = page.getByRole("textbox", { name: `Rótulo de ${codigo}` });
        const salvar = page.getByRole("button", { name: `Salvar rótulo de ${codigo}` });
        const cancelar = page.getByRole("button", { name: `Cancelar edição de ${codigo}` });
        expect(await salvar.getAttribute("data-variant")).toBe("secondary");
        expect(await cancelar.getAttribute("data-variant")).toBe("secondary");
        expect(await campo.evaluate((el) => getComputedStyle(el).borderTopStyle)).not.toBe("none");
        await campo.fill("x");
        expect(await salvar.isDisabled()).toBe(true);
        await cancelar.click();
        await editar.click();
        await campo.fill(`Novo rótulo ${codigo}`);
        await salvar.click();
        expect(await page.getByText(`Novo rótulo ${codigo}`, { exact: true }).isVisible()).toBe(
          true,
        );
        await page.getByRole("button", { name: `Excluir ${codigo}`, exact: true }).click();
        let dialogo = page.getByRole("alertdialog");
        expect(
          await dialogo
            .getByRole("button", { name: "Excluir", exact: true })
            .getAttribute("data-variant"),
        ).toBe("destructive");
        await dialogo.getByRole("button", { name: "Cancelar" }).click();
        expect(await page.getByText(`Novo rótulo ${codigo}`, { exact: true }).isVisible()).toBe(
          true,
        );
        await page.getByRole("button", { name: `Excluir ${codigo}`, exact: true }).click();
        dialogo = page.getByRole("alertdialog");
        await dialogo.getByRole("button", { name: "Excluir", exact: true }).click();
        expect(await page.getByText(`Novo rótulo ${codigo}`, { exact: true }).count()).toBe(0);
      }
      await page.getByRole("switch", { name: "Reativar Jx" }).click();
      expect(
        await page.getByRole("switch", { name: "Desativar Jx" }).getAttribute("aria-checked"),
      ).toBe("true");
      expect(gravacoes).toEqual([]);
    } finally {
      await page.close();
    }
  });
  it(`ordem, limpeza, remoção e cópia continuam funcionando em ${tema}`, async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
      reducedMotion: "reduce",
    });
    try {
      const gravacoes = await abrir(page, tema);
      await abrirAlmoco(page);
      await page.getByRole("button", { name: "Limpar horário de 1º ano A" }).click();
      expect(await page.getByRole("button", { name: "Limpar horário de 1º ano A" }).count()).toBe(
        0,
      );
      const ordem = page.getByRole("list", { name: "Ordem do almoço de Segunda-feira" });
      await page.getByRole("button", { name: "Descer 1º ano A" }).click();
      expect(await ordem.locator("li").first().innerText()).toContain("1º ano B");
      await page.getByRole("button", { name: "Subir 1º ano A" }).click();
      expect(await ordem.locator("li").first().innerText()).toContain("1º ano A");
      await page.getByRole("button", { name: "Copiar para os outros dias" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
      await page.getByRole("button", { name: "Copiar para os outros dias" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Copiar", exact: true })
        .click();
      await page.getByRole("button", { name: "Tirar 1º ano B da ordem" }).click();
      expect(await page.getByRole("button", { name: "Tirar 1º ano B da ordem" }).count()).toBe(0);
      expect(gravacoes).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
