// Mede colisões e navegação do resumo real nas dimensões da página de chamada.
import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
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
let browser: Browser;
let url: string;
let cache: string;
beforeAll(async () => {
  cache = mkdtempSync(path.join(tmpdir(), "frequenciapp-espacamento-"));
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
  url = `http://localhost:${endereco.port}/tests/componentes/interface/espacamento-semana.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

it("mantém gráficos e cartões sem colisão em cada largura e tema", async () => {
  const falhas: string[] = [];
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    for (const tema of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await page.addInitScript(
          (temaAtual) => document.documentElement.classList.toggle("dark", temaAtual === "dark"),
          tema,
        );
        await page.route("**/api/frequencias?**", (route) =>
          route.fulfill({
            json: {
              frequencias: [26, 27, 28, 29, 30].map((dia) => ({
                dia: `2026-10-${dia}`,
                turmaId: "turma-a",
                revisao: 1,
                atualizadoEm: "2026-10-30T15:00:00Z",
                atualizadoPorNome: null,
                alunos: Array.from({ length: 20 }, (_, i) => `aluno-${i}`),
                aulas: ["aula-1", "aula-2"],
                faltas: [0, 1, 2, 3, 4, 5].map((i) => ({
                  alunoId: `aluno-${i}`,
                  horarios: ["aula-1", "aula-2"],
                  ...(i > 3 ? { justificativa: "D" } : {}),
                })),
              })),
            },
          }),
        );
        await page.goto(url);
        await page.getByRole("region", { name: "Resumo da semana" }).waitFor();
        await page.evaluate(
          (temaAtual) => document.documentElement.classList.toggle("dark", temaAtual === "dark"),
          tema,
        );
        const resumo = page.getByRole("region", { name: "Resumo da semana" });
        const rosca = resumo.getByRole("img", {
          name: /Faltas, justificadas e presentes de 1º ano A/,
        });
        await resumo.locator("[data-grafico-sob-demanda]").nth(0).scrollIntoViewIfNeeded();
        await rosca.waitFor({ state: "visible", timeout: 90000 });
        await resumo.locator("[data-grafico-sob-demanda]").nth(1).scrollIntoViewIfNeeded();
        const evolucao = resumo.getByRole("img", { name: /Infrequência diária de 1º ano A/ });
        await evolucao.scrollIntoViewIfNeeded({ timeout: 90000 });
        await evolucao.waitFor();
        const erros = await resumo.evaluate((root) => {
          const erros: string[] = [];
          const box = (el: Element) => el.getBoundingClientRect();
          const dentro = (a: DOMRect, b: DOMRect) => a.left >= b.left - 1 && a.right <= b.right + 1;
          const colidem = (a: DOMRect, b: DOMRect) =>
            a.left < b.right - 1 &&
            a.right > b.left + 1 &&
            a.top < b.bottom - 1 &&
            a.bottom > b.top + 1;
          const evolucao = root.querySelector('[aria-label^="Infrequência diária"]');
          const rosca = root.querySelector('[aria-label^="Faltas, justificadas e presentes"]');
          const dias = Array.from(root.querySelectorAll("[data-dia]"));
          if (!evolucao || !rosca || dias.length !== 6)
            return [`conteúdo ausente: dias=${dias.length}`];
          const limite = box(root);
          if (!dentro(box(rosca), limite) || !dentro(box(evolucao), limite))
            erros.push("gráfico fora do resumo");
          const legenda = rosca.parentElement?.querySelectorAll("li") ?? [];
          if (legenda.length !== 3) erros.push(`legenda incompleta: ${legenda.length}`);
          for (const item of legenda) {
            if (colidem(box(item), box(evolucao)))
              erros.push(`legenda colide com evolução: ${item.textContent}`);
            for (const filho of Array.from(item.querySelectorAll("span"))) {
              if (!dentro(box(filho), box(item)))
                erros.push(`conteúdo sai da legenda: ${item.textContent}`);
              if (colidem(box(filho), box(evolucao)))
                erros.push(`indicador colide com evolução: ${item.textContent}`);
            }
          }
          for (const dia of dias) {
            const ret = box(dia);
            if (!dentro(ret, limite))
              erros.push(`dia fora do resumo: ${dia.getAttribute("data-dia")}`);
            if (
              ret.width < 104 ||
              (dia.tagName === "BUTTON" && (ret.width < 44 || ret.height < 44))
            )
              erros.push(
                `dia estreito: ${dia.getAttribute("data-dia")} ${ret.width}x${ret.height}`,
              );
          }
          for (let i = 0; i < dias.length; i++)
            for (let j = i + 1; j < dias.length; j++) {
              const a = dias[i],
                b = dias[j];
              if (a && b && colidem(box(a), box(b))) erros.push("dias sobrepostos");
            }
          if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
            erros.push("overflow horizontal da página");
          return erros;
        });
        if (
          (await page.locator("html").evaluate((el) => el.classList.contains("dark"))) !==
          (tema === "dark")
        )
          erros.push("tema não aplicado");
        const dia = resumo.getByRole("button", { name: /Abrir segunda/ });
        await dia.focus();
        if (!(await dia.evaluate((el) => el === document.activeElement)))
          erros.push("foco ausente");
        await page.keyboard.press("Enter");
        if ((await page.getByLabel("Dia aberto").innerText()) !== "2026-10-26")
          erros.push("navegação por teclado falhou");
        const diretorio = process.env.EVIDENCIAS_RESUMO;
        if (diretorio) {
          mkdirSync(diretorio, { recursive: true });
          await page.screenshot({
            path: path.join(diretorio, `${width}-${tema}.png`),
            fullPage: true,
          });
        }
        falhas.push(...erros.map((erro) => `${width} ${tema}: ${erro}`));
      } finally {
        await page.close();
      }
    }
  }
  expect(falhas).toEqual([]);
}, 240000);
