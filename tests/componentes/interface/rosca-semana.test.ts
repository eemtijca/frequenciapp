// Verifica o resumo real e protege o contrato das demais roscas.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
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
  cache = mkdtempSync(path.join(tmpdir(), "frequenciapp-rosca-"));
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
  url = `http://localhost:${endereco.port}/tests/componentes/interface/rosca-semana.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  if (cache) rmSync(cache, { recursive: true, force: true });
});

async function abrir(page: Page, modo: "completo" | "vazio" | "singular" | "parcial" = "completo") {
  await page.route("**/api/frequencias?**", async (route) => {
    const faltas = Array.from({ length: 7 }, (_, i) => ({
      alunoId: `aluno-${i}`,
      horarios: i === 6 ? ["aula-1"] : ["aula-1", "aula-2"],
      ...(i === 4 || i === 5 ? { justificativa: "D" } : {}),
    }));
    await route.fulfill({
      json: {
        frequencias:
          modo === "vazio"
            ? []
            : [
                {
                  dia: "2026-10-19",
                  turmaId: "turma-a",
                  revisao: 1,
                  atualizadoEm: "2026-10-19T15:00:00Z",
                  atualizadoPorNome: null,
                  alunos:
                    modo === "singular" || modo === "parcial"
                      ? [modo === "singular" ? "aluno-4" : "aluno-6"]
                      : Array.from({ length: 101 }, (_, i) => `aluno-${i}`),
                  aulas: ["aula-1", "aula-2"],
                  faltas:
                    modo === "singular" ? [faltas[4]] : modo === "parcial" ? [faltas[6]] : faltas,
                },
              ],
      },
    });
  });
  await page.route("**/api/frequencias-personalizadas?**", (route) =>
    route.fulfill({ json: { registros: [] } }),
  );
  await page.goto(url);
  await page.getByRole("region", { name: "Resumo da semana" }).waitFor();
}

for (const [dispositivo, width] of [
  ["celular", 390],
  ["desktop", 1440],
] as const) {
  it(`identifica corretamente total e legenda semanal em ${dispositivo}`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await abrir(page);
      const resumo = page.getByRole("region", { name: "Resumo da semana" });
      const grafico = resumo.getByRole("img", {
        name: "Faltas, justificadas e presentes de 1º ano A",
      });
      await grafico.scrollIntoViewIfNeeded({ timeout: 90000 });
      expect(await grafico.getAttribute("aria-label")).toBe(
        "Faltas, justificadas e presentes de 1º ano A: 100 registros (F + FJ + P)",
      );
      expect(await grafico.locator("strong").innerText()).toBe("100");
      expect(await grafico.locator("strong + span").innerText()).toBe("F + FJ + P");
      const lista = resumo.locator("li").filter({ hasText: /^Faltas/ });
      for (const [nome, rotulo, porcentagem] of [
        ["Faltas", "4 faltas", "4% do total"],
        ["Justificadas", "2 faltas justificadas", "2% do total"],
        ["Presentes", "94 presenças", "94% do total"],
      ] as const) {
        const item = resumo.locator("li").filter({ has: page.getByText(nome, { exact: true }) });
        expect(await item.count()).toBe(1);
        expect(await item.getByRole("img", { name: rotulo, exact: true }).count()).toBe(1);
        expect(await item.getByRole("img", { name: porcentagem, exact: true }).count()).toBe(1);
      }
      expect(await lista.count()).toBe(1);
      expect(
        await resumo.getByText("1 presença parcial", { exact: false }).count(),
      ).toBeGreaterThan(0);
      await grafico.locator(".recharts-pie-sector").nth(2).dispatchEvent("mouseover");
      await expect
        .poll(() => grafico.getByText("Presentes: 94 presenças", { exact: true }).isVisible())
        .toBe(true);
    } finally {
      await page.close();
    }
  }, 120000);
}

it("mantém a mensagem semanal vazia e os padrões das roscas de faltas", async () => {
  const page = await browser.newPage();
  try {
    await abrir(page, "vazio");
    expect(await page.getByText("Nenhuma chamada salva nesta semana").count()).toBe(1);
    expect(await page.getByText("Nenhuma falta registrada").count()).toBe(1);
    const antiga = page.getByRole("region", { name: "Rosca de faltas existente" });
    expect(
      await antiga
        .getByRole("img", { name: "Faltas por turma" })
        .locator("strong + span")
        .innerText(),
    ).toBe("faltas");
    expect(await antiga.getByRole("img", { name: "1 falta", exact: true }).count()).toBe(1);
    expect(await antiga.getByRole("img", { name: "2 faltas", exact: true }).count()).toBe(1);
    await antiga.locator(".recharts-pie-sector").nth(1).dispatchEvent("mouseover");
    await expect
      .poll(() => antiga.getByText("Turma B: 2 faltas", { exact: true }).isVisible())
      .toBe(true);
  } finally {
    await page.close();
  }
}, 120000);

it("usa o singular no total e na fatia semanal", async () => {
  const page = await browser.newPage();
  try {
    await abrir(page, "singular");
    const resumo = page.getByRole("region", { name: "Resumo da semana" });
    const grafico = resumo.getByRole("img", {
      name: "Faltas, justificadas e presentes de 1º ano A",
    });
    await grafico.scrollIntoViewIfNeeded({ timeout: 90000 });
    expect(await grafico.getAttribute("aria-label")).toBe(
      "Faltas, justificadas e presentes de 1º ano A: 1 registro (F + FJ + P)",
    );
    const item = resumo
      .locator("li")
      .filter({ has: page.getByText("Justificadas", { exact: true }) });
    expect(await item.getByRole("img", { name: "1 falta justificada", exact: true }).count()).toBe(
      1,
    );
  } finally {
    await page.close();
  }
}, 120000);

it("não diz que falta chamada salva quando há apenas presença parcial", async () => {
  const page = await browser.newPage();
  try {
    await abrir(page, "parcial");
    const resumo = page.getByRole("region", { name: "Resumo da semana" });
    await expect.poll(() => resumo.getAttribute("aria-busy")).toBe("false");
    expect(await page.getByText("Nenhum registro F, FJ ou P nesta semana").count()).toBe(1);
    expect(await page.getByText("Nenhuma chamada salva nesta semana").count()).toBe(0);
    expect(await page.getByText("1 presença parcial", { exact: false }).count()).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
}, 120000);
