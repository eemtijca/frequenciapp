// Componentes reais, CSS real e API inteiramente simulada em navegador isolado.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  chromium,
  expect as verificarTela,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { selecionarCategoriaConfiguracoes } from "../../helpers/categorias-configuracoes";

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
async function abrir(page: Page, tema: "light" | "dark", simularGravacao = false) {
  const gravacoes: string[] = [];
  const prova = {
    id: "prova-teste",
    turmaId: "turma-0",
    dia: "2026-03-10",
    inicio: "07:00",
    fim: "09:00",
    disciplina: "Matemática",
  };
  let provas: (typeof prova)[] = [];
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const metodo = route.request().method();
    if (metodo !== "GET") gravacoes.push(`${metodo} ${pathname}`);
    if (pathname === "/api/configuracoes/completo" && metodo === "GET") {
      return route.fulfill({ json: completo });
    }
    if (simularGravacao && pathname === "/api/provas-bimestrais") {
      if (metodo === "POST") {
        expect(route.request().postDataJSON()).toEqual({
          turmaIds: [prova.turmaId],
          dia: prova.dia,
          inicio: prova.inicio,
          fim: prova.fim,
          disciplina: prova.disciplina,
        });
        provas = [prova];
      }
      return route.fulfill({ json: { provas } });
    }
    if (simularGravacao && pathname === "/api/configuracoes/lote" && metodo === "POST") {
      const { desejado } = route.request().postDataJSON();
      expect(Object.keys(desejado)).toEqual(["justificativas"]);
      expect(desejado.justificativas).toContainEqual({
        codigo: "Ui",
        rotulo: "Justificativa de teste",
        ativo: true,
      });
      return route.fulfill({
        json: {
          completo: { ...completo, justificativas: desejado.justificativas },
          segredosBi: [],
        },
      });
    }
    return route.fulfill({ status: 503, json: { error: "Indisponível no teste" } });
  });
  await page.goto(url);
  await page.evaluate(
    (t) =>
      document.documentElement.setAttribute(
        "data-mui-color-scheme",
        t === "dark" ? "dark" : "light",
      ),
    tema,
  );
  await page
    .getByRole("tablist", { name: "Ações da escola" })
    .getByRole("tab", { name: "Cadastros" })
    .click();
  return gravacoes;
}

it.each([
  { largura: 390, tema: "light" },
  { largura: 1440, tema: "dark" },
] as const)(
  "mantém o raio de 12 px no grupo de preferências da planilha a $largura px ($tema)",
  async ({ largura, tema }) => {
    const page = await browser.newPage({ viewport: { width: largura, height: 844 } });
    try {
      await abrir(page, tema);
      await selecionarCategoriaConfiguracoes(page, "Planilhas");
      const planilha = page.locator('[data-secao="planilha-frequencia"]');
      await planilha.getByRole("button", { name: /Planilha de frequência/ }).click();
      const grupo = planilha.getByRole("group", { name: "Preferências no rascunho" });
      await verificarTela(grupo).toBeVisible();
      const raios = await grupo.evaluate((el) => {
        const c = getComputedStyle(el);
        return [
          c.borderTopLeftRadius,
          c.borderTopRightRadius,
          c.borderBottomRightRadius,
          c.borderBottomLeftRadius,
        ];
      });
      expect(raios).toEqual(["12px", "12px", "12px", "12px"]);
    } finally {
      await page.close();
    }
  },
);

it("explica as opções da cópia e devolve o foco ao cancelar a importação", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const gravacoes = await abrir(page, "light");
    await selecionarCategoriaConfiguracoes(page, "Dados");
    const secao = page.getByRole("region", { name: "Cópia de segurança", exact: true });
    await verificarTela(secao.getByText(/Por padrão, o ZIP é protegido por senha/)).toBeVisible();
    await verificarTela(secao.getByText(/JSON original sem senha/)).toBeVisible();
    const importar = secao.getByRole("button", { name: "Importar cópia", exact: true });
    await importar.focus();
    await page.keyboard.press("Enter");
    const dialogo = page.getByRole("alertdialog", { name: "Importar cópia?" });
    await verificarTela(dialogo).toBeVisible();
    await page.keyboard.press("Escape");
    await verificarTela(dialogo).toBeHidden();
    await verificarTela(importar).toBeFocused();
    expect(gravacoes).toEqual([]);
  } finally {
    await page.close();
  }
});

it.each([
  { largura: 320, tema: "light" },
  { largura: 390, tema: "dark" },
  { largura: 1440, tema: "light" },
  { largura: 1440, tema: "dark" },
] as const)(
  "separa abas, títulos e textos de apoio em $largura px ($tema)",
  async ({ largura, tema }) => {
    const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
    try {
      await abrir(page, tema);
      async function espaco(antes: Locator, depois: Locator) {
        await verificarTela(antes).toBeVisible();
        await verificarTela(depois).toBeVisible();
        const [a, b] = await Promise.all([antes.boundingBox(), depois.boundingBox()]);
        if (!a || !b) throw new Error("Não foi possível medir os blocos visíveis.");
        return b.y - (a.y + a.height);
      }
      await expect(
        espaco(
          page.getByRole("tablist", { name: "Ações da escola" }),
          page.getByText(/^As mudanças dos cadastros entram no rascunho/),
        ),
      ).resolves.toBeCloseTo(12, 0);

      await selecionarCategoriaConfiguracoes(page, "Horários");
      await page.getByRole("tab", { name: "Provas", exact: true }).click();
      const titulo = page.getByRole("heading", { name: "Nova prova", exact: true });
      const descricao = page.getByText(/^Adicionar prova grava o horário na hora/);
      await expect(
        espaco(page.getByRole("tablist", { name: "Ações dos horários" }), titulo),
      ).resolves.toBeCloseTo(12, 0);
      await expect(espaco(titulo, descricao)).resolves.toBeCloseTo(8, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
    } finally {
      await page.close();
    }
  },
);

it("grava a prova sem enviar o catálogo e só envia o lote na confirmação", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const gravacoes = await abrir(page, "light", true);
    const justificativas = page.getByRole("region", { name: "Justificativas", exact: true });
    await justificativas.getByRole("button", { name: "Adicionar justificativa" }).click();
    await justificativas.getByLabel("Código", { exact: true }).fill("Ui");
    await justificativas.getByLabel("Rótulo", { exact: true }).fill("Justificativa de teste");
    await justificativas.getByRole("button", { name: "Adicionar ao rascunho" }).click();
    expect(gravacoes).toEqual([]);

    const categorias = page.getByRole("navigation", { name: "Categorias de configurações" });
    const seletor = categorias.getByRole("combobox", { name: /^Categoria/ });
    const escola = categorias.getByRole("button", { name: "Escola", exact: true });
    await verificarTela(seletor).toHaveText("Escola");
    await verificarTela(escola).toBeHidden();
    await page.setViewportSize({ width: 1240, height: 900 });
    await verificarTela(seletor).toBeHidden();
    await verificarTela(escola).toHaveAttribute("aria-current", "true");
    await verificarTela(justificativas.getByText("Justificativa de teste")).toBeVisible();

    await selecionarCategoriaConfiguracoes(page, "Horários");
    await page.getByRole("tab", { name: "Provas", exact: true }).click();
    const formulario = page.getByRole("form", { name: "Nova prova" });
    await verificarTela(formulario).toHaveAccessibleDescription(/fora do rascunho/);
    await formulario.getByLabel("Disciplina").fill("Matemática");
    await formulario.getByRole("checkbox", { name: "1º ano A", exact: true }).check();
    await formulario.getByRole("button", { name: "Adicionar prova", exact: true }).click();
    const cadastradas = page.getByRole("region", { name: "Provas cadastradas" });
    await verificarTela(cadastradas).toContainText("Matemática");
    expect(gravacoes).toEqual(["POST /api/provas-bimestrais"]);

    await page.setViewportSize({ width: 390, height: 844 });
    const [titulo, descricao, acao] = await Promise.all([
      cadastradas.getByRole("heading", { name: "Provas cadastradas" }).boundingBox(),
      cadastradas.getByText(/^A aba Horários mostra/).boundingBox(),
      cadastradas.getByRole("button", { name: "Encerrar período de provas" }).boundingBox(),
    ]);
    if (!titulo || !descricao || !acao) throw new Error("Cabeçalho das provas indisponível.");
    expect(descricao.y - (titulo.y + titulo.height)).toBeCloseTo(8, 0);
    expect(acao.y - (descricao.y + descricao.height)).toBeCloseTo(12, 0);

    const rodape = page.getByRole("region", { name: "Rascunho de configurações" });
    await verificarTela(rodape).toHaveCount(1);
    await verificarTela(rodape).toContainText("Alterações em 1 seção");
    const revisar = rodape.getByRole("button", { name: "Revisar alterações", exact: true });
    await revisar.click();
    const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?", exact: true });
    await verificarTela(revisao).toContainText("Justificativas");
    await revisao.getByRole("button", { name: "Continuar revisando", exact: true }).click();
    await verificarTela(revisar).toBeFocused();
    expect(gravacoes).toEqual(["POST /api/provas-bimestrais"]);
    await revisar.click();
    await revisao.getByRole("button", { name: "Salvar configurações", exact: true }).click();
    await verificarTela(rodape).toBeHidden();
    await verificarTela(revisao).toBeHidden();
    expect(gravacoes).toEqual(["POST /api/provas-bimestrais", "POST /api/configuracoes/lote"]);
  } finally {
    await page.close();
  }
});
it("transfere o foco da categoria ao ampliar a tela com o seletor aberto", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    const gravacoes = await abrir(page, "light");
    const nav = page.getByRole("navigation", { name: "Categorias de configurações" });
    const seletor = nav.getByRole("combobox", { name: /^Categoria/ });
    await seletor.focus();
    await seletor.press("Enter");
    const opcoes = page.getByRole("listbox");
    await verificarTela(opcoes).toBeVisible();

    await page.setViewportSize({ width: 1240, height: 900 });
    await verificarTela(opcoes).toBeHidden({ timeout: 2000 });
    const escola = nav.getByRole("button", { name: "Escola", exact: true });
    await verificarTela(escola).toBeFocused();
    await verificarTela(escola).toHaveAttribute("aria-current", "true");
    expect(gravacoes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("mantém o interruptor focado visível quando o primeiro rascunho mostra o rodapé", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 340 } });
  try {
    const gravacoes = await abrir(page, "light");
    await page.getByRole("tab", { name: "Geral", exact: true }).click();
    const recurso = page.getByRole("switch", { name: "Saídas e Entradas", exact: true });
    await recurso.focus();
    await recurso.evaluate((el) => {
      window.scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - 12));
    });
    const gatilho = await recurso.boundingBox();
    expect(gatilho && gatilho.y + gatilho.height).toBeGreaterThan(300);
    await page.keyboard.press("Space");
    const rodape = page.getByRole("region", { name: "Rascunho de configurações" });
    await verificarTela(rodape).toBeVisible();
    await verificarTela(recurso).toBeFocused();
    await verificarTela
      .poll(
        async () => {
          const controle = await recurso.boundingBox();
          const barra = await rodape.boundingBox();
          return (
            controle !== null &&
            barra !== null &&
            controle.y >= 0 &&
            controle.y + controle.height <= Math.min(340, barra.y)
          );
        },
        { timeout: 2000 },
      )
      .toBe(true);
    expect(gravacoes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("mantém o aviso de cadastro acima do rodapé sem bloquear a revisão", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  try {
    const gravacoes = await abrir(page, "light");
    const justificativas = page.getByRole("region", { name: "Justificativas", exact: true });
    await justificativas.getByRole("button", { name: "Adicionar justificativa" }).click();
    await justificativas.getByLabel("Código", { exact: true }).fill("Ui");
    await justificativas.getByLabel("Rótulo", { exact: true }).fill("Justificativa de teste");
    await justificativas.getByRole("button", { name: "Adicionar ao rascunho" }).click();

    const barra = page.getByRole("region", { name: "Rascunho de configurações", exact: true });
    const aviso = page
      .getByRole("status")
      .filter({ hasText: "Justificativa adicionada ao rascunho" });
    await verificarTela(aviso).toBeVisible();
    await verificarTela
      .poll(
        async () => {
          const mensagem = await aviso.boundingBox();
          const rodape = await barra.boundingBox();
          return (
            mensagem !== null && rodape !== null && mensagem.y + mensagem.height + 7 <= rodape.y
          );
        },
        { timeout: 1500 },
      )
      .toBe(true);

    await barra.getByRole("button", { name: "Revisar alterações", exact: true }).click();
    await verificarTela(
      page.getByRole("alertdialog", { name: "Salvar configurações?" }),
    ).toBeVisible();
    expect(gravacoes).toEqual([]);
  } finally {
    await page.close();
  }
});

async function abrirAlmoco(page: Page) {
  await selecionarCategoriaConfiguracoes(page, "Horários");
  await page
    .getByRole("tablist", { name: "Ações dos horários" })
    .getByRole("tab", { name: "Almoço", exact: true })
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
        amostra.style.color = "var(--template-palette-falta-main)";
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
  await botao.page().mouse.move(0, 0);
  await botao.waitFor({ state: "visible" });
  await expect
    .poll(() => botao.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");
  const estado = await botao.evaluate((el) => {
    const alvo = getComputedStyle(el, "::after");
    return {
      largura: el.getBoundingClientRect().width,
      altura: el.getBoundingClientRect().height,
      alvoLargura: Number.parseFloat(alvo.width) || 0,
      alvoAltura: Number.parseFloat(alvo.height) || 0,
    };
  });
  expect(estado.largura).toBeGreaterThanOrEqual(40);
  expect(estado.altura).toBeGreaterThanOrEqual(40);
  if (estado.alvoLargura > 0) expect(estado.alvoLargura).toBeGreaterThanOrEqual(48);
  if (estado.alvoAltura > 0) expect(estado.alvoAltura).toBeGreaterThanOrEqual(48);
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
      ]) {
        await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
      }
      await conferirPerigo(page.getByRole("button", { name: "Excluir At", exact: true }));
      await conferirPerigo(page.getByRole("button", { name: "Excluir lx", exact: true }));
      await conferirFoco(page.getByRole("button", { name: "Editar rótulo de At", exact: true }));
      expect(await page.getByRole("switch", { name: "Desativar At" }).isChecked()).toBe(true);
      expect(await page.getByRole("switch", { name: "Reativar Jx" }).isChecked()).toBe(false);
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
      if (process.env.CAPTURAS_CONFIG) {
        await page.screenshot({ path: path.join(tmpdir(), `config-almoco-${tema}.png`) });
      }
      const mover = page.getByRole("button", { name: "Descer 1º ano A" });
      await mover.hover();
      await expect
        .poll(() => mover.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe("rgba(0, 0, 0, 0)");
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
        const salvar = page.getByRole("button", {
          name: `Aplicar rótulo de ${codigo} ao rascunho`,
        });
        const cancelar = page.getByRole("button", { name: `Cancelar edição de ${codigo}` });
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
      await expect
        .poll(() => page.getByRole("switch", { name: "Desativar Jx" }).isChecked())
        .toBe(true);
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
