// Confere a geometria da tabela no desktop, dos cartões no celular e a adaptação pelo conteúdo.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;
let cache: string;

const LARGURA_TABELA = 768;
const LARGURA_PAINEL = 576;
const LARGURA_FILTROS = 544;

beforeAll(async () => {
  cache = mkdtempSync(path.join(tmpdir(), "frequenciapp-colunas-"));
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    define: { "process.env": "{}" },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/colunas-parcial.html`;
  navegador = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

it("alinha a tabela no desktop, mantém os cartões no celular e responde à largura do conteúdo", async () => {
  const falhas: string[] = [];
  for (const { width, fonte, coluna } of [
    ...[320, 390, 768, 1024, 1100, 1200, 1440].flatMap((width) =>
      [16, 20].map((fonte) => ({ width, fonte, coluna: 0 })),
    ),
    ...[16, 20].flatMap((fonte) =>
      [480, 768, 964].map((coluna) => ({ width: 1440, fonte, coluna })),
    ),
  ]) {
    for (const tema of ["light", "dark"] as const) {
      const page = await navegador.newPage({ viewport: { width, height: 900 } });
      try {
        await page.emulateMedia({ colorScheme: tema });
        await page.addInitScript((tamanho: number) => {
          document.documentElement.style.fontSize = `${tamanho}px`;
        }, fonte);
        const confirmacoes: unknown[] = [];
        await page.route("**/api/**", async (route) => {
          const pedido = route.request();
          const endereco = new URL(pedido.url());
          if (endereco.pathname === "/api/frequencias/seduc" && pedido.method() === "POST") {
            const dados: unknown = pedido.postDataJSON();
            confirmacoes.push(dados);
            return route.fulfill({
              json: {
                confirmacao: {
                  registradoSeduc: true,
                  registradoSeducEm: null,
                  registradoSeducPorNome: null,
                  revisaoSeduc: 2,
                },
              },
            });
          }
          if (pedido.method() !== "GET") return route.abort();
          if (endereco.pathname === "/api/planilha-parcial/estado")
            return route.fulfill({ json: { podeEnviar: false, planilhaNome: null } });
          if (endereco.pathname === "/api/frequencias-personalizadas") {
            const base = {
              dia: "2026-10-27",
              turmaId: "turma",
              turmaNome: "1º ano A",
              registradoSeduc: false,
              registradoSeducEm: null,
              registradoSeducPorNome: null,
              revisao: 1,
              criadoEm: "2026-10-27T12:00:00Z",
              atualizadoEm: "2026-10-27T12:00:00Z",
            };
            return route.fulfill({
              json: {
                registros: [
                  {
                    ...base,
                    tipo: "CHAMADA",
                    id: "registro-0",
                    alunoId: "aluno-0",
                    alunoNome: "Aluno Presente",
                    marca: "P",
                    descricao: "Presente",
                    justificativas: [],
                    revisaoSeduc: 1,
                  },
                  {
                    ...base,
                    tipo: "CHAMADA",
                    id: "registro-1",
                    alunoId: "aluno-1",
                    alunoNome: "Aluno Justificado",
                    marca: "FJ",
                    descricao: "Doente",
                    justificativas: ["Doente"],
                    revisaoSeduc: 1,
                  },
                  {
                    ...base,
                    tipo: "AULAS",
                    id: "registro-2",
                    alunoId: "aluno-2",
                    alunoNome: "Aluno Parcial",
                    turno: null,
                    aulas: [1, 2],
                    observacao: null,
                  },
                ],
                feriado: null,
              },
            });
          }
          return route.abort();
        });
        await page.goto(url);
        await page.evaluate((larguraMaxima: number) => {
          const conteudo = document.querySelector<HTMLElement>('[data-testid="conteudo-fixture"]');
          if (larguraMaxima && conteudo) conteudo.style.maxWidth = `${larguraMaxima}px`;
        }, coluna);
        await page.getByRole("switch", { name: "Registro na Seduc: Aluno Justificado" }).waitFor();
        expect(await page.getByRole("switch", { name: /Registro na Seduc: Aluno/ }).count()).toBe(
          2,
        );
        expect(
          await page
            .getByRole("button", { name: "Remover frequência parcial de Aluno Parcial" })
            .count(),
        ).toBe(1);
        await page.evaluate(() => document.fonts.ready);

        const secao = page.getByTestId("chamada-parcial");
        const medidas = await secao.evaluate((no) => {
          const largura = no.getBoundingClientRect().width;
          const layout = no.getAttribute("data-layout");
          return { largura, layout };
        });
        const esperado = medidas.largura >= LARGURA_TABELA ? "tabela" : "cartoes";
        await expect.poll(async () => secao.getAttribute("data-layout")).toBe(esperado);
        expect(medidas.largura).toBeGreaterThan(0);

        const erros = await page.evaluate(
          ({ larguraTabela, larguraPainel, larguraFiltros }) => {
            const erros: string[] = [];
            const no = document.querySelector('[data-testid="chamada-parcial"]');
            if (!(no instanceof HTMLElement)) return ["Seção ausente"];
            const largura = no.getBoundingClientRect().width;
            const caixa = (elemento: Element) => elemento.getBoundingClientRect();
            const dentro = (a: DOMRect, b: DOMRect) =>
              a.left >= b.left - 1 &&
              a.right <= b.right + 1 &&
              a.top >= b.top - 1 &&
              a.bottom <= b.bottom + 1;
            const colidem = (a: DOMRect, b: DOMRect) =>
              a.left < b.right - 1 &&
              a.right > b.left + 1 &&
              a.top < b.bottom - 1 &&
              a.bottom > b.top + 1;

            const turma = document.querySelector("#parcial-turma");
            const data = document.querySelector("#dia-chamada-parcial");
            const busca = document.querySelector("#parcial-busca");
            const filtro = document.querySelector("#parcial-filtro");
            const campo = (elemento: Element | null) =>
              elemento?.closest(".MuiFormControl-root") ?? null;
            const painelTurma = campo(turma);
            const painelData = campo(data);
            const painelBusca = campo(busca) ?? busca?.closest(".MuiTextField-root") ?? null;
            const painelFiltro = filtro?.closest(".MuiInputBase-root") ?? null;
            if (!turma || !data || !busca || !filtro || !painelTurma || !painelData)
              return ["Controles da chamada parcial ausentes"];
            if (!painelBusca || !painelFiltro) return ["Busca ou filtro ausentes"];

            const painel = painelTurma.closest(".MuiPaper-root");
            const filtros = painelBusca.closest(".MuiPaper-root");
            if (!painel || !filtros) return ["Painéis ausentes"];
            if (
              !dentro(caixa(painelTurma), caixa(painel)) ||
              !dentro(caixa(painelData), caixa(painel))
            )
              erros.push("Turma ou data fora do painel");
            if (
              !dentro(caixa(painelBusca), caixa(filtros)) ||
              !dentro(caixa(painelFiltro), caixa(filtros))
            )
              erros.push("Busca ou filtro fora do painel");

            const a = caixa(painelTurma);
            const b = caixa(painelData);
            if (largura >= larguraPainel ? b.left < a.right - 1 : b.top < a.bottom - 1)
              erros.push("Turma e data não se adaptaram à largura do painel");
            const buscaCaixa = caixa(painelBusca);
            const filtroCaixa = caixa(painelFiltro);
            if (
              largura >= larguraFiltros
                ? filtroCaixa.left < buscaCaixa.right - 1
                : filtroCaixa.top < buscaCaixa.bottom - 1
            )
              erros.push("Busca e filtro não se adaptaram à largura do painel");

            if (largura >= larguraTabela) {
              const tabela = no.querySelector("table");
              const cabecalhos = tabela ? Array.from(tabela.querySelectorAll("thead th")) : [];
              const linhas = tabela ? Array.from(tabela.querySelectorAll("tbody tr")) : [];
              if (!tabela || cabecalhos.length !== 4 || linhas.length !== 5)
                return ["Tabela, cabeçalho ou linhas ausentes"];
              const textos = cabecalhos.map((item) => item.textContent?.trim());
              if (textos.join("|") !== "Aluno|Situação|Registro na Seduc|Ações")
                erros.push(`Cabeçalhos inesperados: ${textos.join("|")}`);
              const limite = caixa(tabela);
              for (const linha of linhas) {
                const nome = linha.querySelector("th");
                const celulas = Array.from(linha.querySelectorAll(":scope > td"));
                if (!nome || celulas.length !== 3) {
                  erros.push("Células da linha ausentes");
                  continue;
                }
                const celulasCompletas = [nome, ...celulas];
                for (let indice = 0; indice < celulasCompletas.length; indice++) {
                  const celula = celulasCompletas[indice];
                  const referencia = cabecalhos[indice];
                  if (!celula || !referencia) continue;
                  const c = caixa(celula);
                  const r = caixa(referencia);
                  if (Math.abs(c.left - r.left) > 1 || Math.abs(c.right - r.right) > 1)
                    erros.push(`Coluna ${indice} desalinhada em ${nome.textContent}`);
                  if (!dentro(c, limite)) erros.push(`Coluna ${indice} fora da tabela`);
                }
                const conteudos = Array.from(linha.querySelectorAll("th *, td *")).filter(
                  (elemento) => {
                    const estilo = getComputedStyle(elemento);
                    const retangulo = elemento.getBoundingClientRect();
                    return (
                      retangulo.width > 1 &&
                      retangulo.height > 1 &&
                      estilo.display !== "none" &&
                      estilo.visibility !== "hidden"
                    );
                  },
                );
                for (const elemento of conteudos) {
                  const retangulo = caixa(elemento);
                  if (!dentro(retangulo, limite))
                    erros.push(`Conteúdo fora da tabela em ${nome.textContent}`);
                }
                const chip = linha.querySelector(".MuiChip-root");
                const chave = linha.querySelector(".MuiSwitch-root");
                const acoes = linha.querySelector("td:last-of-type");
                const botoes = acoes ? Array.from(acoes.querySelectorAll("button")) : [];
                if (!chip || !acoes) {
                  erros.push("Situação ou ações ausentes");
                  continue;
                }
                if (chave && !dentro(caixa(chave), limite))
                  erros.push(`Chave fora da tabela em ${nome.textContent}`);
                for (const botao of botoes) {
                  if (!dentro(caixa(botao), caixa(acoes)))
                    erros.push(`Ação fora da coluna em ${nome.textContent}`);
                }
                const retangulos = [
                  caixa(chip),
                  ...(chave ? [caixa(chave)] : []),
                  ...botoes.map((botao) => caixa(botao)),
                ];
                for (let i = 0; i < retangulos.length; i++) {
                  for (let j = i + 1; j < retangulos.length; j++) {
                    const primeiro = retangulos[i];
                    const segundo = retangulos[j];
                    if (primeiro && segundo && colidem(primeiro, segundo))
                      erros.push(`Conteúdo sobreposto em ${nome.textContent}`);
                  }
                }
              }
            } else {
              const lista = no.querySelector("ul.MuiList-root");
              const itens = lista ? Array.from(lista.children) : [];
              if (!lista || itens.length !== 5) return ["Lista ou cartões ausentes"];
              const limite = caixa(lista);
              for (const item of itens) {
                const titulo = item.querySelector("h2");
                const chip = item.querySelector(".MuiChip-root");
                const chave = item.querySelector(".MuiSwitch-root");
                const botoes = Array.from(item.querySelectorAll("button"));
                if (!titulo || !chip) {
                  erros.push("Nome ou situação ausentes no cartão");
                  continue;
                }
                if (!dentro(caixa(item), limite)) erros.push("Cartão fora da lista");
                if (!dentro(caixa(titulo), limite) || !dentro(caixa(chip), limite))
                  erros.push("Nome ou situação fora do cartão");
                for (const botao of botoes) {
                  if (!dentro(caixa(botao), caixa(item)))
                    erros.push(`Ação fora do cartão em ${titulo.textContent}`);
                }
                const tituloCaixa = caixa(titulo);
                const chipCaixa = caixa(chip);
                const blocoAcoes = botoes[0]?.parentElement;
                if (blocoAcoes) {
                  if (!dentro(caixa(blocoAcoes), caixa(item)))
                    erros.push(`Ações fora do cartão em ${titulo.textContent}`);
                  if (caixa(blocoAcoes).left < tituloCaixa.right - 1)
                    erros.push(`Ações não ficam à direita em ${titulo.textContent}`);
                }
                if (chipCaixa.top < tituloCaixa.bottom - 1)
                  erros.push(`Situação não fica abaixo do nome em ${titulo.textContent}`);
                if (chave && caixa(chave).top < chipCaixa.bottom - 1)
                  erros.push(`Chave não fica abaixo da situação em ${titulo.textContent}`);
              }
            }

            if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
              erros.push("Overflow horizontal da página");
            return erros;
          },
          {
            larguraTabela: LARGURA_TABELA,
            larguraPainel: LARGURA_PAINEL,
            larguraFiltros: LARGURA_FILTROS,
          },
        );
        falhas.push(
          ...erros.map((erro) => `${width}/${fonte}/${coluna || "normal"}/${tema}: ${erro}`),
        );
        if (width === 1024 && fonte === 20 && !coluna && tema === "dark")
          await page.screenshot({ path: "test-results/colunas-parcial.png", fullPage: true });
        if (width === 320 && fonte === 20 && !coluna && tema === "dark")
          await page.screenshot({ path: "test-results/colunas-parcial-movel.png", fullPage: true });
        if (width === 1440 && fonte === 16 && !coluna && tema === "light")
          await page.screenshot({
            path: "test-results/colunas-parcial-desktop.png",
            fullPage: true,
          });
        if (
          ((width === 320 && fonte === 20) ||
            (width === 1024 && fonte === 20) ||
            (width === 1440 && fonte === 16)) &&
          !coluna
        ) {
          await page
            .getByRole("button", { name: "Editar frequência parcial de Aluno Parcial" })
            .click();
          const dialogo = page.getByRole("dialog");
          await dialogo.getByRole("heading", { name: "Editar frequência parcial" }).waitFor();
          await dialogo.getByRole("button", { name: "Cancelar" }).click();
          await page
            .getByRole("button", { name: "Registrar frequência parcial de Aluno Sem registro" })
            .click();
          await dialogo.getByRole("heading", { name: "Registrar frequência parcial" }).waitFor();
          await dialogo.getByRole("button", { name: "Cancelar" }).click();
          await page
            .getByRole("button", { name: "Remover frequência parcial de Aluno Parcial" })
            .click();
          const alerta = page.getByRole("alertdialog");
          await alerta.getByText(/O registro de Aluno Parcial/).waitFor();
          await alerta.getByRole("button", { name: "Cancelar" }).click();
          await page
            .getByRole("button", { name: "Remover frequência parcial de Aluno Parcial" })
            .waitFor({ state: "visible" });
          const chave = page.getByRole("switch", { name: "Registro na Seduc: Aluno Justificado" });
          await chave.click();
          await expect.poll(() => chave.isChecked()).toBe(true);
          expect(confirmacoes).toEqual([
            {
              dia: "2026-10-27",
              turmaId: "turma",
              alunoId: "aluno-1",
              registrado: true,
              revisao: 1,
              revisaoSeduc: 1,
            },
          ]);
        }
      } finally {
        await page.close();
      }
    }
  }
  expect(falhas).toEqual([]);
}, 180000);
