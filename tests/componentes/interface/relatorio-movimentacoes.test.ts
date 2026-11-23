// Mede a primeira dobra e exercita os filtros do relatório real no navegador, sem banco.
import { readFile } from "node:fs/promises";
import {
  chromium,
  webkit,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { RelatorioMovimentacoes } from "@/domain/relatorio-movimentacoes";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

const hoje = "2026-11-23";
const ontem = "2026-11-22";
const rotaRelatorio = "/api/relatorios/movimentacoes";
const arquivo = "tests/componentes/interface/relatorio-movimentacoes.html";
const nomeAurora = "Estudante QA Aurora";
const nomeLongo = `Estudante ${"Aurora".repeat(15)}`;
const turmaHistoricaLonga = `Turma histórica ${"Acompanhamento".repeat(10)}`;
const motivoLongo = `Motivo ${"Transporte".repeat(16)}`;
const responsavelLongo = `Equipe ${"Secretaria".repeat(16)}`;
const nomesDosGrupos = ["Período do relatório", "Agrupamento do relatório"] as const;
const nomesDosBotoes = ["Dia", "Semana", "Período personalizado", "Por turma", "Por aluno"];

function relatorioSintetico(
  de: string,
  ate: string,
  turma: string | null,
  longo: boolean,
): RelatorioMovimentacoes {
  const aurora = { alunoId: "aurora", alunoNome: longo ? nomeLongo : nomeAurora, dia: hoje };
  const turmas: RelatorioMovimentacoes["turmas"] = [
    {
      turmaId: "a",
      turmaRotulo: longo ? turmaHistoricaLonga : "Ano QA A",
      saidas: 1,
      entradas: 1,
      total: 2,
      movimentacoes: [
        {
          ...aurora,
          id: "e1",
          tipo: "ENTRADA" as const,
          horario: "07:25",
          momento: "aula_1",
          motivo: longo ? motivoLongo : "Transporte fictício atrasado",
          responsavel: longo ? responsavelLongo : "Secretaria QA",
        },
        {
          ...aurora,
          id: "s1",
          tipo: "SAIDA" as const,
          horario: "10:15",
          momento: "aula_3",
          motivo: "Atendimento fictício agendado",
          responsavel: "Coordenação QA5D4",
        },
      ],
    },
    {
      turmaId: "b",
      turmaRotulo: "Ano QA B",
      saidas: 0,
      entradas: 1,
      total: 1,
      movimentacoes: [
        {
          id: "e2",
          tipo: "ENTRADA" as const,
          alunoId: "horizonte",
          alunoNome: "Estudante QA Horizonte",
          dia: hoje,
          horario: "08:05",
          momento: "aula_1",
          motivo: "Chegada fictícia após o sinal",
          responsavel: "Secretaria QA",
        },
      ],
    },
  ].filter((grupo) => (turma === null || turma === grupo.turmaId) && de <= hoje && ate >= hoje);
  const saidas = turmas.reduce((total, grupo) => total + grupo.saidas, 0);
  const entradas = turmas.reduce((total, grupo) => total + grupo.entradas, 0);
  return { de, ate, totais: { saidas, entradas, total: saidas + entradas }, turmas };
}

let navegador: Browser;
let servidor: ServidorFixture;
beforeAll(async () => {
  servidor = await criarServidorFixture(arquivo);
  navegador = await (process.env.FIXTURE_WEBKIT === "1" ? webkit : chromium).launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

interface Opcoes {
  largura: number;
  altura?: number;
  tema?: "light" | "dark";
  longo?: boolean;
  falharOntem?: boolean;
  coresForcadas?: "none" | "active";
}

async function comRelatorio(
  {
    largura,
    altura = 844,
    tema = "light",
    longo = false,
    falharOntem = false,
    coresForcadas,
  }: Opcoes,
  testar: (pagina: Page, relatorio: Locator, pedidos: string[]) => Promise<void>,
) {
  const pagina = await navegador.newPage({
    viewport: { width: largura, height: altura },
    deviceScaleFactor: 1,
    colorScheme: tema,
    reducedMotion: "reduce",
    forcedColors: coresForcadas,
    timezoneId: "America/Fortaleza",
    hasTouch: largura < 600,
    serviceWorkers: "block",
  });
  const erros: string[] = [];
  const pedidos: string[] = [];
  const base = new URL(servidor.url);
  const endereco = new URL(servidor.url);
  if (longo) endereco.searchParams.set("longo", "1");
  let induzirFalha = falharOntem;
  await pagina.addInitScript(() => {
    // NextLink é importado pela primitiva de botão mesmo sem links nesta fixture.
    Object.defineProperty(globalThis, "process", { value: { env: { NODE_ENV: "development" } } });
  });
  pagina.on("pageerror", (erro) => erros.push(`${erro.name}: ${erro.message}`));
  pagina.on("response", (resposta) => {
    const caminho = new URL(resposta.url()).pathname;
    if (resposta.status() >= 400 && caminho !== rotaRelatorio)
      erros.push(`${resposta.status()} ${caminho}`);
  });
  await pagina.route("**/*", (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    if (pedido.method() !== "GET" || url.origin !== base.origin) {
      erros.push("Requisição não permitida na fixture");
      return rota.abort();
    }
    if (url.pathname === rotaRelatorio) {
      const de = url.searchParams.get("de");
      const ate = url.searchParams.get("ate");
      if (de === null || ate === null) {
        erros.push("Consulta sem período");
        return rota.abort();
      }
      pedidos.push(url.search);
      if (induzirFalha && de === ontem && ate === ontem) {
        induzirFalha = false;
        return rota.fulfill({ status: 503, json: { error: "Indisponibilidade sintética." } });
      }
      return rota.fulfill({
        json: relatorioSintetico(de, ate, url.searchParams.get("turmaId"), longo),
      });
    }
    if (url.pathname.startsWith("/api/")) {
      erros.push("API fora do relatório");
      return rota.abort();
    }
    return rota.continue();
  });
  try {
    await pagina.goto(endereco.href);
    const relatorio = pagina.getByRole("region", { name: "Relatório de saídas e entradas" });
    try {
      await esperar(relatorio.getByRole("heading", { name: "Saídas e Entradas" })).toBeVisible();
      await esperar(relatorio.getByRole("listitem")).toHaveCount(3);
    } catch (erro) {
      throw new Error(`A fixture não montou o relatório populado: ${erros.join("; ")}`, {
        cause: erro,
      });
    }
    await esperar(pagina.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
    const fonte = process.env.FIXTURE_FONTE_JAKARTA;
    if (fonte) {
      const dados = (await readFile(fonte)).toString("base64");
      await pagina.addStyleTag({
        content: `@font-face { font-family: 'Plus Jakarta Sans'; src: url(data:font/woff2;base64,${dados}) format('woff2'); font-weight: 200 800; }`,
      });
      expect(
        await pagina.evaluate(
          async () => (await document.fonts.load('500 14px "Plus Jakarta Sans"')).length,
        ),
      ).toBe(1);
    }
    await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
    await testar(pagina, relatorio, pedidos);
  } finally {
    await pagina.close();
    expect(erros).toEqual([]);
  }
}

function botao(relatorio: Locator, name: string | RegExp) {
  return relatorio.getByRole("button", { name, exact: typeof name === "string" });
}

function totais(relatorio: Locator) {
  return relatorio.locator('dl[aria-label="Totais de movimentações"]').locator("dd");
}

it.each([
  { id: "M01", largura: 390, altura: 844, tema: "light", minimo: 1 },
  { id: "D01", largura: 1440, altura: 900, tema: "dark", minimo: 2 },
] as const)("mostra os primeiros registros inteiros na dobra em $id", async (opcoes) => {
  await comRelatorio(opcoes, async (_pagina, relatorio) => {
    await esperar(totais(relatorio)).toHaveText(["1", "2"]);
    const primeiraTurma = relatorio.getByRole("region", { name: "Turma Ano QA A", exact: true });
    await esperar(primeiraTurma.getByRole("listitem").first()).toContainText("Secretaria QA");
    const medidas = await relatorio.evaluate((area) => {
      const painel = area.getBoundingClientRect();
      const itens = [...area.querySelectorAll("li")].map((item) => {
        const caixa = item.getBoundingClientRect();
        return {
          topo: caixa.top,
          base: caixa.bottom,
          altura: caixa.height,
          relativo: caixa.top - painel.top,
        };
      });
      return {
        painel: { topo: painel.top, largura: painel.width },
        itens,
        dobra: innerHeight,
        rolagem: scrollY,
        excesso: document.documentElement.scrollWidth - innerWidth,
        completas: itens.filter((item) => item.topo >= 0 && item.base <= innerHeight).length,
      };
    });
    expect(medidas.rolagem).toBe(0);
    expect(medidas.excesso).toBe(0);
    expect(medidas.completas, `PRIMEIRA_DOBRA ${JSON.stringify(medidas)}`).toBeGreaterThanOrEqual(
      opcoes.minimo,
    );
    process.stdout.write(`${opcoes.id} ${navegador.version()} ${JSON.stringify(medidas)}\n`);
  });
});

it.each([390, 1440])("preserva a disposição legível dos dois grupos em %i px", async (largura) => {
  await comRelatorio({ largura }, async (_pagina, relatorio) => {
    for (const nome of nomesDosGrupos)
      await esperar(relatorio.getByRole("group", { name: nome })).toBeVisible();
    const geometria = await relatorio.evaluate((area) => {
      const grupos = [...area.querySelectorAll('[role="group"]')].map((grupo) => {
        const { x, y, right, bottom } = grupo.getBoundingClientRect();
        const botoes = [...grupo.querySelectorAll("button")].map((botao) => {
          const { width, height } = botao.getBoundingClientRect();
          return [width, height];
        });
        return { x, y, right, bottom, botoes };
      });
      return { grupos, excesso: document.documentElement.scrollWidth - innerWidth };
    });
    const [periodo, agrupamento] = geometria.grupos;
    if (!periodo || !agrupamento)
      throw new Error("Dois grupos de comandos visíveis são necessários");
    expect([periodo.botoes.length, agrupamento.botoes.length]).toEqual([3, 2]);
    expect(geometria.excesso).toBe(0);
    const problemas: string[] = [];
    if (
      largura === 1440 &&
      (Math.abs(agrupamento.y - periodo.y) > 1 || agrupamento.x - periodo.right < 8)
    )
      problemas.push("grupos em faixas diferentes ou sem folga lateral");
    if (largura === 390 && agrupamento.y - periodo.bottom < 8)
      problemas.push("grupos estreitos sem folga vertical");
    expect(problemas, `FAIXA_DE_COMANDOS ${JSON.stringify(geometria)}`).toEqual([]);
    process.stdout.write(`FAIXA ${largura} ${JSON.stringify(geometria)}\n`);
  });
});

it("mantém caixas médias e alvos táteis de 48 px sem roubar o toque na quebra", async () => {
  await comRelatorio({ largura: 320 }, async (pagina, relatorio) => {
    const periodo = relatorio.getByRole("group", { name: nomesDosGrupos[0] });
    const dia = await botao(periodo, "Dia").boundingBox();
    const personalizado = await botao(periodo, "Período personalizado").boundingBox();
    expect(dia).not.toBeNull();
    expect(personalizado?.y).toBeGreaterThan(dia?.y ?? Infinity);

    const medidas = await Promise.all(
      nomesDosBotoes.map((nome) =>
        botao(relatorio, nome).evaluate((no) => {
          const caixa = no.getBoundingClientRect();
          const alvo = getComputedStyle(no, "::after");
          const x = caixa.left + caixa.width / 2;
          const y = caixa.top - 3;
          const atinge = (altura: number) =>
            document.elementFromPoint(x, altura)?.closest("button") === no;
          return {
            altura: caixa.height,
            larguraAlvo: parseFloat(alvo.width),
            alturaAlvo: parseFloat(alvo.height),
            acertaAmbasBordas: atinge(y) && atinge(caixa.bottom + 3),
            deixaDeAcertarFora: !atinge(caixa.top - 5) && !atinge(caixa.bottom + 5),
            x,
            y,
          };
        }),
      ),
    );
    expect(
      medidas.map(({ altura }) => altura),
      "CAIXA_VISUAL_MEDIA",
    ).toEqual([40, 40, 40, 40, 40]);
    for (const medida of medidas) {
      expect(medida.larguraAlvo).toBeGreaterThanOrEqual(48);
      expect(medida.alturaAlvo).toBe(48);
      expect(medida.acertaAmbasBordas).toBe(true);
      expect(medida.deixaDeAcertarFora).toBe(true);
    }
    const ponto = medidas[2];
    if (!ponto) throw new Error("Alvo do período personalizado ausente");
    await esperar(botao(relatorio, "Dia")).toHaveAttribute("aria-pressed", "true");
    await esperar(botao(relatorio, "Período personalizado")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await pagina.touchscreen.tap(ponto.x, ponto.y);
    await esperar(botao(relatorio, "Período personalizado")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await esperar(botao(relatorio, "Dia")).toHaveAttribute("aria-pressed", "false");
    await esperar(botao(relatorio, "Semana")).toHaveAttribute("aria-pressed", "false");
    await esperar(botao(relatorio, "Por turma")).toHaveAttribute("aria-pressed", "true");
    for (const nome of [/^Data inicial do relatório:/, /^Data final do relatório:/]) {
      const campo = botao(relatorio, nome);
      await campo.scrollIntoViewIfNeeded();
      await esperar(campo).toBeInViewport({ ratio: 1 });
    }
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    process.stdout.write(`ALVOS ${JSON.stringify(medidas)}\n`);
  });
});

it("compõe os dois pares de totais em uma faixa sem grade própria", async () => {
  await comRelatorio({ largura: 320 }, async (_pagina, relatorio) => {
    const faixa = relatorio.locator('dl[aria-label="Totais de movimentações"]');
    await esperar(faixa.locator("dt")).toHaveText(["Saídas", "Entradas"]);
    await esperar(totais(relatorio)).toHaveText(["1", "2"]);
    const medidas = await faixa.evaluate((lista) => {
      const [saidas, entradas] = [...lista.children].map((par) => par.getBoundingClientRect());
      if (!saidas || !entradas) throw new Error("Dois pares de totais são necessários");
      return {
        display: getComputedStyle(lista).display,
        folga: entradas.left - saidas.right,
        topo: entradas.top - saidas.top,
        excesso: lista.scrollWidth - lista.clientWidth,
      };
    });
    expect(medidas.display, "TOTAIS_SEM_GRADE_PROPRIA").not.toContain("grid");
    expect(medidas.folga).toBeGreaterThanOrEqual(8);
    expect(medidas.topo).toBe(0);
    expect(medidas.excesso).toBe(0);
    process.stdout.write(`TOTAIS ${JSON.stringify(medidas)}\n`);
  });
});

it("preserva o padding padrão nos cartões dos filtros e dos totais", async () => {
  await comRelatorio({ largura: 390 }, async (_pagina, relatorio) => {
    const filtros = botao(relatorio, /^Data do relatório:/).locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' MuiCard-root ')][1]",
    );
    const faixa = relatorio.locator('dl[aria-label="Totais de movimentações"]');
    for (const cartao of [filtros, faixa]) await esperar(cartao).toBeVisible();
    const medidas = await Promise.all(
      [filtros, faixa].map((cartao) =>
        cartao.evaluate((no) => {
          const css = getComputedStyle(no);
          return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft];
        }),
      ),
    );
    expect(medidas, "PADDING_PADRAO_DOS_CARTOES").toEqual([
      ["16px", "16px", "16px", "16px"],
      ["16px", "16px", "16px", "16px"],
    ]);
    process.stdout.write(`PADDING ${JSON.stringify(medidas)}\n`);
  });
});

it("preserva os 16 px entre resultados e antes do rodapé", async () => {
  await comRelatorio({ largura: 390 }, async (_pagina, relatorio) => {
    const partes = [
      relatorio.getByRole("region", { name: "Turma Ano QA A", exact: true }),
      relatorio.getByRole("region", { name: "Turma Ano QA B", exact: true }),
      relatorio.getByText(/^Entradas e saídas agrupadas pela turma gravada/),
    ];
    const caixas = await Promise.all(partes.map((parte) => parte.boundingBox()));
    const [primeiro, segundo, rodape] = caixas;
    if (!primeiro || !segundo || !rodape) throw new Error("Resultados ou rodapé ausentes");
    const gaps = [segundo.y - primeiro.y - primeiro.height, rodape.y - segundo.y - segundo.height];
    expect(gaps, "GAPS_ORIGINAIS_DOS_RESULTADOS").toEqual([16, 16]);
    process.stdout.write(`GAPS ${JSON.stringify(gaps)}\n`);
  });
});

it("não recorta os textos históricos longos nem os campos em 320 px", async () => {
  await comRelatorio({ largura: 320, longo: true }, async (pagina, relatorio) => {
    for (const nome of nomesDosBotoes)
      await esperar(botao(relatorio, nome)).toBeInViewport({ ratio: 1 });
    const turma = relatorio.getByRole("region", {
      name: `Turma ${turmaHistoricaLonga}`,
      exact: true,
    });
    const linha = turma.getByRole("listitem").first();
    for (const [loc, texto] of [
      [turma, turmaHistoricaLonga],
      [linha, nomeLongo],
      [linha, motivoLongo],
      [linha, responsavelLongo],
      [linha, "07:25"],
      [linha, "1ª aula"],
      [linha, "23/11/2026"],
    ] as const) {
      const campo = loc.getByText(texto, { exact: true });
      await campo.scrollIntoViewIfNeeded();
      await esperar(campo).toBeInViewport({ ratio: 0.99 });
      expect(
        await campo.evaluate((no) => {
          const grupo = no.closest('section[aria-label^="Turma "]');
          if (!grupo) throw new Error("Turma histórica ausente");
          const caixa = grupo.getBoundingClientRect();
          const intervalo = document.createRange();
          intervalo.selectNodeContents(no);
          const trechos = [...intervalo.getClientRects()].filter(
            (r) => r.width > 0 && r.height > 0,
          );
          return (
            trechos.length > 0 &&
            trechos.every((r) => r.left >= caixa.left - 0.5 && r.right <= caixa.right + 0.5)
          );
        }),
      ).toBe(true);
    }
    const porAluno = botao(relatorio, "Por aluno");
    await porAluno.tap();
    await esperar(relatorio.getByRole("region", { name: `Aluno ${nomeLongo}` })).toBeVisible();
    for (const name of [
      "Turma do relatório de movimentações",
      "Aluno do relatório de movimentações",
      "Filtro de alunos do relatório",
    ]) {
      const campo = relatorio.getByRole("combobox", { name });
      await campo.scrollIntoViewIfNeeded();
      await esperar(campo).toBeInViewport({ ratio: 0.99 });
    }
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  });
});

it("preserva período próprio, ordem histórica e filtros do relatório", async () => {
  await comRelatorio({ largura: 390 }, async (pagina, relatorio, pedidos) => {
    const historica = relatorio.getByRole("region", { name: "Turma Ano QA A", exact: true });
    const linha = historica.getByRole("listitem");
    await esperar(linha.nth(0)).toContainText("07:25");
    await esperar(linha.nth(0)).toContainText("Responsável pelo registro");
    await esperar(linha.nth(1)).toContainText("10:15");
    await esperar(linha.nth(1)).toContainText("Liberado por");
    await esperar(totais(relatorio)).toHaveText(["1", "2"]);
    await esperar(botao(relatorio, "Próximo dia do relatório")).toBeDisabled();
    expect(pedidos).toEqual([`?de=${hoje}&ate=${hoje}`]);
    await botao(relatorio, "Por aluno").tap();
    const aurora = relatorio.getByRole("region", { name: `Aluno ${nomeAurora}`, exact: true });
    await esperar(aurora.getByRole("listitem").nth(0)).toContainText("10:15");
    await esperar(aurora.getByRole("listitem").nth(1)).toContainText("07:25");
    await esperar(aurora.getByText("Ano QA A", { exact: true })).toBeVisible();
    const aluno = relatorio.getByRole("combobox", { name: "Aluno do relatório de movimentações" });
    await aluno.fill("Horizonte");
    await pagina.getByRole("option", { name: "Estudante QA Horizonte · Ano QA B" }).click();
    await esperar(aurora).toHaveCount(0);
    await esperar(
      relatorio.getByRole("region", { name: "Aluno Estudante QA Horizonte" }),
    ).toBeVisible();
    await relatorio.getByRole("combobox", { name: "Filtro de alunos do relatório" }).tap();
    await pagina.getByRole("option", { name: "Duas ou mais no período" }).tap();
    await esperar(
      relatorio.getByText("Este aluno não tem saídas nem entradas neste período."),
    ).toBeVisible();
    await esperar(totais(relatorio)).toHaveText(["1", "2"]);
    expect(pedidos).toEqual([`?de=${hoje}&ate=${hoje}`]);
    await botao(relatorio, "Por turma").tap();
    await botao(relatorio, "Semana").tap();
    const periodo = relatorio
      .locator('[aria-live="polite"]')
      .filter({ hasText: "Semana até hoje" });
    await esperar(periodo).toHaveText("23/11/2026 · Semana até hoje");
    await botao(relatorio, "Semana anterior do relatório").tap();
    await esperar(relatorio.getByText("16/11/2026 a 22/11/2026 · Segunda a domingo")).toBeVisible();
    await esperar(totais(relatorio)).toHaveText(["0", "0"]);
    await botao(relatorio, "Período personalizado").tap();
    await botao(relatorio, /^Data inicial do relatório:/).tap();
    const calendario = pagina.getByRole("dialog", { name: "Data inicial do relatório" });
    await calendario.getByRole("button", { name: "22 de novembro de 2026", exact: true }).tap();
    await esperar(relatorio.getByText("22/11/2026 a 23/11/2026", { exact: true })).toBeVisible();
    await esperar(botao(relatorio, /^Data final do relatório:/)).toBeVisible();
    await esperar(totais(relatorio)).toHaveText(["1", "2"]);
    await relatorio.getByRole("combobox", { name: "Turma do relatório de movimentações" }).tap();
    await pagina.getByRole("option", { name: "Ano QA B", exact: true }).tap();
    await esperar(totais(relatorio)).toHaveText(["0", "1"]);
    await esperar(historica).toHaveCount(0);
    expect(pedidos).toEqual([
      `?de=${hoje}&ate=${hoje}`,
      "?de=2026-11-16&ate=2026-11-22",
      `?de=${hoje}&ate=${hoje}`,
      `?de=${ontem}&ate=${hoje}`,
      `?de=${ontem}&ate=${hoje}&turmaId=b`,
    ]);
  });
});

it("não mostra totais antigos após falha e distingue o vazio na nova tentativa", async () => {
  await comRelatorio({ largura: 390, falharOntem: true }, async (_pagina, relatorio, pedidos) => {
    await botao(relatorio, "Dia anterior do relatório").tap();
    await esperar(relatorio.getByText("Relatório indisponível")).toBeVisible();
    await esperar(totais(relatorio)).toHaveCount(0);
    await esperar(relatorio.getByRole("listitem")).toHaveCount(0);
    await botao(relatorio, "Tentar de novo").tap();
    await esperar(relatorio.getByText("Nenhuma saída ou entrada neste período.")).toBeVisible();
    await esperar(totais(relatorio)).toHaveText(["0", "0"]);
    expect(pedidos).toEqual([
      `?de=${hoje}&ate=${hoje}`,
      `?de=${ontem}&ate=${ontem}`,
      `?de=${ontem}&ate=${ontem}`,
    ]);
  });
});

it.runIf(process.env.FIXTURE_WEBKIT !== "1").each(["none", "active"] as const)(
  "mantém a ordem de Tab e foco sem recorte com ProvedorTema (forced-colors: %s)",
  async (coresForcadas) => {
    await comRelatorio({ largura: 320, coresForcadas }, async (pagina, relatorio) => {
      expect(await pagina.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(
        coresForcadas === "active",
      );
      for (const nome of [...nomesDosBotoes, "Dia anterior do relatório", /^Data do relatório:/]) {
        await pagina.keyboard.press("Tab");
        const controle = botao(relatorio, nome);
        await esperar(controle).toBeFocused();
        const anel = await controle.evaluate((no) => {
          const css = getComputedStyle(no);
          const caixa = no.getBoundingClientRect();
          const externo = parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset);
          const amostra = document.createElement("span");
          amostra.style.color = "Highlight";
          no.append(amostra);
          const destaque = getComputedStyle(amostra).color;
          amostra.remove();
          let folga =
            Math.min(caixa.left, innerWidth - caixa.right, caixa.top, innerHeight - caixa.bottom) -
            externo;
          for (let ancestral = no.parentElement; ancestral; ancestral = ancestral.parentElement) {
            const estilo = getComputedStyle(ancestral);
            const limites = ancestral.getBoundingClientRect();
            const x = limites.x + ancestral.clientLeft;
            const y = limites.y + ancestral.clientTop;
            if (estilo.overflowX !== "visible")
              folga = Math.min(
                folga,
                caixa.left - x - externo,
                x + ancestral.clientWidth - caixa.right - externo,
              );
            if (estilo.overflowY !== "visible")
              folga = Math.min(
                folga,
                caixa.top - y - externo,
                y + ancestral.clientHeight - caixa.bottom - externo,
              );
          }
          return {
            visivel: no.matches(":focus-visible"),
            estilo: css.outlineStyle,
            largura: css.outlineWidth,
            cor: css.outlineColor,
            destaque,
            folga,
          };
        });
        expect(anel).toMatchObject({ visivel: true, estilo: "solid", largura: "3px" });
        expect(anel.folga).toBeGreaterThanOrEqual(-0.5);
        if (coresForcadas === "active") expect(anel.cor).toBe(anel.destaque);
      }
      await esperar(pagina.locator("html")).toHaveAttribute("data-foco-teclado", "true");
      await pagina.keyboard.press("Enter");
      const dialogo = pagina.getByRole("dialog", { name: "Data do relatório" });
      await esperar(dialogo).toBeVisible();
      await pagina.keyboard.press("Escape");
      await esperar(dialogo).toHaveCount(0);
      await esperar(botao(relatorio, /^Data do relatório:/)).toBeFocused();
    });
  },
);
