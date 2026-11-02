import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const req = createRequire(import.meta.url);
const vite = req.resolve("vite", { paths: [path.dirname(req.resolve("vitest/package.json"))] });
const { createServer } = await import(pathToFileURL(vite).href);
let server: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${address.port}/tests/componentes/interface/outline-telas.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
async function abrir(page: Page, tema = "light", salva = false) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        frequencias: salva
          ? [
              {
                dia: "2026-10-19",
                turmaId: "A",
                revisao: 1,
                alunos: ["A"],
                faltas: [{ alunoId: "A", horarios: ["A-1", "A-2"] }],
              },
            ]
          : [],
        alertas: [],
        resumo: { porAluno: [] },
        registros: [],
      },
    }),
  );
  await page.goto(url);
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  await page.evaluate((valor) => {
    document.documentElement.className = valor;
  }, tema);
  await page.getByRole("button", { name: /Resumo de hoje/ }).click();
}
async function transparente(botao: Locator) {
  expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );
  expect(await botao.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  const box = await botao.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
}
it("contorna os filtros inativos da chamada", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await abrir(page);
    for (const nome of ["Faltas", "Justificadas", "Presentes"])
      await transparente(page.getByRole("button", { name: new RegExp(nome) }));
  } finally {
    await page.close();
  }
});
it("contorna somente o cartão de dia clicável", async () => {
  const page = await browser.newPage();
  try {
    await abrir(page);
    await transparente(page.getByRole("button", { name: "Abrir segunda" }));
    expect(
      await page.getByRole("group", { name: "Terça indisponível" }).getAttribute("class"),
    ).not.toContain("controle-contornado");
  } finally {
    await page.close();
  }
});
it("contorna a turma inativa da grade", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await abrir(page);
    await transparente(
      page.getByRole("region", { name: "Grade" }).getByRole("button", { name: /Turma B/ }),
    );
  } finally {
    await page.close();
  }
});

async function estilo(botao: Locator) {
  return botao.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      fundo: s.backgroundColor,
      borda: s.borderTopColor,
      texto: s.color,
      outline: s.outlineWidth,
      sombra: s.boxShadow,
    };
  });
}
async function paridadeSemVariante(botao: Locator) {
  const com = await estilo(botao);
  const sem = await botao.evaluate((el) => {
    const tinhaVariante = el.classList.contains("controle-contornado");
    el.classList.remove("controle-contornado");
    const s = getComputedStyle(el);
    const resultado = {
      fundo: s.backgroundColor,
      borda: s.borderTopColor,
      texto: s.color,
      outline: s.outlineWidth,
      sombra: s.boxShadow,
    };
    if (tinhaVariante) el.classList.add("controle-contornado");
    return resultado;
  });
  expect(com).toEqual(sem);
}
for (const tema of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    it(`preserva interação e cores em ${tema}, ${width}px`, async () => {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await abrir(page, tema);
        const filtros = ["Faltas", "Justificadas", "Presentes"].map((nome) =>
          page.getByRole("button", { name: new RegExp(nome) }),
        );
        for (const filtro of filtros) {
          await page.keyboard.press("Tab");
          await filtro.focus();
          const focoFiltro = await estilo(filtro);
          expect(focoFiltro.outline !== "0px" || focoFiltro.sombra !== "none").toBe(true);
          if (tema === "dark") await paridadeSemVariante(filtro);
          await page.keyboard.press("Enter");
          expect(await filtro.getAttribute("aria-pressed")).toBe("true");
          await filtro.evaluate((el) => el.blur());
          await page.mouse.move(0, 0);
          expect((await estilo(filtro)).fundo).not.toBe("rgba(0, 0, 0, 0)");
          await paridadeSemVariante(filtro);
          await filtro.click();
          expect(await filtro.getAttribute("aria-pressed")).toBe("false");
        }
        const dia = page.getByRole("button", { name: "Abrir segunda" });
        await page.keyboard.press("Tab");
        await dia.focus();
        const foco = await estilo(dia);
        expect(foco.outline !== "0px" || foco.sombra !== "none").toBe(true);
        if (tema === "dark") await paridadeSemVariante(dia);
        await page.keyboard.press("Enter");
        expect(await page.locator("body").getAttribute("data-abriu")).toBe("sim");
        if (tema === "dark") {
          await page.mouse.move(0, 0);
          await paridadeSemVariante(dia);
          for (const filtro of filtros) await paridadeSemVariante(filtro);
        } else {
          await page.mouse.move(0, 0);
          await transparente(dia);
          await dia.hover();
          expect((await estilo(dia)).fundo).not.toBe("rgba(0, 0, 0, 0)");
        }
        if (width === 1280) {
          const grade = page.getByRole("region", { name: "Grade" });
          const a = grade.getByRole("button", { name: /Turma A/ });
          const b = grade.getByRole("button", { name: /Turma B/ });
          expect(await a.getAttribute("aria-pressed")).toBe("true");
          await page.mouse.move(0, 0);
          await paridadeSemVariante(a);
          if (tema === "dark") await paridadeSemVariante(b);
          await page.keyboard.press("Tab");
          await b.focus();
          const focoTurma = await estilo(b);
          expect(focoTurma.outline !== "0px" || focoTurma.sombra !== "none").toBe(true);
          if (tema === "dark") await paridadeSemVariante(b);
          await page.keyboard.press("Space");
          expect(await b.getAttribute("aria-pressed")).toBe("true");
          expect(await a.getAttribute("aria-pressed")).toBe("false");
        }
        if (process.env.OUTLINE_TELAS_CAPTURAS)
          await page.screenshot({
            path: path.join(process.env.OUTLINE_TELAS_CAPTURAS, `${tema}-${width}.png`),
            fullPage: true,
          });
      } finally {
        await page.close();
      }
    });
  }
}
it("mantém semântica das faltas por aula e bloqueio", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    await abrir(page);
    const aluno = page.getByRole("button", { name: /Aluno A: presente/ });
    await aluno.click();
    await page.getByRole("button", { name: "Aulas em que Aluno A faltou" }).click();
    const aula = page.getByRole("button", { name: "1ª 07:00" });
    expect(await aula.getAttribute("aria-pressed")).toBe("true");
    const marcada = await estilo(aula);
    expect(await aula.getAttribute("class")).not.toContain("controle-contornado");
    await aula.click();
    expect(await aula.getAttribute("aria-pressed")).toBe("false");
    expect((await estilo(aula)).fundo).not.toBe(marcada.fundo);
    expect((await aula.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  } finally {
    await page.close();
  }
  const bloqueada = await browser.newPage();
  try {
    await abrir(bloqueada, "light", true);
    const aluno = bloqueada.getByRole("button", { name: /Aluno A: falta/ });
    await aluno.waitFor();
    expect(await aluno.isDisabled()).toBe(true);
  } finally {
    await bloqueada.close();
  }
});

it("preserva seleção com cores forçadas", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    forcedColors: "active",
    reducedMotion: "reduce",
  });
  try {
    await abrir(page);
    const filtro = page.getByRole("button", { name: /Faltas/ });
    await filtro.click();
    await filtro.evaluate((el) => el.blur());
    await page.mouse.move(0, 0);
    expect(await filtro.getAttribute("aria-pressed")).toBe("true");
    expect((await estilo(filtro)).outline).not.toBe("0px");
    await paridadeSemVariante(filtro);
    const turma = page
      .getByRole("region", { name: "Grade" })
      .getByRole("button", { name: /Turma A/ });
    expect((await estilo(turma)).outline).not.toBe("0px");
    await paridadeSemVariante(turma);
  } finally {
    await page.close();
  }
});
