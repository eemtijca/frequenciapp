// Controles locais reais e acessibilidade, em navegador sem banco.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
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
  url = `http://127.0.0.1:${address.port}/tests/componentes/interface/outline-chamada.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it("contorna os controles neutros claros sem ocultar a seleção ou conclusão", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({ json: { registros: [], podeEnviar: false } }),
    );
    await page.goto(url);
    await page.evaluate(() => {
      document.documentElement.className = "light";
    });
    await page.getByRole("button", { name: "Turmas", exact: true }).click();
    const pendente = page.getByRole("button", { name: "1º ano C", exact: true });
    const selecionada = page.getByRole("button", { name: "1º ano A", exact: true });
    const concluida = page.getByRole("button", { name: "1º ano B", exact: true });
    const registrar = page.getByRole("button", { name: "Registrar frequência parcial de Aluno A" });
    await registrar.waitFor();
    for (const botao of [pendente, registrar]) {
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        "rgba(0, 0, 0, 0)",
      );
      const caixa = await botao.boundingBox();
      expect(caixa?.height).toBeGreaterThanOrEqual(44);
      expect(caixa?.width).toBeGreaterThanOrEqual(44);
    }
    expect(await selecionada.getAttribute("aria-pressed")).toBe("true");
    expect(await selecionada.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(await concluida.getAttribute("data-situacao")).toBe("concluida");
    expect(await concluida.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    const cores = await page.evaluate(() => {
      const canvas = document.createElement("canvas").getContext("2d");
      const selecionada = document.querySelector('[aria-label="1º ano A"]');
      const concluida = document.querySelector('[aria-label="1º ano B"] [data-progresso]');
      if (!canvas || !selecionada || !concluida)
        throw new Error("Controles ou canvas indisponíveis");
      const normalizar = (valor: string) => {
        canvas.fillStyle = valor;
        return canvas.fillStyle;
      };
      return {
        selecao: normalizar(getComputedStyle(selecionada).outlineColor),
        azul: normalizar(
          getComputedStyle(document.documentElement).getPropertyValue("--justificada"),
        ),
        conclusao: normalizar(getComputedStyle(concluida).color),
        verde: normalizar(getComputedStyle(document.documentElement).getPropertyValue("--primary")),
      };
    });
    expect(cores.selecao).toBe(cores.azul);
    expect(cores.conclusao).toBe(cores.verde);
    expect(cores.selecao).not.toBe(cores.conclusao);
    expect(await pendente.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px");
    expect(await registrar.evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px");
    if (process.env.OUTLINE_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.OUTLINE_SCREENSHOTS, "outline-chamada-claro.png"),
        fullPage: true,
      });
    await page.keyboard.press("Tab");
    await pendente.focus();
    expect(await pendente.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("3px");
    await registrar.focus();
    expect(await registrar.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    await page.getByRole("button", { name: "Alternar bloqueio" }).click();
    expect(await pendente.isDisabled()).toBe(true);
    expect(Number(await pendente.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    await page.getByRole("button", { name: "Alternar bloqueio" }).click();
    await registrar.click();
    expect(await page.getByRole("dialog").isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

it("mantém os preenchimentos e a interação no tema escuro", async () => {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({ json: { registros: [], podeEnviar: false } }),
    );
    await page.goto(url);
    await page.evaluate(() => {
      document.documentElement.className = "dark";
    });
    await page.getByRole("button", { name: "Turmas", exact: true }).click();
    const pendente = page.getByRole("button", { name: "1º ano C", exact: true });
    const registrar = page.getByRole("button", { name: "Registrar frequência parcial de Aluno A" });
    await registrar.waitFor();
    expect(await pendente.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(await registrar.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    if (process.env.OUTLINE_SCREENSHOTS)
      await page.screenshot({
        path: path.join(process.env.OUTLINE_SCREENSHOTS, "outline-chamada-escuro.png"),
        fullPage: true,
      });
    await registrar.click();
    expect(await page.getByRole("dialog").isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});
