// Testa geometria e comandos públicos do Diretor com respostas sintéticas e gráficos reais.
import { appendFile, readFile } from "node:fs/promises";
import {
  chromium,
  webkit,
  expect as esperar,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "@playwright/test";
import { referenceLineClasses } from "@mui/x-charts/ChartsReferenceLine";
import { barClasses } from "@mui/x-charts/BarChart";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { EstatisticasDoDiretor } from "@/domain/estatisticas-diretor";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

const rotaEstatisticas = "/api/diretor/estatisticas";
const nomesDasAcoes = [
  /^Atualizar tela$/,
  /^Tema: .* Alterar tema$/,
  /^Animações da interface:/,
  /^Configurar notificações$/,
  /^Sobre$/,
  /^Trocar minha palavra-chave$/,
  /^Sair da conta$/,
];
const inicio = "2026-11-03";
const dia = "2026-11-23";
const fixture = "tests/componentes/interface/minhas-turmas.html";
const usaWebKit = process.env.FIXTURE_WEBKIT === "1";
let navegador: Browser;
let servidor: ServidorFixture;
let fonte: Buffer | undefined;

beforeAll(async () => {
  if (process.env.FIXTURE_FONTE_JAKARTA) fonte = await readFile(process.env.FIXTURE_FONTE_JAKARTA);
  servidor = await criarServidorFixture(fixture);
  navegador = await (usaWebKit ? webkit : chromium).launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

function estatisticas(url: URL): EstatisticasDoDiretor {
  const b = url.searchParams.get("turmaId") === "b";
  const base = {
    turmaId: b ? "b" : "a",
    turma: b ? "Ano QA B" : "Ano QA A",
    vinculo: { inicio, fim: null },
  };
  if (url.searchParams.get("ate") === "2026-10-31")
    return { ...base, periodo: null, estatisticas: null };
  return {
    ...base,
    periodo: { de: inicio, ate: dia },
    estatisticas: {
      alunos: b
        ? []
        : ["Aurora", "Brisa", "Cedro", "Duna", "Estrela"].map((nome, indice) => ({
            alunoId: nome,
            nome: `Aluno ${nome}`,
            ausencias: indice < 2 ? 2 : indice === 2 ? 1 : 0,
            taxa: indice < 2 ? 1 : indice === 2 ? 0.5 : 0,
            emRisco: indice < 2,
            diasComChamada: 2,
            faltas: null,
            justificadas: null,
            saidas: null,
          })),
      semanas: b
        ? []
        : [
            {
              inicio: "2026-11-02",
              ausencias: 2,
              taxa: 0.4,
              alunoDias: 5,
              faltas: null,
              justificadas: null,
            },
            {
              inicio: "2026-11-09",
              ausencias: 3,
              taxa: 0.6,
              alunoDias: 5,
              faltas: null,
              justificadas: null,
            },
          ],
      resumo: b
        ? { alunos: 1, emRisco: 0, ausencias: 0, alunoDias: 0, taxa: 0 }
        : { alunos: 5, emRisco: 2, ausencias: 5, alunoDias: 10, taxa: 0.5 },
      limiteRisco: 60,
      categorias: ["faltas"],
    },
  };
}

type Opcoes = Pick<BrowserContextOptions, "viewport" | "hasTouch" | "isMobile" | "colorScheme"> & {
  parametros?: string;
  falhar?: boolean;
  forcedColors?: BrowserContextOptions["forcedColors"];
  resposta?: (url: URL) => Promise<EstatisticasDoDiretor | number>;
};
const celular = {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  colorScheme: "light",
} as const;
const desktop = { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } as const;

type Pedidos = { metodo: string; caminho: string; busca: string }[];
async function comDiretor(
  { parametros = "", falhar = false, resposta, ...opcoes }: Opcoes,
  testar: (pagina: Page, pedidos: Pedidos) => Promise<void>,
) {
  const contexto = await navegador.newContext({
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    ...opcoes,
  });
  const pedidos: Pedidos = [];
  const inesperados: string[] = [];
  const erros: string[] = [];
  const origem = new URL(servidor.url).origin;
  try {
    await contexto.route("**/*", async (rota) => {
      const url = new URL(rota.request().url());
      const metodo = rota.request().method();
      if (url.origin === origem) {
        if (url.pathname.startsWith("/api/")) {
          pedidos.push({ metodo, caminho: url.pathname, busca: url.search });
          if (metodo === "GET" && url.pathname === rotaEstatisticas) {
            if (falhar && pedidos.length === 1)
              return rota.fulfill({
                status: 503,
                json: { error: "Não foi possível carregar as estatísticas." },
              });
            const resultado = resposta ? await resposta(url) : estatisticas(url);
            return typeof resultado === "number"
              ? rota.fulfill({
                  status: resultado,
                  json: { error: "Não foi possível carregar as estatísticas." },
                })
              : rota.fulfill({ json: resultado });
          }
          if (metodo === "GET" && url.pathname === "/api/notificacoes/assinatura") {
            return rota.fulfill({
              json: {
                configurada: false,
                chavePublica: null,
                ativa: false,
                preferencias: {},
                tipos: [],
                horarioResumo: "",
                horarioPendencias: "",
              },
            });
          }
          if (metodo === "POST" && url.pathname === "/api/auth/sair") {
            return rota.fulfill({ json: { ok: true } });
          }
        } else if (metodo === "GET" && url.pathname === "/fonte-diretor.woff2" && fonte) {
          return rota.fulfill({ body: fonte, contentType: "font/woff2" });
        } else if (metodo === "GET") return rota.continue();
      }
      inesperados.push(`${metodo} ${url.pathname}`);
      return rota.abort();
    });
    const pagina = await contexto.newPage();
    pagina.setDefaultTimeout(9000);
    pagina.on("pageerror", (erro) => erros.push(erro.name));
    await pagina.clock.setFixedTime(new Date(`${dia}T21:11:00-03:00`));
    await pagina.goto(`${servidor.url}${parametros}`);
    const familia = fonte ? '"Plus Jakarta Sans"' : "sans-serif";
    await pagina.addStyleTag({
      content: `:root { --font-jakarta: ${familia}; --font-jetbrains-mono: monospace; }
      ${fonte ? '@font-face { font-family: "Plus Jakarta Sans"; font-weight: 200 800; src: url("/fonte-diretor.woff2"); }' : ""}`,
    });
    if (fonte)
      await pagina.evaluate(async () => {
        const faces = await document.fonts.load('600 16px "Plus Jakarta Sans"');
        if (faces.length !== 1 || faces[0]?.status !== "loaded")
          throw new Error("Fonte local ausente");
        await document.fonts.ready;
      });
    await testar(pagina, pedidos);
    expect(inesperados, "requisições fora da fixture").toEqual([]);
    expect(erros, "erros não tratados na página").toEqual([]);
  } finally {
    await contexto.close();
  }
}

function cabecalho(pagina: Page) {
  return pagina.getByRole("banner");
}
function painel(pagina: Page) {
  return pagina.getByRole("region", { name: "Minhas turmas" });
}
async function esperarResumo(pagina: Page) {
  await esperar(painel(pagina).getByRole("group", { name: "Resumo do período" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

async function caixa(alvo: Locator) {
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error("Caixa de elemento ausente");
  return caixa;
}

async function emitirMetricas(etapa: string, medidas: object) {
  if (process.env.FIXTURE_METRICAS_DIRETOR)
    await appendFile(
      process.env.FIXTURE_METRICAS_DIRETOR,
      `${JSON.stringify({ etapa, navegador: navegador.version(), fonteLocal: Boolean(fonte), ...medidas })}\n`,
    );
}

async function medirCabecalho(pagina: Page) {
  const topo = cabecalho(pagina);
  const altura = (await caixa(topo)).height;
  const identidade = await caixa(topo.getByText("FrequenciApp", { exact: true }));
  const atualizacao = await caixa(
    topo.getByText("Atualizado em 23/11/2026 às 21:11", { exact: true }),
  );
  const acoes = await Promise.all(
    nomesDasAcoes.map((name) => caixa(topo.getByRole("button", { name }))),
  );
  return { altura, identidade, atualizacao, acoes };
}

it("mantém Sair na mesma faixa das opções da conta e Atualizar junto à identidade em 390 px", async () => {
  await comDiretor(celular, async (pagina) => {
    await esperarResumo(pagina);
    const m = await medirCabecalho(pagina);
    await emitirMetricas("cabecalho-390", m);
    const [atualizar, tema, ...conta] = m.acoes;
    if (!atualizar || !tema) throw new Error("Ações do cabeçalho ausentes");
    expect(
      conta.map((acao) => acao.y),
      "ações na faixa de Tema, incluindo Sair",
    ).toEqual(conta.map(() => tema.y));
    expect(atualizar.y, "Atualizar antes da faixa de Tema").toBeLessThan(tema.y);
    expect(atualizar.y, "Atualizar e última leitura na mesma faixa").toBeLessThan(
      m.atualizacao.y + m.atualizacao.height,
    );
    expect(atualizar.y + atualizar.height, "Atualizar cruza a faixa da marca").toBeGreaterThan(
      m.identidade.y,
    );
  });
});

async function medirDobra(pagina: Page) {
  const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
  const barras = grafico.locator(`.${barClasses.element}`);
  await esperar(barras).toHaveCount(5);
  const painelCaixa = await caixa(painel(pagina));
  const alturaBarra = await caixa(cabecalho(pagina));
  const legenda = await caixa(painel(pagina).getByRole("group", { name: "Resumo do período" }));
  const svg = await caixa(grafico.locator("svg"));
  const dados = await barras.evaluateAll((elementos) =>
    elementos
      .map((elemento) => {
        const { x, y, width, height, bottom } = elemento.getBoundingClientRect();
        return { x, y, width, height, bottom };
      })
      .filter(({ width, height }) => width > 0 && height > 0)
      .sort((a, b) => a.y - b.y),
  );
  const tela = await pagina.evaluate(() => ({
    largura: window.innerWidth,
    altura: window.innerHeight,
    escala: visualViewport?.scale,
    rolagem: window.scrollY,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  const completas = dados.filter(
    (barra) =>
      barra.y >= alturaBarra.height &&
      barra.bottom <= tela.altura &&
      barra.x >= 0 &&
      barra.x + barra.width <= tela.largura,
  ).length;
  return {
    tela,
    painel: painelCaixa,
    topo: alturaBarra.height,
    resumo: legenda,
    svg,
    dados,
    completas,
  };
}

it("mede a geometria de repouso da amostra de celular e desktop", async () => {
  for (const [chave, opcoes] of [
    ["M01", celular],
    ["D01", desktop],
  ] as const) {
    await comDiretor(opcoes, async (pagina) => {
      await esperarResumo(pagina);
      const m = await medirDobra(pagina);
      await emitirMetricas(chave, m);
      expect(m.tela).toEqual({
        largura: opcoes.viewport.width,
        altura: opcoes.viewport.height,
        escala: 1,
        rolagem: 0,
        overflow: 0,
      });
      expect(m.dados).toHaveLength(3);
      expect(m.painel.width, "painel dentro da largura de leitura").toBeLessThanOrEqual(840);
      expect(m.painel.x).toBeCloseTo(opcoes.viewport.width - (m.painel.x + m.painel.width), 0);
      if (chave === "D01") expect(m.completas).toBe(3);
      else {
        expect(m.completas, "barras completas no topo do celular").toBeGreaterThanOrEqual(1);
        expect(m.resumo.height, "altura do resumo móvel").toBeLessThanOrEqual(180);
      }
    });
  }
});

it("distingue a turma e a forma de exibição ativas sem depender da cor no tema escuro", async () => {
  await comDiretor(desktop, async (pagina) => {
    await esperarResumo(pagina);
    const turmas = painel(pagina).getByRole("group", { name: "Turma", exact: true });
    const exibicao = painel(pagina).getByRole("group", { name: "Forma de exibição" });
    for (const grupo of [turmas, exibicao]) {
      const ativo = grupo.getByRole("button", { pressed: true });
      const inativo = grupo.getByRole("button", { pressed: false });
      const pintura = await Promise.all(
        [ativo, inativo].map((botao) =>
          botao.evaluate((el) => {
            const { backgroundColor, borderColor, borderTopWidth } = getComputedStyle(el);
            return { backgroundColor, borderColor, borderTopWidth };
          }),
        ),
      );
      await emitirMetricas("selecao-escuro", { pintura });
      expect(pintura[0]?.borderColor, "contorno da opção selecionada").not.toBe(
        pintura[1]?.borderColor,
      );
      expect(
        pintura.map((m) => m.borderTopWidth),
        "distinção pela espessura do contorno",
      ).toEqual(["2px", "1px"]);
    }
  });
});

it("mantém o texto do limite fora das barras em 390 e 1440 px", async () => {
  for (const opcoes of [desktop, celular])
    await comDiretor(opcoes, async (pagina) => {
      const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
      const barras = grafico.locator(`.${barClasses.element}`);
      await esperar(barras).toHaveCount(5);
      const svg = await caixa(grafico.locator("svg"));
      const limite = await caixa(
        grafico.locator(`.${referenceLineClasses.label}`).filter({ hasText: "limite 60%" }),
      );
      const intersecoes = (
        await barras.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
      ).filter(
        (b) =>
          b.width > 0 &&
          b.height > 0 &&
          limite.x < b.right &&
          limite.x + limite.width > b.left &&
          limite.y < b.bottom &&
          limite.y + limite.height > b.top,
      ).length;
      await emitirMetricas("limiar-aluno", {
        largura: opcoes.viewport.width,
        intersecoes,
        limite,
        svg,
      });
      expect(limite.x).toBeGreaterThanOrEqual(svg.x);
      expect(limite.x + limite.width).toBeLessThanOrEqual(svg.x + svg.width);
      expect(intersecoes, "rótulo do limiar sobre os dados").toBe(0);
    });
});

it("permite rolar a tabela estreita com foco e mantém apenas o aluno fixo", async () => {
  await comDiretor({ ...celular, viewport: { width: 320, height: 844 } }, async (pagina) => {
    await esperarResumo(pagina);
    const botao = painel(pagina).getByRole("button", { name: "Tabela" });
    await botao.click();
    const tabela = painel(pagina).getByRole("table");
    await esperar(tabela).toBeVisible();
    const aluno = tabela.getByRole("rowheader", { name: /Aluno Aurora/ });
    const ausencias = tabela
      .getByRole("row")
      .filter({ has: pagina.getByRole("rowheader", { name: /Aluno Aurora/ }) })
      .getByRole("cell", { name: "2", exact: true })
      .first();
    const posicoes = await Promise.all(
      [aluno, ausencias].map((celula) => celula.evaluate((el) => getComputedStyle(el).position)),
    );
    await emitirMetricas("tabela-320", { posicoes });
    expect(posicoes, "somente a primeira coluna acompanha a rolagem").toEqual(["sticky", "static"]);
    const regiao = painel(pagina).getByRole("region", {
      name: "Rolagem da tabela de ausência por aluno",
    });
    await pagina.keyboard.press("Tab");
    await esperar(regiao).toBeFocused();
    expect(await regiao.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    const dimensoes = await regiao.evaluate((el) => ({
      largura: el.clientWidth,
      conteudo: el.scrollWidth,
    }));
    expect(dimensoes.conteudo).toBeGreaterThan(dimensoes.largura);
    const x = (await caixa(aluno)).x;
    const xAusencias = (await caixa(ausencias)).x;
    await pagina.keyboard.press("ArrowRight");
    await esperar.poll(() => regiao.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect((await caixa(aluno)).x).toBeCloseTo(x, 0);
    expect((await caixa(ausencias)).x).toBeLessThan(xAusencias);
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await emitirMetricas("rolagem-tabela-320", {
      ...dimensoes,
      rolagem: await regiao.evaluate((el) => el.scrollLeft),
    });
  });
});

it("em 320 px preserva os alvos do cabeçalho, Tab e a leitura do resumo", async () => {
  await comDiretor(
    { ...celular, viewport: { width: 320, height: 844 }, parametros: "?longo" },
    async (pagina) => {
      await esperarResumo(pagina);
      const m = await medirCabecalho(pagina);
      const identidade = cabecalho(pagina).getByText(/ · Diretor de turma$/);
      const textoCabe = await identidade.evaluate((el) => {
        const limites = el.getBoundingClientRect();
        const texto = document.createRange();
        texto.selectNodeContents(el);
        return Array.from(texto.getClientRects()).every(
          (r) => r.left >= limites.left - 1 && r.right <= limites.right + 1,
        );
      });
      expect(textoCabe, "nome longo e papel continuam inteiros na identidade").toBe(true);
      const alvos = [];
      for (const name of nomesDasAcoes) {
        const botao = cabecalho(pagina).getByRole("button", { name });
        await esperar(botao).toHaveCount(1);
        const alvo = await botao.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const xs = [r.left + 1, r.right - 1],
            ys = [r.top + 1, r.bottom - 1];
          return {
            largura: r.width,
            altura: r.height,
            clicavel: xs.every((x) =>
              ys.every((y) => el.contains(document.elementFromPoint(x, y))),
            ),
          };
        });
        alvos.push(alvo);
        await pagina.keyboard.press("Tab");
        await esperar(botao).toBeFocused();
        expect(await botao.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
      }
      expect(alvos).toEqual(nomesDasAcoes.map(() => ({ largura: 48, altura: 48, clicavel: true })));
      expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      const resumo = painel(pagina).getByRole("group", { name: "Resumo do período" });
      const medidas = [];
      for (const [rotulo, valor] of [
        ["Alunos acompanhados", "5"],
        ["Em risco (a partir de 60%)", "2"],
        ["Ausência da turma", "50%"],
      ] as const) {
        const a = await caixa(resumo.getByText(valor, { exact: true }));
        const b = await caixa(resumo.getByText(rotulo, { exact: true }));
        expect(a.x + a.width).toBeLessThan(b.x);
        expect(b.x + b.width).toBeLessThan(320);
        expect(a.y).toBeLessThan(b.y + b.height);
        medidas.push({ valor: a, rotulo: b });
      }
      await emitirMetricas("largura-320", { topo: m.altura, alvos, resumo: medidas });
    },
  );
});

it("preserva a atualização, os menus e os diálogos ao mudar a largura", async () => {
  await comDiretor(celular, async (pagina, pedidos) => {
    await esperarResumo(pagina);
    const topo = cabecalho(pagina);
    const atualizar = topo.getByRole("button", { name: "Atualizar tela" });
    await pagina.clock.setFixedTime(new Date(`${dia}T21:12:00-03:00`));
    await atualizar.tap();
    await esperar(topo.getByText("Atualizado em 23/11/2026 às 21:12")).toBeVisible();
    expect(pedidos.filter((r) => r.caminho === rotaEstatisticas)).toHaveLength(2);
    // O mesmo gatilho e seu foco são preservados quando o layout muda com menu aberto.
    await pagina.keyboard.press("Tab");
    const tema = topo.getByRole("button", { name: /Alterar tema/ });
    await tema.focus();
    await pagina.keyboard.press("Enter");
    await esperar(pagina.getByRole("radiogroup", { name: "Tema do aplicativo" })).toBeVisible();
    await pagina.setViewportSize({ width: 905, height: 844 });
    await pagina.getByRole("radio", { name: "Escuro" }).click();
    await esperar(topo.getByRole("button", { name: /Tema: Escuro/ })).toBeFocused();
    await esperar(pagina.locator("html")).toHaveAttribute("data-mui-color-scheme", "dark");
    const animacoes = topo.getByRole("button", { name: /^Animações da interface:/ });
    await animacoes.focus();
    await pagina.keyboard.press("Enter");
    await pagina.getByRole("menuitemradio", { name: "Desativadas" }).click();
    await esperar(pagina.getByRole("menuitemradio", { name: "Desativadas" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await pagina.keyboard.press("Escape");
    await esperar(animacoes).toBeFocused();
    for (const [botao, titulo] of [
      ["Configurar notificações", /Notificações/],
      ["Sobre", /Sobre o FrequenciApp/],
      ["Trocar minha palavra-chave", /Palavra-chave|Trocar/i],
    ] as const) {
      const gatilho = topo.getByRole("button", { name: botao, exact: true });
      await gatilho.focus();
      await pagina.keyboard.press("Enter");
      const dialogo = pagina.getByRole("dialog", { name: titulo });
      await esperar(dialogo).toBeVisible();
      await pagina.keyboard.press("Escape");
      await esperar(dialogo).toBeHidden();
      await esperar(gatilho).toBeFocused();
    }
    await topo.getByRole("button", { name: "Sair da conta" }).click();
    await esperar(pagina.locator("html")).toHaveAttribute("data-rota-atualizada", "true");
    expect(pedidos.filter((r) => r.metodo !== "GET")).toEqual([
      { metodo: "POST", caminho: "/api/auth/sair", busca: "" },
    ]);
  });
});

it("bloqueia o painel e as notificações até a troca obrigatória da palavra-chave", async () => {
  await comDiretor({ ...celular, parametros: "?obrigatoria" }, async (pagina, pedidos) => {
    await esperar(pagina.getByRole("dialog", { name: "Crie sua palavra-chave" })).toBeVisible();
    await esperar(pagina.locator("header").getByText("Ainda não atualizado")).toBeVisible();
    await esperar(pagina.getByText("Palavra-chave necessária")).toBeVisible();
    expect(
      await pagina.locator('header button[aria-label="Configurar notificações"]').count(),
    ).toBe(0);
    expect(pedidos).toEqual([]);
  });
});

it("conserva leitura semanal, troca de turma e período anterior ao vínculo", async () => {
  await comDiretor(celular, async (pagina, pedidos) => {
    await esperarResumo(pagina);
    await esperar(
      painel(pagina).getByText("Ano QA A · 03/11 a 23/11", { exact: true }),
    ).toBeVisible();
    const tituloSemanas = painel(pagina).getByRole("heading", {
      name: "Ausência da turma por semana",
    });
    await tituloSemanas.scrollIntoViewIfNeeded();
    const semanas = painel(pagina).getByRole("img", {
      name: /^Ausência da turma por semana, de 02\/11 a 09\/11\./,
    });
    await esperar(semanas.locator("svg")).toBeVisible();
    const legendas = painel(pagina).getByText(
      "Semanas pela segunda-feira; ausência sobre os dias com chamada de cada aluno.",
    );
    await esperar(legendas).toBeVisible();
    await esperar(semanas.getByText("limite 60%", { exact: true })).toBeVisible();
    await esperar(painel(pagina).getByText(/Alunos da turma de origem, ativos hoje/)).toBeVisible();
    const turmaB = painel(pagina).getByRole("button", { name: "Ano QA B" });
    await turmaB.tap();
    await esperar(turmaB).toHaveAttribute("aria-pressed", "true");
    await esperar(
      painel(pagina).getByRole("heading", { name: "Sem chamada no período" }),
    ).toBeVisible();
    await esperar(
      painel(pagina)
        .getByRole("group", { name: "Resumo do período" })
        .getByText("sem chamada", { exact: true }),
    ).toBeVisible();
    await painel(pagina).getByRole("button", { name: "Mês anterior" }).tap();
    await esperar(
      painel(pagina).getByRole("heading", { name: "Sem dados neste mês" }),
    ).toBeVisible();
    await esperar(
      painel(pagina).getByText(/O vínculo com esta turma começou em 03\/11\/2026/),
    ).toBeVisible();
    expect(pedidos.map((r) => r.busca)).toEqual([
      "?turmaId=a&de=2026-11-01&ate=2026-11-30",
      "?turmaId=b&de=2026-11-01&ate=2026-11-30",
      "?turmaId=b&de=2026-10-01&ate=2026-10-31",
    ]);
  });
});

it("informa a falha inicial e permite carregar os dados ao atualizar", async () => {
  await comDiretor({ ...celular, falhar: true }, async (pagina, pedidos) => {
    await esperar(
      painel(pagina).getByText("Não foi possível carregar as estatísticas."),
    ).toBeVisible();
    await esperar(cabecalho(pagina).getByText("Ainda não atualizado")).toBeVisible();
    await cabecalho(pagina).getByRole("button", { name: "Atualizar tela" }).tap();
    await esperarResumo(pagina);
    await esperar(
      painel(pagina).getByText("Não foi possível carregar as estatísticas."),
    ).toHaveCount(0);
    expect(pedidos).toHaveLength(2);
  });
});

// Usa as cores computadas pelo motor e compõe superfícies translúcidas em sRGB.
async function contraste(
  alvo: Locator,
  propriedade: "borderTopColor" | "stroke",
  referencia?: string,
) {
  return alvo.evaluate(
    (el, { propriedade, referencia }) => {
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas indisponível");
      function pintar(cor: string) {
        if (!ctx) throw new Error("Canvas indisponível");
        ctx.fillStyle = cor;
        ctx.fillRect(0, 0, 1, 1);
      }
      function brilho() {
        if (!ctx) throw new Error("Canvas indisponível");
        const [r, g, b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map((canal) => {
          const v = canal / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return (r ?? 0) * 0.2126 + (g ?? 0) * 0.7152 + (b ?? 0) * 0.0722;
      }
      const fundos = [];
      for (let no = el.parentElement; no; no = no.parentElement)
        fundos.unshift(getComputedStyle(no).backgroundColor);
      pintar("white");
      fundos.forEach(pintar);
      const externo = brilho();
      const estilo = getComputedStyle(el);
      pintar(referencia ?? estilo.backgroundColor);
      const interno = brilho();
      pintar(estilo[propriedade]);
      const traco = brilho();
      const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { externo: razao(externo, traco), interno: razao(interno, traco) };
    },
    { propriedade, referencia },
  );
}

it("R02: contrasta os contornos de ambas as opções nos dois temas", async () => {
  for (const colorScheme of ["light", "dark"] as const) {
    await comDiretor({ ...desktop, colorScheme }, async (pagina) => {
      await esperarResumo(pagina);
      const medidas = [];
      for (const name of ["Turma", "Forma de exibição"])
        for (const pressed of [true, false]) {
          const botao = painel(pagina)
            .getByRole("group", { name, exact: true })
            .getByRole("button", { pressed });
          medidas.push({ name, pressed, ...(await contraste(botao, "borderTopColor")) });
        }
      await emitirMetricas("contraste-opcoes", { colorScheme, medidas });
      for (const m of medidas)
        expect(
          Math.min(m.externo, m.interno),
          `${colorScheme} ${m.name} selecionado=${m.pressed}`,
        ).toBeGreaterThanOrEqual(3);
    });
  }
});

const nomesComColisao = [
  "Lia Maria Costa",
  "Lia Paula Costa",
  "Lia Maria Costa",
  "Acompanhamento".repeat(7),
  "Maria Fernanda do Nascimento Albuquerque",
];

function casosLongos(url: URL, limiteRisco = 60, todasCategorias = false): EstatisticasDoDiretor {
  const dados = estatisticas(url);
  const e = dados.estatisticas;
  if (!e) return dados;
  e.limiteRisco = limiteRisco;
  if (todasCategorias) e.categorias = ["faltas", "justificativas", "saidas"];
  e.alunos = e.alunos.map((a, i) => ({
    ...a,
    nome: nomesComColisao[i] ?? a.nome,
    emRisco: a.taxa * 100 >= limiteRisco,
    ...(todasCategorias ? { faltas: a.ausencias, justificadas: 0, saidas: i + 1 } : {}),
  }));
  return dados;
}

it("R02: nomes abreviados iguais mantêm cada barra e sua dica em 320 px", async () => {
  await comDiretor(
    {
      viewport: { width: 320, height: 844 },
      colorScheme: "light",
      resposta: async (url) => casosLongos(url),
    },
    async (pagina) => {
      const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
      const barras = grafico.locator(`.${barClasses.element}`);
      await esperar(barras).toHaveCount(5);
      const coordenadas = await barras.evaluateAll((els) =>
        els.map((el) => ({
          y: el.getBoundingClientRect().y,
          largura: el.getBoundingClientRect().width,
        })),
      );
      await emitirMetricas("identidade-das-barras", { coordenadas });
      // WebKit não atribui caixa pintada aos retângulos com largura zero.
      const pintadas = coordenadas.filter((b) => b.largura > 0);
      expect(pintadas).toHaveLength(3);
      expect(new Set(pintadas.map((b) => b.y)).size, "faixa própria de cada aluno").toBe(3);
      expect(coordenadas[0]?.largura).toBe(coordenadas[1]?.largura);
      expect(coordenadas[2]?.largura).toBeCloseTo((coordenadas[0]?.largura ?? 0) / 2, 0);
      for (const [indice, nome, taxa] of [
        [0, nomesComColisao[0], "100% de ausência"],
        [1, nomesComColisao[1], "100% de ausência"],
        [2, nomesComColisao[2], "50% de ausência"],
      ] as const) {
        await barras.nth(indice).hover();
        const dica = pagina.getByRole("tooltip");
        await esperar(dica.getByText(nome ?? "", { exact: true })).toBeVisible();
        await esperar(dica.getByLabel(taxa)).toBeVisible();
      }
      const eixo = grafico.locator(".MuiChartsAxis-directionY text");
      expect((await eixo.allTextContents()).length).toBe(5);
      expect((await eixo.allTextContents()).slice(0, 3).map((r) => r.match(/^\d+/)?.[0])).toEqual([
        "1",
        "2",
        "3",
      ]);
      const sv = await caixa(grafico.locator("svg"));
      for (const rotulo of await eixo.all()) {
        const b = await caixa(rotulo);
        expect(b.x).toBeGreaterThanOrEqual(sv.x - 0.5);
      }
      expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    },
  );
});

type BordasHorizontais = { left: number; right: number };

function conferirEstabilidadeHorizontal(inicio: BordasHorizontais[], fim: BordasHorizontais[]) {
  expect(fim, "CARDINALIDADE_DA_LEGENDA").toHaveLength(inicio.length);
  // A resolução subpixel do layout pode mudar as bordas sem deslocamento relevante.
  // O limite de 0,5 CSS px não substitui o teste independente de recorte.
  inicio.forEach((fragmento, indice) => {
    const atual = fim[indice];
    if (!atual) throw new Error("FRAGMENTO_AUSENTE");
    for (const borda of ["left", "right"] as const) {
      const deslocamento = Math.abs(atual[borda] - fragmento[borda]);
      expect(deslocamento, "LEGENDA_DESLOCOU").toBeLessThanOrEqual(0.5);
    }
  });
}

function conferirRecorteHorizontal(
  fragmento: BordasHorizontais,
  esquerda: number,
  direita: number,
) {
  expect(fragmento.left, "LEGENDA_CORTADA_ESQUERDA").toBeGreaterThanOrEqual(esquerda - 1);
  expect(fragmento.right, "LEGENDA_CORTADA_DIREITA").toBeLessThanOrEqual(direita + 1);
}

it("distingue estabilidade subpixel de deslocamento, perda de fragmentos e recorte", () => {
  const inicio = [{ left: 33, right: 228.046875 }];
  const fimR02 = [{ left: 32.640625, right: 227.6875 }];
  expect(fimR02).not.toEqual(inicio);
  conferirEstabilidadeHorizontal(inicio, fimR02);
  conferirEstabilidadeHorizontal(inicio, [{ left: 33.5, right: 228.546875 }]);
  expect(() =>
    conferirEstabilidadeHorizontal(inicio, [{ left: 33.51, right: 228.556875 }]),
  ).toThrow("LEGENDA_DESLOCOU");
  expect(() => conferirEstabilidadeHorizontal(inicio, [{ left: 33, right: 229.046875 }])).toThrow(
    "LEGENDA_DESLOCOU",
  );
  expect(() => conferirEstabilidadeHorizontal(inicio, [])).toThrow("CARDINALIDADE_DA_LEGENDA");
  expect(() => conferirEstabilidadeHorizontal(inicio, [...fimR02, ...fimR02])).toThrow(
    "CARDINALIDADE_DA_LEGENDA",
  );

  // A medida RED arquivada se deslocou e também saiu da área de rolagem.
  const antes = { left: 33, right: 237.359375 };
  const depois = { left: -157, right: 47.359375 };
  expect(() => conferirEstabilidadeHorizontal([antes], [depois])).toThrow("LEGENDA_DESLOCOU");
  conferirRecorteHorizontal(antes, 17, 303);
  for (const fragmento of fimR02) conferirRecorteHorizontal(fragmento, 17, 303);
  // O fragmento permanece cortado mesmo que se mantenha estável nos dois quadros.
  conferirEstabilidadeHorizontal([depois], [depois]);
  expect(() => conferirRecorteHorizontal(depois, 17, 303)).toThrow("LEGENDA_CORTADA_ESQUERDA");
  expect(() => conferirRecorteHorizontal({ left: 33, right: 305 }, 17, 303)).toThrow(
    "LEGENDA_CORTADA_DIREITA",
  );
});

it.each(["celular claro", "celular escuro", "desktop", "desktop claro"] as const)(
  "mantém toda a legenda da tabela legível: %s",
  async (caso) => {
    const movel = caso === "celular claro" || caso === "celular escuro";
    const opcoes: Opcoes = movel
      ? {
          ...celular,
          viewport: { width: 320, height: 844 },
          colorScheme: caso === "celular claro" ? ("light" as const) : ("dark" as const),
        }
      : { ...desktop, colorScheme: caso === "desktop claro" ? "light" : desktop.colorScheme };
    await comDiretor(opcoes, async (pagina, pedidos) => {
      const nome = "Ausência por aluno no período";
      const botao = painel(pagina).getByRole("button", { name: "Tabela", exact: true });
      await botao.click();
      const regiao = painel(pagina).getByRole("region", {
        name: "Rolagem da tabela de ausência por aluno",
      });
      const tabela = regiao.getByRole("table", { name: nome, exact: true });
      const legenda = painel(pagina).getByText(nome, { exact: true });
      const nota = painel(pagina).getByText(/^Ausência conta faltas e faltas justificadas/);
      const aluno = tabela.getByRole("rowheader", { name: "Aluno Estrela", exact: true });
      await esperar(aluno).toBeVisible();
      await esperar(legenda).toHaveCount(1);
      await esperar(tabela).toHaveAccessibleName(nome);
      await esperar(nota).toBeVisible();
      expect(pedidos.map(({ metodo, caminho }) => [metodo, caminho])).toEqual([
        ["GET", rotaEstatisticas],
      ]);

      // Enquadra a última linha e a legenda sem alterar a posição horizontal.
      await nota.evaluate((el) => el.scrollIntoView({ block: "end" }));
      const rolavel = await regiao.elementHandle();
      const medir = () =>
        legenda.evaluate((el, regiao) => {
          const quadro = (no: Element) => {
            const { left, right, top, bottom } = no.getBoundingClientRect();
            return { left, right, top, bottom };
          };
          const tabela = regiao.querySelector("table");
          const linha = tabela?.querySelector("tbody tr:last-child");
          const fixa = linha?.querySelector("th");
          const ultima = linha?.querySelector("td:last-child");
          const barra = document.querySelector("header");
          if (!linha || !fixa || !ultima || !barra) throw new Error("Tabela incompleta");
          const range = document.createRange();
          range.selectNodeContents(el);
          const fragmentos = Array.from(range.getClientRects(), ({ left, right, top, bottom }) => ({
            left,
            right,
            top,
            bottom,
          }));
          const { left } = quadro(regiao);
          const borda = left + regiao.clientLeft;
          return {
            caixa: quadro(el),
            fragmentos,
            esquerda: borda,
            direita: borda + regiao.clientWidth,
            rolagem: regiao.scrollLeft,
            alcance: regiao.scrollWidth - regiao.clientWidth,
            excesso: document.documentElement.scrollWidth - innerWidth,
            altura: innerHeight,
            topoLivre: quadro(barra).bottom,
            linha: quadro(linha),
            fixa: quadro(fixa),
            ultima: quadro(ultima),
            percentual: ultima.textContent,
            contorno:
              regiao.matches(":focus-visible") && getComputedStyle(regiao).outlineStyle !== "none",
            y: scrollY,
          };
        }, rolavel);
      const inicio = await medir();
      expect(inicio.rolagem).toBe(0);
      if (movel) {
        expect(inicio.alcance).toBeGreaterThan(0);
        await pagina.keyboard.press("Tab");
        await esperar(regiao).toBeFocused();
        // As setas atuam no elemento focado, sem escrever scrollLeft pelo teste.
        for (let passo = 0; passo < 16; passo++) await pagina.keyboard.press("ArrowRight");
        await esperar.poll(async () => (await medir()).rolagem).toBe(inicio.alcance);
      } else expect(inicio.alcance).toBe(0);
      await nota.evaluate((el) => el.scrollIntoView({ block: "end" }));
      const fim = await medir();
      await emitirMetricas("legenda-tabela", { caso, inicio, fim });
      if (caso === "celular claro" && process.env.FIXTURE_CAPTURA_RODAPE) {
        await pagina.screenshot({
          path: process.env.FIXTURE_CAPTURA_RODAPE,
          animations: "disabled",
        });
      }
      expect(fim.excesso).toBe(0);
      expect(fim.percentual).toBe("0%");
      expect(Math.abs(fim.fixa.left - inicio.fixa.left)).toBeLessThanOrEqual(1);
      expect(fim.ultima.left).toBeGreaterThanOrEqual(fim.fixa.right - 1);
      expect(fim.ultima.right).toBeLessThanOrEqual(fim.direita + 1);
      if (movel) expect(fim.contorno).toBe(true);
      for (const medida of [inicio, fim]) {
        expect(medida.fragmentos.length).toBeGreaterThan(0);
        for (const fragmento of medida.fragmentos) {
          conferirRecorteHorizontal(fragmento, medida.esquerda, medida.direita);
          expect(fragmento.top).toBeGreaterThanOrEqual(
            Math.max(medida.linha.bottom - 1, medida.topoLivre),
          );
          expect(fragmento.bottom).toBeLessThanOrEqual(medida.altura);
        }
      }
      conferirEstabilidadeHorizontal(inicio.fragmentos, fim.fragmentos);
    });
  },
);

it("preserva a legenda padrão da tabela sem o ajuste de Minhas turmas", async () => {
  await comDiretor({ ...desktop, parametros: "?controle-legenda" }, async (pagina, pedidos) => {
    const tabela = pagina.getByRole("table", { name: "Legenda padrão da fixture", exact: true });
    await esperar(tabela).toHaveAccessibleName("Legenda padrão da fixture");
    const legenda = tabela.locator("caption");
    await esperar(legenda).toBeVisible();
    await esperar(legenda).toHaveCSS("caption-side", "bottom");
    await esperar(legenda).toHaveCSS("position", "static");
    await esperar(legenda).toHaveCSS("padding-inline-start", "16px");
    expect(await legenda.evaluate((el) => el.childElementCount)).toBe(0);
    expect(pedidos).toEqual([]);
  });
});

it("R02: nome inteiro e última coluna numérica ficam alcançáveis com todas as categorias", async () => {
  await comDiretor(
    {
      ...celular,
      viewport: { width: 320, height: 844 },
      resposta: async (url) => casosLongos(url, 60, true),
    },
    async (pagina) => {
      const botao = painel(pagina).getByRole("button", { name: "Tabela" });
      await botao.click();
      const regiao = painel(pagina).getByRole("region", {
        name: "Rolagem da tabela de ausência por aluno",
      });
      const tabela = regiao.getByRole("table", { name: "Ausência por aluno no período" });
      const longa = tabela.getByRole("rowheader", { name: nomesComColisao[3] });
      const linha = tabela
        .getByRole("row")
        .filter({ has: pagina.getByRole("rowheader", { name: /Lia Paula Costa/ }) });
      await esperar(linha.getByText("em risco", { exact: true })).toBeVisible();
      await esperar(tabela.getByRole("columnheader")).toHaveCount(7);
      const largura = await regiao.evaluate((el) => el.clientWidth);
      const colunaFixa = await caixa(longa);
      await emitirMetricas("coluna-longa", { largura, fixa: colunaFixa.width });
      expect(
        largura - colunaFixa.width,
        "faixa livre depois da coluna de identidade",
      ).toBeGreaterThanOrEqual(110);
      await pagina.keyboard.press("Tab");
      await esperar(regiao).toBeFocused();
      await pagina.keyboard.press("ArrowRight");
      await esperar.poll(() => regiao.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await pagina.keyboard.press("ArrowRight");
      const ultima = linha.getByRole("cell", { name: "100%", exact: true });
      await ultima.scrollIntoViewIfNeeded();
      await esperar
        .poll(
          () =>
            ultima.evaluate((el) => {
              const fixa = el.parentElement?.querySelector("th");
              const regiao = el.closest("[role='region']");
              const b = el.getBoundingClientRect();
              const a = fixa?.getBoundingClientRect();
              const r = regiao?.getBoundingClientRect();
              return Boolean(
                a &&
                r &&
                b.left >= a.right - 1 &&
                b.right <= r.right + 1 &&
                el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)),
              );
            }),
          "última célula disponível e sem sobreposição",
        )
        .toBe(true);
      expect((await caixa(longa)).x).toBeCloseTo(colunaFixa.x, 0);
      expect(await longa.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    },
  );
});

it("R02: o traço do limite é visível sobre o fundo e a barra de risco", async () => {
  for (const colorScheme of ["light", "dark"] as const) {
    await comDiretor({ ...desktop, colorScheme }, async (pagina) => {
      const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
      const barras = grafico.locator(`.${barClasses.element}`);
      await esperar(barras).toHaveCount(5);
      const barra = barras.first();
      const tracos = grafico.locator(`.${referenceLineClasses.line}`);
      const preenchimento = await barra.evaluate((el) => getComputedStyle(el).fill);
      const area = await caixa(barra);
      const x = (await caixa(tracos.first())).x;
      expect(x).toBeGreaterThan(area.x);
      expect(x).toBeLessThan(area.x + area.width);
      const medidas = await Promise.all(
        (await tracos.all()).map((traco) => contraste(traco, "stroke", preenchimento)),
      );
      const svg = grafico.locator("svg");
      await svg.scrollIntoViewIfNeeded();
      const moldura = await caixa(svg);
      const primeira = await caixa(barra);
      const ultimaPintada = await caixa(barras.nth(2));
      const faixaVazia = { y: ultimaPintada.y + ultimaPintada.height + 4, height: 20 };
      expect(faixaVazia.y + faixaVazia.height).toBeLessThan(moldura.y + moldura.height);
      const centro = (await caixa(tracos.first())).x;
      const png = await svg.screenshot({ animations: "disabled", scale: "css" });
      const pixels = await pagina.evaluate(
        async ({ png, x, faixas }) => {
          const img = new Image();
          img.src = `data:image/png;base64,${png}`;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("Canvas indisponível");
          ctx.drawImage(img, 0, 0);
          const pixel = (px: number, py: number) => {
            const d = ctx.getImageData(px, py, 1, 1).data;
            const q = (i: number) => {
              const v = (d[i] ?? 0) / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            };
            return q(0) * 0.2126 + q(1) * 0.7152 + q(2) * 0.0722;
          };
          return faixas.map((faixa) => {
            const razoes = [];
            for (let y = Math.ceil(faixa.topo) + 3; y < Math.floor(faixa.fim) - 3; y++) {
              const fundo = pixel(x - 8, y);
              const traco = Array.from({ length: 5 }, (_, i) => pixel(x + i - 2, y));
              razoes.push(
                Math.max(
                  ...traco.map((q) => (Math.max(q, fundo) + 0.05) / (Math.min(q, fundo) + 0.05)),
                ),
              );
            }
            return {
              contraste: Math.max(...razoes),
              linhasContrastantes: razoes.filter((r) => r >= 3).length,
              // A grade pode continuar visível por baixo dos intervalos do tracejado.
              linhasSemTracoContrastante: razoes.filter((r) => r < 3).length,
            };
          });
        },
        {
          png: png.toString("base64"),
          x: Math.floor(centro - moldura.x),
          faixas: [primeira, faixaVazia].map((b) => ({
            topo: b.y - moldura.y,
            fim: b.y + b.height - moldura.y,
          })),
        },
      );
      await emitirMetricas("contraste-limiar", { colorScheme, medidas, pixels });
      for (const p of pixels) {
        expect(p.linhasContrastantes, "amostra do traço pintado").toBeGreaterThan(1);
        expect(p.linhasSemTracoContrastante, "lacunas do tracejado pintado").toBeGreaterThan(1);
      }
      expect(
        Math.max(...medidas.map((m) => m.interno)),
        "contraste na barra cruzada",
      ).toBeGreaterThanOrEqual(3);
      expect(
        Math.max(...medidas.map((m) => m.externo)),
        "contraste no fundo",
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

function barreira() {
  let abrir: () => void = () => {
    throw new Error("Barreira indisponível");
  };
  const espera = new Promise<void>((resolver) => {
    abrir = () => resolver();
  });
  return { espera, abrir };
}

it("R02: ao trocar o mês oculta o resultado anterior e distingue A, B e novo A", async () => {
  const outubro = barreira();
  const novoA = barreira();
  let pedidosA = 0;
  await comDiretor(
    {
      ...celular,
      resposta: async (url) => {
        if (url.searchParams.get("ate") === "2026-10-31") {
          await outubro.espera;
          return 503;
        }
        if (++pedidosA === 1) return estatisticas(url);
        await novoA.espera;
        const dados = estatisticas(url);
        if (dados.estatisticas) dados.estatisticas.resumo.taxa = 0.75;
        return dados;
      },
    },
    async (pagina, pedidos) => {
      const resumo = painel(pagina).getByRole("group", { name: "Resumo do período" });
      try {
        await esperarResumo(pagina);
        await esperar(resumo.getByText("50%", { exact: true })).toBeVisible();
        await painel(pagina).getByRole("button", { name: "Mês anterior" }).tap();
        await esperar.poll(() => pedidos.length).toBe(2);
        const antigoEmB = await resumo.isVisible();
        await painel(pagina).getByRole("button", { name: "Mês seguinte" }).tap();
        await esperar.poll(() => pedidos.length).toBe(3);
        const antigoEmNovoA = await resumo.isVisible();
        await emitirMetricas("geracoes-do-mes", { antigoEmB, antigoEmNovoA });
        expect(
          [antigoEmB, antigoEmNovoA],
          "resultado anterior exposto durante outro pedido",
        ).toEqual([false, false]);
        await esperar(painel(pagina).getByText("Carregando estatísticas")).toBeVisible();
        const b = pagina.waitForResponse((r) => r.status() === 503);
        outubro.abrir();
        await (await b).finished();
        novoA.abrir();
        await esperar(resumo.getByText("75%", { exact: true })).toBeVisible();
        await esperar(
          painel(pagina).getByText("Não foi possível carregar as estatísticas."),
        ).toHaveCount(0);
      } finally {
        outubro.abrir();
        novoA.abrir();
      }
    },
  );
});

it("acomoda nome longo no cabeçalho ao cruzar de 599 para 600 px", async () => {
  await comDiretor(
    { viewport: { width: 599, height: 900 }, parametros: "?longo" },
    async (pagina) => {
      await esperarResumo(pagina);
      for (const largura of [599, 600, 599]) {
        await pagina.setViewportSize({ width: largura, height: 900 });
        const topo = cabecalho(pagina);
        const identidade = topo.getByText(/Acompanhamento.*Diretor de turma/);
        await esperar(identidade).toBeVisible();
        const medidas = await medirCabecalho(pagina);
        expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
        for (const alvo of medidas.acoes) {
          expect(alvo.width).toBeGreaterThanOrEqual(48);
          expect(alvo.height).toBeGreaterThanOrEqual(48);
          expect(alvo.x).toBeGreaterThanOrEqual(0);
          expect(alvo.x + alvo.width).toBeLessThanOrEqual(largura);
        }
        const papel = await identidade.evaluate((el) => el.scrollWidth <= el.clientWidth);
        expect(papel).toBe(true);
      }
    },
  );
});

it("mantém rótulo e valores externos legíveis nos limites de 1% e 100% a 320 px", async () => {
  for (const limite of [1, 100]) {
    await comDiretor(
      {
        ...celular,
        viewport: { width: 320, height: 844 },
        resposta: async (url) => casosLongos(url, limite),
      },
      async (pagina) => {
        const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
        await esperar(grafico.locator(`.${barClasses.element}`)).toHaveCount(5);
        const svg = await caixa(grafico.locator("svg"));
        const rotulo = await caixa(grafico.getByText(`limite ${limite}%`, { exact: true }));
        expect(rotulo.width).toBeGreaterThan(0);
        expect(rotulo.x).toBeGreaterThanOrEqual(svg.x - 0.5);
        expect(rotulo.x + rotulo.width).toBeLessThanOrEqual(svg.x + svg.width + 0.5);
        const dados = grafico.getByText("100%", { exact: true });
        await esperar(dados.first()).toBeVisible();
        const vizinhos = await grafico
          .locator("svg text")
          .evaluateAll(
            (els, texto) =>
              els
                .filter((el) => el.textContent !== texto && el.getBoundingClientRect().width > 0)
                .map((el) => el.getBoundingClientRect().toJSON()),
            `limite ${limite}%`,
          );
        expect(
          vizinhos.filter(
            (b) =>
              rotulo.x < b.right &&
              rotulo.x + rotulo.width > b.left &&
              rotulo.y < b.bottom &&
              rotulo.y + rotulo.height > b.top,
          ),
        ).toHaveLength(0);
      },
    );
  }
});

it.skipIf(usaWebKit)("distingue seleção, foco de teclado e traço em cores forçadas", async () => {
  await comDiretor({ ...desktop, forcedColors: "active" }, async (pagina) => {
    await esperarResumo(pagina);
    expect(await pagina.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const grupo = painel(pagina).getByRole("group", { name: "Turma", exact: true });
    const ativo = grupo.getByRole("button", { pressed: true });
    const inativo = grupo.getByRole("button", { pressed: false });
    const a = await ativo.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(a).toBe("2px");
    await ativo.click();
    await pagina.keyboard.press("Tab");
    await esperar(inativo).toBeFocused();
    const foco = await inativo.evaluate((el) => {
      const estilo = getComputedStyle(el);
      const amostra = document.createElement("span");
      amostra.style.color = "Highlight";
      amostra.style.forcedColorAdjust = "none";
      document.body.append(amostra);
      const cor = getComputedStyle(amostra).color;
      amostra.remove();
      return {
        visivel: el.matches(":focus-visible"),
        largura: estilo.outlineWidth,
        estilo: estilo.outlineStyle,
        sistema: estilo.outlineColor === cor,
        borda: estilo.borderTopWidth,
      };
    });
    expect(foco).toEqual({
      visivel: true,
      largura: "3px",
      estilo: "solid",
      sistema: true,
      borda: "1px",
    });
    const grafico = painel(pagina).getByRole("img", { name: /^Ausência por aluno\./ });
    const tracos = grafico.locator(`.${referenceLineClasses.line}`);
    await esperar(grafico.getByText("limite 60%", { exact: true })).toBeVisible();
    const linhas = await tracos.evaluateAll((els) =>
      els.map((el) => ({
        stroke: getComputedStyle(el).stroke,
        dash: getComputedStyle(el).strokeDasharray,
      })),
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.stroke).not.toBe(linhas[1]?.stroke);
    expect(linhas.every((l) => l.dash !== "none")).toBe(true);
  });
});

it("mantém o gráfico semanal empilhado com cinco semanas e dica", async () => {
  await comDiretor(
    {
      ...desktop,
      resposta: async (url) => {
        const dados = casosLongos(url, 60, true);
        if (dados.estatisticas)
          dados.estatisticas.semanas = ["02", "09", "16", "23", "30"].map((d, i) => ({
            inicio: `2026-11-${d}`,
            ausencias: i + 2,
            alunoDias: 10,
            faltas: i + 1,
            justificadas: 1,
            taxa: (i + 2) / 10,
          }));
        return dados;
      },
    },
    async (pagina) => {
      const titulo = painel(pagina).getByRole("heading", { name: "Ausência da turma por semana" });
      await titulo.scrollIntoViewIfNeeded();
      const grafico = painel(pagina).getByRole("img", { name: /de 02\/11 a 30\/11.*empilhadas/ });
      const barras = grafico.locator(`.${barClasses.element}`);
      await esperar(barras).toHaveCount(10);
      expect(
        await barras.evaluateAll(
          (els) => new Set(els.map((el) => el.getBoundingClientRect().x)).size,
        ),
      ).toBe(5);
      await esperar(grafico.getByText("30/11", { exact: true })).toBeVisible();
      await barras.first().hover();
      await esperar(
        pagina.getByRole("tooltip").getByText("Semana de 02/11", { exact: true }),
      ).toBeVisible();
      await esperar(pagina.getByRole("tooltip").getByText("1 dia", { exact: true })).toHaveCount(2);
    },
  );
});

it("mostra carregamento inicial, erro e recuperação sem números pendentes", async () => {
  const primeira = barreira();
  let quantidade = 0;
  await comDiretor(
    {
      ...celular,
      resposta: async (url) => {
        if (++quantidade !== 1) return estatisticas(url);
        await primeira.espera;
        return 503;
      },
    },
    async (pagina, pedidos) => {
      const resumo = painel(pagina).getByRole("group", { name: "Resumo do período" });
      try {
        await esperar.poll(() => pedidos.length).toBe(1);
        await esperar(painel(pagina).getByText("Carregando estatísticas")).toBeVisible();
        await esperar(resumo).toHaveCount(0);
        primeira.abrir();
        await esperar(
          painel(pagina).getByText("Não foi possível carregar as estatísticas."),
        ).toBeVisible();
        await esperar(resumo).toHaveCount(0);
        await cabecalho(pagina).getByRole("button", { name: "Atualizar tela" }).tap();
        await esperarResumo(pagina);
        await esperar(resumo.getByText("50%", { exact: true })).toBeVisible();
        await esperar(
          painel(pagina).getByText("Não foi possível carregar as estatísticas."),
        ).toHaveCount(0);
      } finally {
        primeira.abrir();
      }
    },
  );
});

it("distingue duas leituras em voo do mesmo filtro e preserva refresh do filtro atual", async () => {
  const antiga = barreira();
  const atualizacao = barreira();
  let pedidosA = 0;
  await comDiretor(
    {
      ...celular,
      resposta: async (url) => {
        if (url.searchParams.get("turmaId") === "b") return estatisticas(url);
        const n = ++pedidosA;
        if (n === 1) await antiga.espera;
        if (n === 3) await atualizacao.espera;
        const dados = estatisticas(url);
        if (dados.estatisticas)
          dados.estatisticas.resumo.taxa = n === 1 ? 0.25 : n === 2 ? 0.75 : 0.9;
        return dados;
      },
    },
    async (pagina, pedidos) => {
      const resumo = painel(pagina).getByRole("group", { name: "Resumo do período" });
      try {
        await esperar.poll(() => pedidos.length).toBe(1);
        await painel(pagina).getByRole("button", { name: "Ano QA B" }).tap();
        await esperar(
          painel(pagina).getByRole("heading", { name: "Sem chamada no período" }),
        ).toBeVisible();
        await painel(pagina).getByRole("button", { name: "Ano QA A" }).tap();
        await esperar(resumo.getByText("75%", { exact: true })).toBeVisible();
        const rede = pagina.waitForResponse((resposta) => resposta.url().includes("turmaId=a"));
        antiga.abrir();
        expect(await (await rede).finished()).toBeNull();
        await cabecalho(pagina).getByRole("button", { name: "Atualizar tela" }).tap();
        await esperar.poll(() => pedidos.length).toBe(4);
        await esperar(resumo).toHaveAttribute("aria-busy", "true");
        await esperar(resumo.getByText("75%", { exact: true })).toBeVisible();
        atualizacao.abrir();
        await esperar(resumo.getByText("90%", { exact: true })).toBeVisible();
        await esperar(resumo.getByText("25%", { exact: true })).toHaveCount(0);
      } finally {
        antiga.abrir();
        atualizacao.abrir();
      }
    },
  );
});

it("informa ausência de vínculos sem fazer consulta de estatísticas", async () => {
  await comDiretor({ ...celular, parametros: "?sem-turmas" }, async (pagina, pedidos) => {
    await esperar(painel(pagina).getByRole("heading", { name: "Sem turmas hoje" })).toBeVisible();
    await esperar(painel(pagina).getByRole("group", { name: "Resumo do período" })).toHaveCount(0);
    expect(pedidos).toEqual([]);
  });
});
