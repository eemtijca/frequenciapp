// Confere a geometria das colunas da visão real com registros sintéticos no navegador.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
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

beforeAll(async () => {
  cache = mkdtempSync(path.join(tmpdir(), "frequenciapp-colunas-"));
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
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

it("alinha cabeçalhos e linhas com ações diferentes em desktop e mantém a disposição móvel", async () => {
  const falhas: string[] = [];
  for (const { width, fonte, coluna } of [
    ...[320, 390, 768, 1023, 1024, 1100, 1200, 1440].flatMap((width) =>
      [16, 20].map((fonte) => ({ width, fonte, coluna: 0 })),
    ),
    ...[16, 20].flatMap((fonte) =>
      [480, 48 * fonte, 48 * fonte + 4].map((coluna) => ({ width: 1440, fonte, coluna })),
    ),
  ]) {
    for (const tema of ["light", "dark"]) {
      const page = await navegador.newPage({ viewport: { width, height: 900 } });
      try {
        await page.addInitScript(
          (escuro) => document.documentElement.classList.toggle("dark", escuro),
          tema === "dark",
        );
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
        await page.evaluate(
          ({ fonte, coluna }) => {
            if (fonte !== 16) document.documentElement.style.fontSize = `${fonte}px`;
            const conteudo = document.querySelector<HTMLElement>(
              '[data-testid="conteudo-fixture"]',
            );
            if (coluna && conteudo) conteudo.style.maxWidth = `${coluna}px`;
          },
          { fonte, coluna },
        );
        await page.evaluate(
          (escuro) => document.documentElement.classList.toggle("dark", escuro),
          tema === "dark",
        );
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
          tema === "dark",
        );
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
        const geometria = await page.evaluate(() => {
          const card = document.querySelector("ul.divide-y")?.closest(".superficie");
          const menu = document.querySelector('[data-testid="menu-lateral"]');
          const painel = document.querySelector(".pagina-painel");
          const cabecalho = Array.from(card?.querySelectorAll("span") ?? []).find(
            (e) => e.textContent === "Situação",
          )?.parentElement;
          if (!card || !menu || !painel || !cabecalho)
            throw new Error("Estrutura da fixture ausente");
          return {
            largura: card.getBoundingClientRect().width,
            menu: menu.getBoundingClientRect().width,
            padding: parseFloat(getComputedStyle(painel).paddingLeft),
            fonte: parseFloat(getComputedStyle(document.documentElement).fontSize),
            desktop: getComputedStyle(cabecalho).display !== "none",
          };
        });
        expect(geometria.fonte).toBe(fonte);
        expect(geometria.menu).toBe(width >= 1024 ? 15 * fonte : 0);
        expect(geometria.padding).toBe((width >= 1024 ? 2 : width >= 640 ? 1.5 : 1) * fonte);
        expect(geometria.desktop).toBe(geometria.largura - 2 >= 48 * fonte);
        const erros = await page.evaluate(() => {
          const erros: string[] = [];
          const secao = document.querySelector('[data-testid="chamada-parcial"]');
          const cabecalho = Array.from(secao?.querySelectorAll("span") ?? []).find(
            (e) => e.textContent === "Situação",
          );
          const lista = secao?.querySelector("ul.divide-y");
          const cartao = lista?.closest(".superficie");
          if (!cartao) return ["Cartão ausente"];
          const limites = cartao.getBoundingClientRect();
          if (!cabecalho || !lista) return ["Cabeçalho ou lista ausente"];
          const colunas = cabecalho.parentElement?.children;
          if (!colunas || colunas.length !== 4 || !colunas[1] || !colunas[2] || !colunas[3])
            return ["Colunas ausentes"];
          if (lista.children.length !== 5) return ["Quantidade de linhas incorreta"];
          const cabSituacao = colunas[1].getBoundingClientRect();
          const cabSeduc = colunas[2].getBoundingClientRect();
          const cabAcoes = colunas[3].getBoundingClientRect();
          const desktop = getComputedStyle(cabecalho.parentElement as Element).display !== "none";
          for (const linha of Array.from(lista.children)) {
            const grade = linha.firstElementChild;
            if (!grade) return ["Grade ausente"];
            const nome = grade.querySelector("h2");
            const situacao = grade.children[1];
            const chave = grade.querySelector('[role="switch"]');
            const botoes = grade.querySelectorAll('button:not([role="switch"])');
            const acoes = botoes[0]?.parentElement;
            if (!nome || !situacao || !acoes) return ["Conteúdo da linha ausente"];
            const n = nome.getBoundingClientRect();
            const s = situacao.getBoundingClientRect();
            const a = acoes.getBoundingClientRect();
            const k = chave?.getBoundingClientRect();
            const perto = (x: number, y: number) => Math.abs(x - y) <= 1;
            const retangulos = [
              n,
              s,
              ...(k ? [k] : []),
              ...Array.from(botoes, (b) => b.getBoundingClientRect()),
            ];
            for (const r of retangulos) {
              if (r.width <= 0 || r.height <= 0)
                erros.push(`${nome.textContent}: conteúdo sem área visível`);
              if (r.left < limites.left - 1 || r.right > limites.right + 1)
                erros.push(
                  `${nome.textContent}: fora do cartão ${r.left.toFixed(1)}..${r.right.toFixed(1)} vs ${limites.left.toFixed(1)}..${limites.right.toFixed(1)}`,
                );
            }
            for (let i = 0; i < retangulos.length; i++) {
              for (let j = i + 1; j < retangulos.length; j++) {
                const x = retangulos[i],
                  y = retangulos[j];
                if (
                  x &&
                  y &&
                  Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
                  Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
                )
                  erros.push(`${nome.textContent}: conteúdo sobreposto (${i},${j})`);
              }
            }
            for (const botao of Array.from(botoes)) {
              const b = botao.getBoundingClientRect();
              if (b.left < a.left - 1 || b.right > a.right + 1 || b.right > innerWidth + 1)
                erros.push(`${nome.textContent}: ação fora da coluna ou da tela`);
            }
            if (desktop) {
              const caixasAcoes = Array.from(botoes, (botao) => botao.getBoundingClientRect());
              if (caixasAcoes.some((caixa) => !perto(caixa.top, caixasAcoes[0]?.top ?? caixa.top)))
                erros.push(`${nome.textContent}: ações não estão na mesma linha`);
              if (!perto(s.left, cabSituacao.left))
                erros.push(`${nome.textContent}: situação ${s.left} vs ${cabSituacao.left}`);
              if (k && !perto(k.left, cabSeduc.left))
                erros.push(`${nome.textContent}: Seduc ${k.left} vs ${cabSeduc.left}`);
              if (!perto(a.right, cabAcoes.right))
                erros.push(`${nome.textContent}: ações ${a.right} vs ${cabAcoes.right}`);
            } else {
              if (!perto(n.left, s.left) || a.left < n.right - 1 || s.top < n.bottom - 1)
                erros.push(`${nome.textContent}: disposição móvel`);
              if (k && k.top < s.bottom - 1) erros.push(`${nome.textContent}: chave móvel`);
            }
          }
          return erros;
        });
        falhas.push(
          ...erros.map((erro) => `${width}/${fonte}/${coluna || "normal"}/${tema}: ${erro}`),
        );
        if (width === 1024 && fonte === 20 && !coluna && tema === "dark")
          await page.screenshot({ path: "test-results/colunas-parcial.png", fullPage: true });
        if (width === 320 && fonte === 20 && tema === "dark")
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
          await page.waitForFunction(
            () =>
              document
                .querySelector('[role="switch"][aria-label="Registro na Seduc: Aluno Justificado"]')
                ?.getAttribute("aria-checked") === "true",
          );
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
}, 120000);
