// Verifica o Resumo real no navegador: composição, escopo, dados diários, ranking e estados.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chromium,
  webkit,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { outraSerie, turmaA, turmaB, turmaC } from "./resumo-relatorios-dados";

let navegador: Browser;
let servidor: ServidorFixture;
beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/resumo-relatorios.html");
  navegador = await (process.env.FIXTURE_WEBKIT === "1" ? webkit : chromium).launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

const nomeResumo = "Resumo dos relatórios";
const regioes = {
  turmas: "Infrequência por turma",
  series: "Infrequência por série",
  evolucao: "Evolução da infrequência",
  ranking: "Alunos com mais faltas",
};
const filtros = { serie: "Série do resumo", turma: "Turma do resumo", comparar: "Comparar por" };
const dias = "Ver dados diários";
const tabelaDiaria = "Infrequência por dia no mês selecionado";
const falhas = {
  todas: "Todas as faltas (F + FJ)",
  sem: "Sem justificativa (F)",
  justificadas: "Justificadas (FJ)",
};
const mesAtual = /^Mês do resumo: Nov\/2026/;

async function comResumo(
  width: number,
  colorScheme: "light" | "dark",
  cenario: string,
  testar: (pagina: Page, resumo: Locator) => Promise<void>,
) {
  const pagina = await navegador.newPage({
    viewport: { width, height: width < 600 ? 844 : 900 },
    colorScheme,
    reducedMotion: "reduce",
    timezoneId: "America/Fortaleza",
    hasTouch: width < 600,
    serviceWorkers: "block",
  });
  const erros: string[] = [];
  const origem = new URL(servidor.url).origin;
  pagina.on("pageerror", (erro) => erros.push(erro.name));
  await pagina.route("**/*", (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    if (url.origin === origem && pedido.method() === "GET" && !url.pathname.startsWith("/api/"))
      return rota.continue();
    erros.push("requisição fora da fixture");
    return rota.abort();
  });
  try {
    await pagina.goto(`${servidor.url}?${cenario}`);
    const resumo = pagina.getByRole("region", { name: nomeResumo, exact: true });
    await esperar(resumo).toBeVisible();
    await esperar(pagina.locator("html")).toHaveAttribute("data-mui-color-scheme", colorScheme);
    const fonteLocal = process.env.FIXTURE_FONTE_JAKARTA;
    if (fonteLocal) {
      const fonte = (await readFile(fonteLocal)).toString("base64");
      await pagina.addStyleTag({
        content: `@font-face { font-family: 'Plus Jakarta Sans'; src: url(data:font/woff2;base64,${fonte}) format('woff2'); font-weight: 200 800; }`,
      });
      expect(
        await pagina.evaluate(
          async () => (await document.fonts.load('500 14px "Plus Jakarta Sans"')).length,
        ),
      ).toBe(1);
    }
    await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
    await testar(pagina, resumo);
    expect(erros).toEqual([]);
  } finally {
    await pagina.close();
  }
}

async function medidas(resumo: Locator) {
  return resumo.evaluate((regiao) => {
    function ret(elemento: Element | undefined | null) {
      if (!elemento) throw new Error("Elemento de medida ausente");
      const { x, y, width, height, bottom } = elemento.getBoundingClientRect();
      return {
        x,
        y,
        width,
        height,
        bottom,
        fonte: parseFloat(getComputedStyle(elemento).fontSize),
      };
    }
    const valores = regiao.querySelectorAll("dd");
    const controle = (rotulo: string) => ret(regiao.querySelector(`[aria-label="${rotulo}"]`));
    return {
      painel: ret(regiao),
      primeiro: ret(valores[0]),
      taxa: ret(valores[3]),
      mes: ret(regiao.querySelector('button[aria-label^="Mês do resumo:"]')),
      serie: controle("Série do resumo"),
      turma: controle("Turma do resumo"),
      comparacao: controle("Infrequência por turma"),
      evolucao: controle("Evolução da infrequência"),
      ranking: controle("Alunos com mais faltas"),
      larguraPainel: regiao.clientWidth,
      excessoPainel: regiao.scrollWidth - regiao.clientWidth,
      excessoPagina: document.documentElement.scrollWidth - innerWidth,
      rolagem: scrollY,
      altura: innerHeight,
    };
  });
}

async function selecionar(pagina: Page, resumo: Locator, nome: string, opcao: string) {
  await resumo.getByRole("combobox", { name: nome, exact: true }).click();
  await pagina.getByRole("option", { name: opcao, exact: true }).click();
}

const dobras = [
  [390, "light"],
  [390, "dark"],
  [1440, "light"],
  [1440, "dark"],
] as const;

it.each(dobras)(
  "aproxima valores e distribui filtros e análise em %i px (%s)",
  async (largura, tema) => {
    await comResumo(largura, tema, "", async (pagina, resumo) => {
      await esperar(resumo.locator("dd")).toHaveText(["2", "1", "1", "18,2%"]);
      const comparacao = resumo.getByRole("region", { name: regioes.turmas });
      await esperar(comparacao.getByRole("listitem")).toHaveCount(2);
      await esperar(comparacao.getByText(turmaB.rotulo, { exact: true })).toBeVisible();
      const m = await medidas(resumo);
      const diretorio = process.env.FIXTURE_CAPTURAS;
      if (diretorio) {
        if (largura === 1440)
          await esperar(
            resumo.getByRole("img", { name: /Infrequência por dia/ }).locator("svg"),
          ).toBeVisible();
        const chave = `dobra-${largura}-${tema}`;
        process.stdout.write(`${JSON.stringify({ chave, motor: navegador.version(), ...m })}\n`);
        await pagina.screenshot({ path: join(diretorio, `${chave}.png`) });
      }
      expect(m.rolagem).toBe(0);
      expect(m.excessoPagina).toBe(0);
      expect(m.excessoPainel).toBe(0);
      // Tetos relativos ao início da vista, não ao shell simulado.
      expect
        .soft(m.primeiro.y - m.painel.y, "primeiro indicador mais próximo")
        .toBeLessThanOrEqual(largura === 390 ? 248 : 142);
      expect.soft(m.taxa.fonte, "taxa tem ênfase tipográfica").toBeGreaterThan(m.primeiro.fonte);
      expect.soft(m.serie.y, "Série e Turma na mesma linha").toBeCloseTo(m.turma.y, 0);
      if (largura === 390) {
        expect.soft(m.mes.bottom).toBeLessThan(m.serie.y);
        expect
          .soft(m.comparacao.bottom, "duas turmas completas na dobra")
          .toBeLessThanOrEqual(m.altura);
        expect.soft(m.evolucao.y).toBeGreaterThan(m.comparacao.bottom);
      } else {
        expect
          .soft(Math.abs(m.mes.y + m.mes.height / 2 - (m.serie.y + m.serie.height / 2)))
          .toBeLessThanOrEqual(2);
        expect.soft(m.evolucao.y).toBeCloseTo(m.comparacao.y, 0);
        expect
          .soft(m.evolucao.width, "mais largura para gráfico e tabela")
          .toBeGreaterThan(m.comparacao.width);
      }
    });
  },
);

it.each([320, 360, 904, 905])(
  "reflui sem cortar a data ou inverter a ordem dos filtros em %i px",
  async (largura) => {
    await comResumo(largura, "light", "", async (pagina, resumo) => {
      const m = await medidas(resumo);
      const mes = resumo.getByRole("button", { name: mesAtual });
      const serie = resumo.getByRole("combobox", { name: filtros.serie });
      const turma = resumo.getByRole("combobox", { name: filtros.turma });
      expect(m.excessoPagina).toBe(0);
      expect(m.excessoPainel).toBe(0);
      expect(
        await mes
          .getByText("Nov/2026", { exact: true })
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (largura === 320) expect(m.serie.bottom).toBeLessThan(m.turma.y);
      await mes.focus();
      await pagina.keyboard.press("Tab");
      await esperar(serie).toBeFocused(); // A seta seguinte, desabilitada no mês máximo, não recebe foco.
      await pagina.keyboard.press("Tab");
      await esperar(turma).toBeFocused();
    });
  },
);

it("preserva o nome completo em tela estreita, inclusive as opções de sufixo diferente", async () => {
  await comResumo(390, "light", "", async (pagina, resumo) => {
    const turma = resumo.getByRole("combobox", { name: filtros.turma });
    for (const [nome, rotulo] of [
      [filtros.serie, "Todas as séries"],
      [filtros.turma, "Todas as turmas"],
    ] as const) {
      const valor = resumo.getByRole("combobox", { name: nome }).getByText(rotulo, { exact: true });
      await esperar(valor).toBeVisible();
      expect(
        await valor.evaluate((el) => el.clientWidth > 0 && el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await turma.tap();
    const menu = pagina.getByRole("listbox");
    for (const item of [turmaA, turmaB]) {
      const opcao = menu.getByRole("option", { name: item.rotulo, exact: true });
      await esperar(opcao).toBeVisible();
      await esperar
        .poll(() =>
          opcao.evaluate((el) => {
            const r = new Range();
            r.selectNodeContents(el);
            const item = el.getBoundingClientRect();
            return [...r.getClientRects()].every(
              (texto) => texto.left >= item.left && texto.right <= item.right,
            );
          }),
        )
        .toBe(true);
    }
    await menu.getByRole("option", { name: turmaA.rotulo, exact: true }).tap();
    await esperar(turma).toBeFocused();
    await esperar(turma).toHaveAccessibleDescription(turmaA.rotulo);
    const area = await turma.evaluate((el) => {
      const texto = el.firstElementChild;
      const indicador = el.parentElement?.querySelector("svg");
      if (!texto || !indicador) return null;
      const r = new Range();
      r.selectNodeContents(texto);
      const caixa = texto.getBoundingClientRect();
      return {
        excesso: texto.scrollWidth - texto.clientWidth,
        fim: caixa.right,
        indicador: indicador.getBoundingClientRect().left,
        largura: caixa.width,
        linhas: new Set([...r.getClientRects()].map((rect) => rect.y)).size,
        reticencias: getComputedStyle(texto).textOverflow,
      };
    });
    expect(area).not.toBeNull();
    expect(area?.excesso).toBeGreaterThan(0);
    expect(area?.largura).toBeGreaterThan(0);
    expect(area?.fim).toBeLessThan(area?.indicador ?? 0);
    expect(area?.linhas).toBe(1);
    expect(area?.reticencias).toBe("ellipsis");
    await esperar(resumo.locator("dd")).toHaveText(["2", "1", "0", "33,3%"]);
  });
});

it("alterna comparação e escopo, encadeia série/turma e respeita o mês máximo", async () => {
  await comResumo(1440, "dark", "ampla", async (pagina, resumo) => {
    const turma = resumo.getByRole("combobox", { name: filtros.turma });
    await selecionar(pagina, resumo, filtros.turma, turmaA.rotulo);
    await esperar(resumo.locator("dd")).toHaveText(["2", "1", "0", "33,3%"]);
    await selecionar(pagina, resumo, filtros.serie, outraSerie.nome);
    await esperar(turma).toHaveText("Todas as turmas");
    await turma.click();
    const menu = pagina.getByRole("listbox");
    await esperar(menu.getByRole("option")).toHaveText(["Todas as turmas", turmaC.rotulo]);
    await menu.getByRole("option", { name: turmaC.rotulo }).click();
    await esperar(resumo.locator("dd")).toHaveText(["12", "0", "0", "100%"]);
    await esperar(
      resumo.getByRole("region", { name: regioes.turmas }).getByRole("listitem"),
    ).toContainText("12 faltas em 12 registros");
    await selecionar(pagina, resumo, filtros.serie, "Todas as séries");
    await selecionar(pagina, resumo, filtros.comparar, "Séries");
    const grupos = resumo.getByRole("region", { name: regioes.series }).getByRole("listitem");
    await esperar(grupos).toHaveCount(2);
    await esperar(grupos.nth(0)).toContainText("2 faltas em 11 registros");
    await esperar(grupos.nth(1)).toContainText("12 faltas em 12 registros");
    const anterior = resumo.getByRole("button", { name: "Mês anterior do resumo" });
    const seguinte = resumo.getByRole("button", { name: "Mês seguinte do resumo" });
    await esperar(seguinte).toBeDisabled();
    await anterior.click();
    await esperar(resumo.getByRole("button", { name: /^Mês do resumo: Out\/2026/ })).toBeVisible();
    await esperar(resumo.getByText(/Nenhuma chamada registrada/)).toBeVisible();
    await esperar(resumo.locator("dd")).toHaveText(["0", "0", "0", "Sem registro"]);
    await esperar(grupos).toHaveCount(0);
    await seguinte.click();
    await esperar(resumo.getByRole("button", { name: mesAtual })).toBeVisible();
    await esperar(seguinte).toBeDisabled();
    await esperar(grupos).toHaveCount(2);
  });
});

it("abre dados diários por teclado, com alvo amplo, foco e distinção entre nulo e zero", async () => {
  await comResumo(390, "dark", "", async (pagina, resumo) => {
    const evolucao = resumo.getByRole("region", { name: regioes.evolucao });
    const dados = evolucao.getByText(dias, { exact: true });
    const tabela = evolucao.getByRole("table", { name: tabelaDiaria });
    await evolucao.scrollIntoViewIfNeeded();
    const grafico = evolucao.getByRole("img", { name: /Infrequência por dia/ });
    await esperar(grafico.locator("svg")).toBeVisible();
    const plot = await grafico.locator("svg").boundingBox();
    expect(plot?.width).toBeGreaterThan(200);
    await esperar(tabela).toHaveCount(0);
    await dados.focus();
    await pagina.keyboard.press("Enter");
    await esperar(tabela.getByRole("columnheader")).toHaveText([
      "Dia",
      "F + FJ",
      "Registros",
      "Parciais",
      "Taxa",
    ]);
    await esperar(tabela.getByRole("row")).toHaveCount(24);
    for (const [dia, valores] of [
      ["01/11", ["0", "0", "0", "Sem registro"]],
      ["03/11", ["0", "5", "1", "0%"]],
      ["04/11", ["2", "6", "0", "33,3%"]],
    ] as const) {
      const linha = tabela
        .getByRole("row")
        .filter({ has: pagina.getByRole("rowheader", { name: dia, exact: true }) });
      await esperar(linha.getByRole("cell")).toHaveText([...valores]);
    }
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await esperar(dados).toBeFocused();
    expect
      .soft((await dados.boundingBox())?.height, "alvo do detalhe diário")
      .toBeGreaterThanOrEqual(44);
    await esperar(dados).toHaveCSS("outline-width", "3px");
    await pagina.keyboard.press("Space");
    await esperar(tabela).toHaveCount(0);
    await esperar(dados).toBeFocused();
  });
});

it("fixa apenas Dia durante a rolagem horizontal dos dados diários", async () => {
  await comResumo(320, "dark", "", async (pagina, resumo) => {
    const evolucao = resumo.getByRole("region", { name: regioes.evolucao });
    const dados = evolucao.getByText(dias, { exact: true });
    await dados.focus();
    await pagina.keyboard.press("Enter");
    const regiao = evolucao.getByRole("region", { name: "Dados diários da infrequência" });
    const tabela = regiao.getByRole("table", { name: tabelaDiaria });
    const cabecalhoDia = tabela.getByRole("columnheader", { name: "Dia", exact: true });
    await esperar(tabela.getByRole("columnheader")).toHaveText([
      "Dia",
      "F + FJ",
      "Registros",
      "Parciais",
      "Taxa",
    ]);
    await pagina.keyboard.press("Tab");
    await esperar(regiao).toBeFocused();
    await esperar(regiao).toHaveCSS("outline-width", "3px");
    await cabecalhoDia.scrollIntoViewIfNeeded();

    const medir = () =>
      regiao.evaluate((el) => {
        const tabela = el.querySelector("table");
        const cabecalho = tabela?.tHead?.rows[0];
        const linha = tabela?.tBodies[0]?.rows[0];
        const caixa = el.getBoundingClientRect();
        const limiteEsquerdo = caixa.left + el.clientLeft;
        const medirCelula = (celula: HTMLTableCellElement | undefined) => {
          if (!celula) throw new Error("Célula de medida ausente");
          const { left, top, width, height } = celula.getBoundingClientRect();
          return {
            x: left - limiteEsquerdo,
            largura: width,
            naFrente: celula.contains(
              document.elementFromPoint(left + width / 2, top + height / 2),
            ),
            fundo: getComputedStyle(celula).backgroundColor,
          };
        };
        return {
          diaCabecalho: medirCelula(cabecalho?.cells[0]),
          faltasCabecalho: medirCelula(cabecalho?.cells[1]),
          diaLinha: medirCelula(linha?.cells[0]),
          faltasLinha: medirCelula(linha?.cells[1]),
          taxaLinha: medirCelula(linha?.cells[4]),
          esquerda: el.scrollLeft,
          maximo: el.scrollWidth - el.clientWidth,
          paginaX: window.scrollX,
          excessoPagina: document.documentElement.scrollWidth - innerWidth,
        };
      });
    const antes = await medir();
    expect(antes.esquerda).toBe(0);
    expect(antes.maximo).toBeGreaterThan(antes.faltasLinha.x + 8);
    const caixa = await cabecalhoDia.boundingBox();
    if (!caixa) throw new Error("Cabeçalho Dia não está visível");
    await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await pagina.mouse.wheel(antes.maximo + 32, 0);
    await esperar
      .poll(() => regiao.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft))
      .toBeLessThanOrEqual(1);
    const depois = await medir();
    const deslocamento = depois.esquerda - antes.esquerda;
    if (process.env.FIXTURE_MEDIDAS === "1") {
      process.stdout.write(`${JSON.stringify({ motor: navegador.version(), antes, depois })}\n`);
    }

    expect.soft(depois.taxaLinha.naFrente, "Taxa alcançável no fim da rolagem").toBe(true);
    expect.soft(depois.paginaX).toBe(0);
    expect.soft(depois.excessoPagina).toBe(0);
    for (const alvo of ["diaCabecalho", "diaLinha"] as const) {
      expect
        .soft(Math.abs(depois[alvo].x), `${alvo} fica no limite interno`)
        .toBeLessThanOrEqual(1);
      expect.soft(depois[alvo].naFrente, `${alvo} não fica atrás dos dados`).toBe(true);
      expect.soft(depois[alvo].fundo).not.toBe("rgba(0, 0, 0, 0)");
    }
    for (const alvo of ["faltasCabecalho", "faltasLinha"] as const) {
      expect
        .soft(
          Math.abs(antes[alvo].x - depois[alvo].x - deslocamento),
          `${alvo} acompanha a rolagem`,
        )
        .toBeLessThanOrEqual(1);
    }
    await esperar(cabecalhoDia).toHaveAttribute("scope", "col");
    const dia = tabela.getByRole("rowheader", { name: "04/11", exact: true });
    await esperar(dia).toHaveAttribute("scope", "row");
    const linha = tabela.getByRole("row").filter({
      has: pagina.getByRole("rowheader", { name: "04/11", exact: true }),
    });
    await esperar(linha.getByRole("cell")).toHaveText(["2", "6", "0", "33,3%"]);
  });
});

it("mantém os três rankings, a ordem, a expansão e o foco por teclado", async () => {
  await comResumo(390, "light", "ampla", async (pagina, resumo) => {
    const ranking = resumo.getByRole("region", { name: regioes.ranking });
    const grupo = ranking.getByRole("group", { name: "Ranking de alunos" });
    const todos = grupo.getByRole("button", { name: falhas.todas });
    const sem = grupo.getByRole("button", { name: falhas.sem });
    const justificadas = grupo.getByRole("button", { name: falhas.justificadas });
    const alunos = ranking.getByRole("listitem");
    await esperar(todos).toHaveAttribute("aria-pressed", "true");
    await esperar(alunos).toHaveCount(10);
    await esperar(alunos.nth(0)).toContainText("Estudante A01");
    await esperar(alunos.nth(1)).toContainText("Estudante A02");
    const expandir = ranking.getByRole("button", { name: "Ver todos (14)" });
    expect
      .soft((await expandir.boundingBox())?.height, "alvo para expandir ranking")
      .toBeGreaterThanOrEqual(44);
    await expandir.tap();
    await esperar(alunos).toHaveCount(14);
    await esperar(alunos.last()).toContainText("Estudante C12");
    await esperar(ranking.getByRole("button", { name: "Mostrar 10 primeiros" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await todos.focus();
    await pagina.keyboard.press("Tab");
    await esperar(sem).toBeFocused();
    await pagina.keyboard.press("Space");
    await esperar(sem).toHaveAttribute("aria-pressed", "true");
    await esperar(todos).toHaveAttribute("aria-pressed", "false");
    await esperar(alunos).toHaveCount(10);
    await esperar(ranking.getByRole("button", { name: "Ver todos (13)" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await pagina.keyboard.press("Tab");
    await esperar(justificadas).toBeFocused();
    await pagina.keyboard.press("Enter");
    await esperar(justificadas).toHaveAttribute("aria-pressed", "true");
    await esperar(alunos).toHaveCount(1);
    await esperar(alunos.first()).toContainText("Estudante A02");
    await esperar(alunos.first()).toContainText("0 F · 1 FJ");
    for (const botao of [todos, sem, justificadas]) {
      expect
        .soft((await botao.boundingBox())?.height, "alvo do critério do ranking")
        .toBeGreaterThanOrEqual(44);
    }
    await esperar(justificadas).toHaveCSS("outline-width", "3px");
  });
});

it.each(["carregando", "erro", "bloqueado"])(
  "preserva o estado %s sem trocar o contrato dos controles",
  async (estado) => {
    await comResumo(390, "light", `estado=${estado}`, async (_pagina, resumo) => {
      const seletor = resumo.getByRole("button", { name: mesAtual });
      if (estado === "bloqueado" || estado === "carregando") {
        await esperar(seletor).toBeDisabled();
        await esperar(
          resumo.getByRole("button", { name: "Mês anterior do resumo" }),
        ).toBeDisabled();
      }
      await esperar(resumo).toHaveAttribute("aria-busy", String(estado === "carregando"));
      if (estado === "bloqueado") {
        await esperar(resumo.locator("dd")).toHaveText(["2", "1", "1", "18,2%"]);
      } else {
        await esperar(resumo.locator("dd")).toHaveCount(0);
        await esperar(resumo.getByText(/Nenhuma chamada registrada/)).toHaveCount(0);
        await esperar(resumo.getByRole("region", { name: regioes.evolucao })).toHaveCount(0);
        if (estado === "carregando")
          await esperar(resumo.getByRole("status")).toHaveText("Carregando resumo...");
        else
          await esperar(resumo.getByRole("alert")).toContainText(
            "Falha sintética na leitura do mês.",
          );
      }
    });
  },
);
