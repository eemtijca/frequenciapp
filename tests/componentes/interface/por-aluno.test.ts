// Exercita a composição real de Por aluno com tema, período e avisos, sem banco.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import {
  chromium,
  webkit,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import type PorAluno from "@/components/relatorios/por-aluno";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

const mes = "2026-11";
const serie = { id: "s1", nome: "Série de Acompanhamento Tabular", ordem: 1 };
const outraSerie = { id: "s2", nome: "Segunda série", ordem: 2 };
const nomeA = `Álvaro Sintético ${"X".repeat(78)}A`;
const nomeB = `Bia Sintética ${"X".repeat(78)}B`;
const rotuloA = `${serie.nome} TurmaSinteticaDeAcompanhamentoEscolarA`;
const rotuloB = `${serie.nome} TurmaSinteticaDeAcompanhamentoEscolarB`;
const rotuloC = "Segunda série C";
const aulas = ["aula-1", "aula-2"];
const massa = {
  series: [outraSerie, serie],
  turmas: [
    { id: "b", nome: "B", rotulo: rotuloB, serieId: serie.id, serieNome: serie.nome, horarios: [] },
    { id: "a", nome: "A", rotulo: rotuloA, serieId: serie.id, serieNome: serie.nome, horarios: [] },
    {
      id: "c",
      nome: "C",
      rotulo: rotuloC,
      serieId: outraSerie.id,
      serieNome: outraSerie.nome,
      horarios: [],
    },
  ],
  alunos: [
    { id: "c0", nome: "Davi Sintético", turmaId: "c", turmaOriginalId: "c", ordem: 0, ativo: true },
    { id: "a1", nome: nomeB, turmaId: "a", turmaOriginalId: "b", ordem: 1, ativo: true },
    { id: "a2", nome: "Caio Sintético", turmaId: "a", turmaOriginalId: "a", ordem: 2, ativo: true },
    { id: "a0", nome: nomeA, turmaId: "a", turmaOriginalId: "b", ordem: 0, ativo: true },
    {
      id: "b0",
      nome: "Elisa Sintética",
      turmaId: "b",
      turmaOriginalId: "b",
      ordem: 0,
      ativo: true,
    },
    {
      id: "a3",
      nome: "Álvaro Inativo",
      turmaId: "a",
      turmaOriginalId: "a",
      ordem: 3,
      ativo: false,
    },
  ],
  frequencias: [
    { dia: `${mes}-03`, faltas: [{ alunoId: "a0", horarios: ["aula-1"] }] },
    {
      dia: `${mes}-04`,
      faltas: [
        { alunoId: "a0", horarios: aulas, justificativa: "S" },
        { alunoId: "a1", horarios: aulas },
      ],
    },
    { dia: `${mes}-05`, faltas: [{ alunoId: "a0", horarios: aulas }] },
    { dia: `${mes}-06`, faltas: [] },
  ].map((chamada) => ({
    ...chamada,
    turmaId: "a",
    revisao: 1,
    atualizadoEm: `${chamada.dia}T15:00:00Z`,
    atualizadoPorNome: null,
    alunos: ["a0", "a1"],
    aulas,
  })),
  saidas: [
    {
      id: "s0",
      alunoId: "a0",
      dia: `${mes}-06`,
      momento: "aula_2",
      horario: null,
      justificativa: null,
      observacao: null,
      texto: "Motivo sintético",
      liberadoPorId: null,
      liberadoPorCodigo: null,
      liberadoPorNome: "Equipe sintética",
      criadoEm: `${mes}-06T15:00:00Z`,
    },
  ],
  resumo: {
    primeiroDia: "2026-10-02",
    diasLetivos: 24,
    porAluno: [{ alunoId: "a0", faltas: 7, faltasJustificadas: 4, diasComRegistro: 15 }],
  },
} satisfies Omit<ComponentProps<typeof PorAluno>, "mes" | "mesCorrente" | "onMes">;

let navegador: Browser;
let servidor: ServidorFixture;
const entrada = "/fixture-por-aluno.js";
const modulo = resolve(`.${entrada}`);
const entradaTemaReal = "/fixture-por-aluno-tema-real.js";
const moduloTemaReal = resolve(`.${entradaTemaReal}`);
beforeAll(async () => {
  servidor = await criarServidorFixture("por-aluno-fixture.html", [
    {
      name: "fixture-por-aluno",
      resolveId: (id: string) => {
        if (id === entrada) return modulo;
        if (id === entradaTemaReal) return moduloTemaReal;
        return null;
      },
      load: (id: string) => {
        if (id !== modulo && id !== moduloTemaReal) return null;
        const temaReal = id === moduloTemaReal;
        return `
      import { createElement as h, useState } from "react";
      import { createRoot } from "react-dom/client";
      import Box from "@mui/material/Box";
      import CssBaseline from "@mui/material/CssBaseline";
      import { ThemeProvider } from "@mui/material/styles";
      import PorAluno from "@/components/relatorios/por-aluno";
      import { ProvedorAvisos } from "@/components/ui/mui/avisos";
      import { tema } from "@/theme/tema";
      ${temaReal ? 'import { ProvedorTema } from "@/theme/provedor-tema";' : ""}
      const massa = ${JSON.stringify(temaReal ? { ...massa, series: [serie] } : massa)};
      function Fixture() {
        const [mes, onMes] = useState(${JSON.stringify(mes)});
        return ${temaReal ? "h(ProvedorTema, null," : "h(ThemeProvider, { theme: tema }, h(CssBaseline, { enableColorScheme: true }),"}
          h(Box, { component: "main", sx: { ml: { xs: 2, sm: 4, md: 38 }, mr: { xs: 2, sm: 4, md: 6 }, pt: { xs: 13, md: 16 } } },
            h(PorAluno, { ...massa, mes, onMes, mesCorrente: ${JSON.stringify(mes)},
              frequencias: mes === ${JSON.stringify(mes)} ? massa.frequencias : [],
              saidas: mes === ${JSON.stringify(mes)} ? massa.saidas : [] })),
          h(ProvedorAvisos));
      }
      createRoot(document.getElementById("root")).render(h(Fixture));
    `;
      },
    },
  ]);
  navegador = await (process.env.FIXTURE_WEBKIT === "1" ? webkit : chromium).launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function comRelatorio(
  largura: number,
  tema: "light" | "dark",
  testar: (pagina: Page, relatorio: Locator) => Promise<void>,
  coresForcadas?: "active" | "none",
) {
  const pagina = await navegador.newPage({
    viewport: { width: largura, height: largura < 600 ? 844 : 900 },
    colorScheme: tema,
    forcedColors: coresForcadas,
    reducedMotion: "reduce",
    timezoneId: "America/Fortaleza",
    hasTouch: largura < 600,
    serviceWorkers: "block",
  });
  const erros: string[] = [];
  // O NextLink é importado pelo botão compartilhado mesmo sem links na fixture Vite.
  await pagina.addInitScript(() => {
    Object.defineProperty(globalThis, "process", { value: { env: { NODE_ENV: "development" } } });
  });
  pagina.on("pageerror", (erro) => erros.push(`${erro.name}: ${erro.message}`));
  pagina.on("response", (resposta) => {
    if (resposta.status() >= 400)
      erros.push(`${resposta.status()} ${new URL(resposta.url()).pathname}`);
  });
  await pagina.route("**/*", (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    if (pedido.url() === servidor.url && pedido.method() === "GET")
      return rota.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root {--font-jakarta: "Plus Jakarta Sans"}</style><div id="root"></div><script type="module" src="${coresForcadas ? entradaTemaReal : entrada}"></script></html>`,
      });
    if (
      url.origin === new URL(servidor.url).origin &&
      pedido.method() === "GET" &&
      !url.pathname.startsWith("/api/")
    )
      return rota.continue();
    erros.push("requisição fora da fixture");
    return rota.abort();
  });
  try {
    await pagina.goto(servidor.url);
    const relatorio = pagina.getByRole("region", { name: "Relatório por aluno", exact: true });
    try {
      await esperar(relatorio.getByRole("heading", { name: "Por aluno" })).toBeVisible();
    } catch (erro) {
      throw new Error(`A fixture não montou: ${erros.join("; ")}`, { cause: erro });
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
    await testar(pagina, relatorio);
    expect(erros).toEqual([]);
  } finally {
    await pagina.close();
  }
}

function grupo(relatorio: Locator, nome: string) {
  return relatorio.getByRole("region", { name: nome, exact: true });
}

function linha(relatorio: Locator, nome: string) {
  return relatorio.getByRole("button", { name: new RegExp(`^${nome}`) });
}

function cabecalhoDaSerie(relatorio: Locator) {
  return relatorio.getByRole("button", { name: new RegExp(`^${serie.nome} \\d+ alunos?$`) });
}

it.each([
  [320, "light"],
  [390, "dark"],
  [1440, "dark"],
] as const)(
  "contém os textos completos de duas linhas consecutivas e dos grupos em %i px (%s)",
  async (largura, tema) =>
    comRelatorio(largura, tema, async (pagina, relatorio) => {
      const turma = grupo(relatorio, rotuloA);
      const alunos = turma.getByRole("list").getByRole("button");
      await esperar(alunos).toHaveCount(3);
      await esperar(alunos.nth(0)).toHaveAccessibleName(new RegExp(`^${nomeA}.*origem ${rotuloB}`));
      await esperar(alunos.nth(1)).toHaveAccessibleName(new RegExp(`^${nomeB}.*origem ${rotuloB}`));
      for (const [botao, textos] of [
        [linha(turma, rotuloA), [rotuloA]],
        [linha(grupo(relatorio, rotuloB), rotuloB), [rotuloB]],
        [alunos.nth(0), [nomeA, `${rotuloA} · origem ${rotuloB}`]],
        [alunos.nth(1), [nomeB, `${rotuloA} · origem ${rotuloB}`]],
      ] as const) {
        const limites = await botao.evaluate((elemento, esperados) => {
          const linha = elemento.getBoundingClientRect();
          const contadores = [...elemento.querySelectorAll('[role="img"]')].map((selo) =>
            selo.getBoundingClientRect(),
          );
          if (
            contadores.length !== 3 ||
            contadores.some((selo) => selo.width < 32 || selo.height < 32)
          )
            throw new Error("Contadores sem área de medida");
          return esperados.map((texto) => {
            const no = [...elemento.querySelectorAll("*")].find((n) => n.textContent === texto);
            if (!no) throw new Error("Rótulo sem área de medida");
            const intervalo = document.createRange();
            intervalo.selectNodeContents(no);
            const fragmentos = [...intervalo.getClientRects()].filter(
              (r) => r.width > 0 && r.height > 0,
            );
            if (!fragmentos.length) throw new Error("Rótulo sem fragmentos");
            return Math.min(
              ...fragmentos.flatMap((r) => {
                const aoLado = contadores.filter(
                  (selo) => r.top < selo.bottom && r.bottom > selo.top,
                );
                // A coluna dos contadores só limita a largura dos fragmentos na mesma faixa vertical.
                const direita = Math.min(linha.right, ...aoLado.map((selo) => selo.left));
                return [
                  r.left - linha.left,
                  r.top - linha.top,
                  linha.bottom - r.bottom,
                  direita - r.right,
                ];
              }),
            );
          });
        }, textos);
        for (const folga of limites)
          expect(
            folga,
            "fragmentos do texto dentro da linha e antes dos contadores",
          ).toBeGreaterThanOrEqual(4);
      }
      const [primeiro, segundo] = await Promise.all([
        alunos.nth(0).boundingBox(),
        alunos.nth(1).boundingBox(),
      ]);
      if (!primeiro || !segundo) throw new Error("Duas linhas de aluno são necessárias");
      expect(primeiro.y + primeiro.height).toBeLessThanOrEqual(segundo.y + 0.5);
      // A primeira linha inteira é critério do Antes de 390 e 1440. Em 320, deve ser alcançável.
      if (largura !== 320) {
        expect(primeiro.y + primeiro.height).toBeLessThanOrEqual(largura < 600 ? 844 : 900);
      }
      expect(
        await pagina.evaluate(() => ({
          rolagem: scrollY,
          excesso: document.documentElement.scrollWidth - innerWidth,
        })),
      ).toEqual({ rolagem: 0, excesso: 0 });
      if (largura === 320) {
        await alunos.nth(0).scrollIntoViewIfNeeded();
        await esperar(alunos.nth(0)).toBeInViewport({ ratio: 1 });
      }
    }),
);

it("põe mês e busca lado a lado só quando cabem e separa os comandos da lista da emissão", async () => {
  await comRelatorio(1440, "dark", async (pagina, relatorio) => {
    const busca = relatorio.getByRole("searchbox", { name: "Buscar aluno" });
    const anterior = relatorio.getByRole("button", { name: "Mês anterior" });
    const seguinte = relatorio.getByRole("button", { name: "Mês seguinte" });
    const emitir = relatorio.getByRole("button", { name: "Emitir relatório" });
    for (const largura of [1440, 648, 647, 390, 320]) {
      await pagina.setViewportSize({ width: largura, height: 844 });
      const seta = await seguinte.boundingBox();
      const campo = await busca.locator("xpath=..").boundingBox();
      if (!seta || !campo) throw new Error("Período e busca precisam estar visíveis");
      if (largura >= 648) {
        expect(
          Math.abs(seta.y + seta.height / 2 - campo.y - campo.height / 2),
          "centros de mês e busca na mesma linha",
        ).toBeLessThanOrEqual(1);
        expect(campo.x - (seta.x + seta.width)).toBeGreaterThanOrEqual(8);
      } else {
        expect(campo.y).toBeGreaterThanOrEqual(seta.y + seta.height + 8);
      }
      expect(await pagina.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
    }
    const comandos = relatorio.getByRole("group", { name: "Expansão da lista" });
    await esperar(comandos.getByRole("button")).toHaveCount(2);
    await esperar(comandos.getByRole("button", { name: "Emitir relatório" })).toHaveCount(0);
    for (const controle of [
      anterior,
      seguinte,
      emitir,
      comandos.getByRole("button").first(),
      comandos.getByRole("button").last(),
    ]) {
      const alvo = await controle.boundingBox();
      expect(alvo?.height).toBeGreaterThanOrEqual(48);
      expect(alvo?.width).toBeGreaterThanOrEqual(48);
    }
  });
});

it("reabre a turma encontrada sem acento e restaura os recolhimentos ao limpar", async () => {
  await comRelatorio(390, "light", async (_pagina, relatorio) => {
    const turma = grupo(relatorio, rotuloA);
    const cabecalhoSerie = cabecalhoDaSerie(relatorio);
    const busca = relatorio.getByRole("searchbox", { name: "Buscar aluno" });
    const series = relatorio.getByRole("button", { name: /todas as séries/ });
    const turmas = relatorio.getByRole("button", { name: /todas as turmas/ });
    await esperar(cabecalhoSerie).toContainText("4 alunos");
    await esperar(turma.getByRole("listitem")).toHaveCount(3);
    await esperar(grupo(relatorio, rotuloB).getByRole("listitem")).toHaveCount(1);
    await esperar(grupo(relatorio, rotuloC).getByRole("listitem")).toHaveCount(1);
    await turmas.tap();
    await esperar(cabecalhoSerie).toHaveAttribute("aria-expanded", "true");
    await esperar(turma.getByRole("listitem")).toHaveCount(0);
    await series.tap();
    await esperar(turma).toHaveCount(0);
    await busca.fill("aLVARO");
    await esperar(turma.getByRole("listitem")).toHaveCount(1);
    await esperar(linha(turma, nomeA)).toBeVisible();
    await esperar(cabecalhoSerie).toContainText("1 aluno");
    await esperar(grupo(relatorio, rotuloB)).toHaveCount(0);
    await esperar(series).toBeDisabled();
    await esperar(turmas).toBeDisabled();
    await relatorio.getByRole("button", { name: "Limpar busca" }).tap();
    await esperar(cabecalhoSerie).toHaveAttribute("aria-expanded", "false");
    await esperar(turma).toHaveCount(0);
    await series.tap();
    await esperar(linha(turma, rotuloA)).toHaveAttribute("aria-expanded", "false");
    await turmas.tap();
    await esperar(turma.getByRole("listitem")).toHaveCount(3);
    await busca.fill("zzyy");
    await esperar(relatorio.getByText("Nenhum aluno encontrado")).toBeVisible();
    await esperar(relatorio.getByRole("listitem")).toHaveCount(0);
    await esperar(turmas).toBeDisabled();
  });
});

it("mantém totais mensais, marcas e saídas distintas do acumulado, com um único detalhe", async () => {
  await comRelatorio(320, "light", async (_pagina, relatorio) => {
    const turma = grupo(relatorio, rotuloA);
    const alvaro = linha(turma, nomeA);
    const bia = linha(turma, nomeB);
    const cabecalho = linha(turma, rotuloA);
    await esperar(cabecalho.getByRole("img", { name: "2 faltas", exact: true })).toBeVisible();
    await esperar(alvaro.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
    await esperar(
      alvaro.getByRole("img", { name: "1 falta justificada", exact: true }),
    ).toBeVisible();
    await esperar(alvaro.getByRole("img", { name: "1 saída", exact: true })).toBeVisible();
    await alvaro.tap();
    for (const texto of [
      "03/11S",
      "04/11FJ",
      "05/11F",
      "06/11P",
      "Acumulado desde 02/10/2026",
      "em 24 dias letivos",
      "Motivo sintético",
      "Liberado por Equipe sintética",
    ]) {
      await esperar(turma.getByText(texto, { exact: true })).toBeVisible();
    }
    await esperar(turma.getByRole("img", { name: "7 faltas", exact: true })).toBeVisible();
    await esperar(
      turma.getByRole("img", { name: "4 faltas justificadas", exact: true }),
    ).toBeVisible();
    await bia.tap();
    await esperar(bia).toHaveAttribute("aria-expanded", "true");
    await esperar(alvaro).toHaveAttribute("aria-expanded", "false");
    await esperar(turma.getByText("Motivo sintético")).toHaveCount(0);
    await linha(turma, "Caio Sintético").tap();
    await esperar(turma.getByText("Nenhum registro neste mês.")).toBeVisible();
    await esperar(bia).toHaveAttribute("aria-expanded", "false");
  });
});

it.each(["light", "dark"] as const)(
  "mantém ordem de Tab, foco interno e abertura por Enter e Space (%s)",
  async (tema) => {
    await comRelatorio(1440, tema, async (pagina, relatorio) => {
      const cabecalhoSerie = cabecalhoDaSerie(relatorio);
      const turma = grupo(relatorio, rotuloA);
      const cabecalhoTurma = linha(turma, rotuloA);
      for (const controle of [
        relatorio.getByRole("button", { name: "Mês anterior" }),
        relatorio.getByRole("button", { name: /^Mês do relatório:/ }),
        relatorio.getByRole("searchbox", { name: "Buscar aluno" }),
        relatorio.getByRole("button", { name: /^Recolher todas as séries/ }),
        relatorio.getByRole("button", { name: /^Recolher todas as turmas/ }),
        relatorio.getByRole("button", { name: "Emitir relatório" }),
        cabecalhoSerie,
      ]) {
        await pagina.keyboard.press("Tab");
        await esperar(controle).toBeFocused();
      }
      await pagina.keyboard.press("Space");
      await esperar(turma).toHaveCount(0);
      await pagina.keyboard.press("Enter");
      await esperar(cabecalhoTurma).toBeVisible();
      for (const [indice, controle] of [
        cabecalhoSerie,
        cabecalhoTurma,
        linha(turma, nomeA),
      ].entries()) {
        if (indice > 0) await pagina.keyboard.press("Tab");
        await esperar(controle).toBeFocused();
        const anel = await controle.evaluate((elemento) => {
          const estilo = getComputedStyle(elemento);
          const canvas = document.createElement("canvas").getContext("2d");
          if (!canvas) throw new Error("Canvas indisponível para compor as cores");
          function luminancia(cor: Uint8ClampedArray) {
            return [0.2126, 0.7152, 0.0722].reduce((soma, peso, i) => {
              const canal = (cor[i] ?? 0) / 255;
              return (
                soma + peso * (canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4)
              );
            }, 0);
          }
          const fundos: string[] = [];
          for (let no: Element | null = elemento; no; no = no.parentElement)
            fundos.unshift(getComputedStyle(no).backgroundColor);
          const fundo = () => {
            canvas.clearRect(0, 0, 1, 1);
            for (const cor of fundos) {
              canvas.fillStyle = cor;
              canvas.fillRect(0, 0, 1, 1);
            }
            return luminancia(canvas.getImageData(0, 0, 1, 1).data);
          };
          const contraste = (cor: string) => {
            const base = fundo();
            canvas.fillStyle = cor;
            canvas.fillRect(0, 0, 1, 1);
            const frente = luminancia(canvas.getImageData(0, 0, 1, 1).data);
            return (Math.max(base, frente) + 0.05) / (Math.min(base, frente) + 0.05);
          };
          return {
            foco: {
              visivel: elemento.matches(":focus-visible"),
              largura: estilo.outlineWidth,
              interno: parseFloat(estilo.outlineOffset) + parseFloat(estilo.outlineWidth) <= 0,
              estilo: estilo.outlineStyle,
            },
            contrasteFoco: contraste(estilo.outlineColor),
            contrasteTexto: contraste(estilo.color),
          };
        });
        expect(anel.foco).toEqual({
          visivel: true,
          largura: "3px",
          interno: true,
          estilo: "solid",
        });
        expect(anel.contrasteFoco).toBeGreaterThanOrEqual(3);
        expect(anel.contrasteTexto).toBeGreaterThanOrEqual(4.5);
      }
      await pagina.keyboard.press("Enter");
      await esperar(turma.getByText("03/11S", { exact: true })).toBeVisible();
    });
  },
);

async function medirContorno(controle: Locator) {
  await esperar(controle).toBeFocused();
  await controle.scrollIntoViewIfNeeded();
  return controle.evaluate((botao) => {
    const estilo = getComputedStyle(botao);
    const caixa = botao.getBoundingClientRect();
    const espessura = parseFloat(estilo.outlineWidth);
    const deslocamento = parseFloat(estilo.outlineOffset);
    const extensao = deslocamento + espessura;
    const folgas = { esquerda: Infinity, direita: Infinity, topo: Infinity, base: Infinity };
    let cartaoRecorta = false;
    for (let no = botao.parentElement; no; no = no.parentElement) {
      const css = getComputedStyle(no);
      const horizontal = css.overflowX !== "visible";
      const vertical = css.overflowY !== "visible";
      if (!horizontal && !vertical) continue;
      if (horizontal && vertical && no.classList.contains("MuiPaper-root")) cartaoRecorta = true;
      const limites = no.getBoundingClientRect();
      const esquerda = limites.left + no.clientLeft;
      const topo = limites.top + no.clientTop;
      if (horizontal) {
        folgas.esquerda = Math.min(folgas.esquerda, caixa.left - extensao - esquerda);
        folgas.direita = Math.min(
          folgas.direita,
          esquerda + no.clientWidth - caixa.right - extensao,
        );
      }
      if (vertical) {
        folgas.topo = Math.min(folgas.topo, caixa.top - extensao - topo);
        folgas.base = Math.min(folgas.base, topo + no.clientHeight - caixa.bottom - extensao);
      }
    }

    const amostra = document.createElement("span");
    amostra.style.color = "Highlight";
    botao.append(amostra);
    const corDoSistema = getComputedStyle(amostra).color;
    amostra.remove();
    return {
      focoVisivel: botao.matches(":focus-visible"),
      cartaoRecorta,
      espessura,
      deslocamento,
      estilo: estilo.outlineStyle,
      cor: estilo.outlineColor,
      corDoSistema,
      ajusteDeCor: estilo.forcedColorAdjust,
      folgas,
    };
  });
}

// O par de controle e cores forçadas roda no mesmo motor, Chromium.
it.runIf(process.env.FIXTURE_WEBKIT !== "1").each(["none", "active"] as const)(
  "mantém o contorno sem recorte com ProvedorTema (forced-colors: %s)",
  async (coresForcadas) => {
    await comRelatorio(
      1440,
      "light",
      async (pagina, relatorio) => {
        const raiz = pagina.locator("html");
        expect(await pagina.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(
          coresForcadas === "active",
        );
        await esperar(raiz).not.toHaveAttribute("data-foco-teclado", "true");
        const cabecalhoSerie = cabecalhoDaSerie(relatorio);
        const turma = grupo(relatorio, rotuloA);
        const cabecalhoTurma = linha(turma, rotuloA);
        const aluno = linha(turma, nomeA);
        for (const controle of [
          relatorio.getByRole("button", { name: "Mês anterior" }),
          relatorio.getByRole("button", { name: /^Mês do relatório:/ }),
          relatorio.getByRole("searchbox", { name: "Buscar aluno" }),
          relatorio.getByRole("button", { name: /^Recolher todas as séries/ }),
          relatorio.getByRole("button", { name: /^Recolher todas as turmas/ }),
          relatorio.getByRole("button", { name: "Emitir relatório" }),
          cabecalhoSerie,
        ]) {
          await pagina.keyboard.press("Tab");
          await esperar(controle).toBeFocused();
        }
        await esperar(raiz).toHaveAttribute("data-foco-teclado", "true");
        await pagina.keyboard.press("Space");
        await esperar(cabecalhoSerie).toHaveAttribute("aria-expanded", "false");
        await esperar(grupo(relatorio, outraSerie.nome)).toHaveCount(0);
        await esperar(turma).toHaveCount(0);
        const anelSerie = await medirContorno(cabecalhoSerie);
        await pagina.keyboard.press("Enter");
        await esperar(cabecalhoSerie).toHaveAttribute("aria-expanded", "true");
        await pagina.keyboard.press("Tab");
        const anelTurma = await medirContorno(cabecalhoTurma);
        await pagina.keyboard.press("Tab");
        const anelAluno = await medirContorno(aluno);

        const aneis = { serie: anelSerie, turma: anelTurma, aluno: anelAluno };
        for (const anel of Object.values(aneis)) {
          expect(anel).toMatchObject({
            focoVisivel: true,
            cartaoRecorta: true,
            estilo: "solid",
            espessura: 3,
          });
          if (coresForcadas === "active") {
            expect(anel.ajusteDeCor).toBe("auto");
            expect(anel.cor).toBe(anel.corDoSistema);
          } else {
            expect(anel.deslocamento).toBe(-5);
          }
        }
        expect(
          Object.values(aneis).every(({ folgas }) =>
            Object.values(folgas).every((folga) => Number.isFinite(folga) && folga >= -0.5),
          ),
          `Contorno recortado pelo cartão: ${JSON.stringify(aneis)}`,
        ).toBe(true);
      },
      coresForcadas,
    );
  },
);

it("limita o mês pelo seletor original e emitir só apresenta o aviso", async () => {
  await comRelatorio(390, "dark", async (pagina, relatorio) => {
    let downloads = 0;
    pagina.on("download", () => downloads++);
    const seletor = relatorio.getByRole("button", { name: /^Mês do relatório:/ });
    const seguinte = relatorio.getByRole("button", { name: "Mês seguinte" });
    await esperar(seletor).toHaveAccessibleName(/Novembro de 2026/);
    await esperar(seguinte).toBeDisabled();
    await relatorio.getByRole("button", { name: "Mês anterior" }).tap();
    await esperar(seletor).toHaveAccessibleName(/Outubro de 2026/);
    await esperar(
      linha(relatorio, nomeA).getByRole("img", { name: "0 saídas", exact: true }),
    ).toBeVisible();
    await seguinte.tap();
    await esperar(seletor).toHaveAccessibleName(/Novembro de 2026/);
    await seletor.tap();
    const calendario = pagina.getByRole("dialog", { name: "Mês do relatório", exact: true });
    await esperar(calendario.getByRole("button", { name: "Dezembro", exact: true })).toBeDisabled();
    await calendario.getByRole("button", { name: "Outubro", exact: true }).tap();
    await esperar(seletor).toHaveAccessibleName(/Outubro de 2026/);
    await esperar(calendario).toHaveCount(0);
    await relatorio.getByRole("button", { name: "Emitir relatório" }).tap();
    await esperar(
      pagina.getByText("Emissão de relatório em preparação", { exact: true }),
    ).toBeVisible();
    expect(downloads).toBe(0);
  });
});
