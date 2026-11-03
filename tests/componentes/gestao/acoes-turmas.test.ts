// Verifica fundos, alvos e ações de turmas e aulas nos componentes reais.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { conferirSuperficieAcao } from "../superficie-acao";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/gestao/acoes-turmas.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
async function conferirAcao(botao: Locator) {
  await botao.waitFor({ state: "visible" });
  const estado = await botao.evaluate((el) => {
    const retangulo = el.getBoundingClientRect();
    return {
      fundo: getComputedStyle(el).backgroundColor,
      largura: retangulo.width,
      altura: retangulo.height,
    };
  });
  expect(estado.fundo).toBe("rgba(0, 0, 0, 0)");
  expect(estado.largura).toBeGreaterThanOrEqual(44);
  expect(estado.altura).toBeGreaterThanOrEqual(44);
}
for (const tema of ["light", "dark"] as const) {
  for (const largura of [390, 1280]) {
    it(`ações de turma sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({
        viewport: { width: largura, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await page.goto(url);
        await page.getByRole("button", { name: "Horários de 1º ano A" }).waitFor();
        await page.evaluate(
          (escuro) => document.documentElement.classList.toggle("dark", escuro),
          tema === "dark",
        );
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
          tema === "dark",
        );
        for (const nome of [
          "Horários de 1º ano A",
          "Editar turma 1º ano A",
          "Excluir turma 1º ano A",
        ]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        expect(
          await page
            .getByRole("button", { name: "Nova turma" })
            .evaluate((el) => getComputedStyle(el).backgroundColor),
        ).not.toBe("rgba(0, 0, 0, 0)");
      } finally {
        await page.close();
      }
    });
    it(`ações de aula sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({
        viewport: { width: largura, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await page.goto(url);
        await page.getByRole("button", { name: "Horários de 1º ano A" }).waitFor();
        await page.evaluate(
          (escuro) => document.documentElement.classList.toggle("dark", escuro),
          tema === "dark",
        );
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
          tema === "dark",
        );
        await page.getByRole("button", { name: "Horários de 1º ano A" }).click();
        await page.mouse.move(0, 0);
        for (const nome of ["Editar aula 1", "Desativar aula 1", "Excluir aula 1"]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        const excluir = page.getByRole("button", { name: "Excluir aula 1" });
        const cores = await excluir.evaluate((el) => {
          const amostra = document.createElement("span");
          amostra.style.color = "var(--falta-texto)";
          el.appendChild(amostra);
          const resultado = [getComputedStyle(el).color, getComputedStyle(amostra).color];
          amostra.remove();
          return resultado;
        });
        expect(cores[0]).toBe(cores[1]);
        const nova = page.getByRole("button", { name: "Nova aula" });
        await conferirSuperficieAcao(page, nova, tema);
        await nova.press("Enter");
        expect(await page.getByRole("button", { name: "Cancelar", exact: true }).isVisible()).toBe(
          true,
        );
      } finally {
        await page.close();
      }
    });
  }
}
it("teclado, seleção e confirmações preservam ações e exclusões", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const exclusoes: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      if (route.request().method() === "DELETE")
        exclusoes.push(new URL(route.request().url()).pathname);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(url);
    const horarios = page.getByRole("button", { name: "Horários de 1º ano A" });
    await horarios.focus();
    expect(await horarios.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(
      await horarios.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await page.keyboard.press("Enter");
    const editar = page.getByRole("button", { name: "Editar aula 1" });
    await editar.click();
    const segunda = page.getByRole("button", { name: "segunda-feira" });
    expect(await segunda.getAttribute("aria-pressed")).toBe("true");
    await segunda.click();
    expect(await segunda.getAttribute("aria-pressed")).toBe("false");
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Excluir aula 1" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(exclusoes).toEqual([]);
    await page.getByRole("button", { name: "Excluir aula 1" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => exclusoes).toEqual(["/api/horarios/aula-1"]);
    await expect.poll(() => page.getByRole("button", { name: "Nova aula" }).isEnabled()).toBe(true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Excluir turma 1º ano A" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(exclusoes).toEqual(["/api/horarios/aula-1"]);
    await page.getByRole("button", { name: "Excluir turma 1º ano A" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => exclusoes).toEqual(["/api/horarios/aula-1", "/api/turmas/turma-a"]);
  } finally {
    await page.close();
  }
});
