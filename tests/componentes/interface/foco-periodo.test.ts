// Regressões do componente real isolado: sem aplicativo, banco ou autenticação.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, webkit, expect as verificar, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";

// O foco pode demorar a voltar no WebKit sob carga; a espera padrão é curta.
const ESPERA_FOCO = { timeout: 5_000 };

const requireVitest = createRequire(import.meta.url);
const vite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(vite).href);
const cache = mkdtempSync(path.join(tmpdir(), "foco-periodo-vite-"));
let servidor: Awaited<ReturnType<typeof createServer>>;
let url: string;
let webkitDisponivel = true;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/foco-periodo.html`;
  // WebKit depende de bibliotecas do sistema. Em hosts sem elas, os testes do
  // motor são pulados em vez de derrubar a suíte do Chromium.
  try {
    const navegador = await webkit.launch({ headless: true });
    await navegador.close();
  } catch {
    webkitDisponivel = false;
  }
}, 120000);
afterAll(async () => {
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

it("PageUp e PageDown mantêm o foco no mês de destino quando o primeiro dia é domingo", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${url}?cenario=troca-de-mes`);
    const gatilho = page.getByRole("button", { name: /^Dia:/ });
    await gatilho.press("Enter");
    const calendario = page.getByRole("dialog", { name: "Dia" });
    const dia = (data: string) => calendario.getByRole("button", { name: new RegExp(`^${data}`) });
    const cabecalho = calendario.locator('[aria-live="polite"]');
    await verificar(dia("1 de dezembro")).toBeFocused(ESPERA_FOCO);
    await page.keyboard.press("PageUp");
    await verificar(cabecalho).toHaveText(/novembro de 2026/i);
    await verificar(dia("2 de novembro")).toBeFocused(ESPERA_FOCO);
    await page.keyboard.press("PageDown");
    await verificar(cabecalho).toHaveText(/dezembro de 2026/i);
    await verificar(dia("2 de dezembro")).toBeFocused(ESPERA_FOCO);
    await calendario.getByRole("button", { name: "Mês anterior" }).click();
    await verificar(cabecalho).toHaveText(/novembro de 2026/i);
    await verificar(dia("2 de novembro")).toBeFocused(ESPERA_FOCO);
    await calendario.getByRole("button", { name: "Mês seguinte" }).click();
    await verificar(dia("2 de dezembro")).toBeFocused(ESPERA_FOCO);
    await verificar(calendario.getByRole("button", { name: "Mês seguinte" })).toBeDisabled();
    await page.keyboard.press("PageDown");
    await verificar(dia("19 de dezembro")).toBeFocused(ESPERA_FOCO);
    await page.keyboard.press("Enter");
    await verificar(gatilho).toHaveAccessibleName(/2026-12-19/);
    await verificar(gatilho).toBeFocused(ESPERA_FOCO);
  } finally {
    await browser.close();
  }
});

it("o calendário semanal ignora um domingo de resumo futuro no limite inferior", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${url}?cenario=resumo-futuro`);
    const gatilho = page.getByRole("button", { name: /^Dia:/ });
    await gatilho.press("Enter");
    const calendario = page.getByRole("dialog", { name: "Dia" });
    await verificar(calendario.getByRole("button", { name: /^1 de novembro/ })).toBeDisabled();
    const segunda = calendario.getByRole("button", { name: /^2 de novembro/ });
    await verificar(segunda).toBeFocused(ESPERA_FOCO);
    await page.keyboard.press("ArrowLeft");
    await verificar(segunda).toBeFocused(ESPERA_FOCO);
    await page.keyboard.press("Enter");
    await verificar(gatilho).toHaveAccessibleName(/2026-11-02/);
    await verificar(gatilho).toBeFocused(ESPERA_FOCO);
  } finally {
    await browser.close();
  }
});

it("o seletor sem domingo fica desabilitado quando não há dia elegível", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(`${url}?cenario=so-domingo`);
    const gatilho = page.getByRole("button", { name: /^Dia:/ });
    await verificar(gatilho).toBeDisabled();
    await page.keyboard.press("Tab");
    await verificar(page.getByRole("button", { name: /^Mês:/ })).toBeFocused(ESPERA_FOCO);
    await verificar(page.getByRole("dialog", { name: "Dia" })).not.toBeAttached();
  } finally {
    await browser.close();
  }
});

async function abrirFixture(page: Page, modo: "dia" | "mes") {
  await page.goto(url);
  await page.locator('[data-fixture-montado="true"]').waitFor({ state: "visible" });
  const gatilho = page.locator(`#${modo}`);
  await expect.poll(() => gatilho.isVisible()).toBe(true);
  await expect.poll(() => gatilho.isEnabled()).toBe(true);
  // Tab é intencional: não substituir por focus(), pois isso esconderia falhas de navegação.
  await page.keyboard.press("Tab");
  if (modo === "mes") await page.keyboard.press("Tab");
  expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
  return gatilho;
}

for (const [motor, tipo] of [
  ["chromium", chromium],
  ["webkit", webkit],
] as const) {
  for (const modo of ["dia", "mes"] as const) {
    for (const tecla of ["Enter", "Space"] as const) {
      it(`${motor}: ${modo} abre com ${tecla}, Escape devolve foco e reabre no valor`, async ({
        skip,
      }) => {
        if (motor === "webkit" && !webkitDisponivel)
          skip("WebKit indisponível: dependências de sistema ausentes no host.");
        const browser = await tipo.launch({ headless: true });
        try {
          const page = await browser.newPage({ reducedMotion: "reduce" });
          const gatilho = await abrirFixture(page, modo);
          await page.keyboard.press(tecla);
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
          const inicial =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-15"]')
              : page.getByRole("button", { name: "Outubro", exact: true });
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
          await page.keyboard.press("ArrowLeft");
          await page.keyboard.press("Escape");
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
          await expect
            .poll(() => gatilho.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
          await page.keyboard.press(tecla);
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
        } finally {
          await browser.close();
        }
      });
    }
    for (const tecla of ["Enter", "Space"] as const) {
      it(`${motor}: ${modo} seleciona data com ${tecla} e devolve foco`, async ({ skip }) => {
        if (motor === "webkit" && !webkitDisponivel)
          skip("WebKit indisponível: dependências de sistema ausentes no host.");
        const browser = await tipo.launch({ headless: true });
        try {
          const page = await browser.newPage({ reducedMotion: "reduce" });
          const gatilho = await abrirFixture(page, modo);
          await page.keyboard.press("Space");
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
          const inicial =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-15"]')
              : page.getByRole("button", { name: "Outubro", exact: true });
          await expect
            .poll(() => inicial.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
          await page.keyboard.press("ArrowLeft");
          const destino =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-14"]')
              : page.getByRole("button", { name: "Setembro", exact: true });
          await expect
            .poll(() => destino.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
          await page.keyboard.press(tecla);
          await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
          await expect
            .poll(() => gatilho.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
          expect(await gatilho.getAttribute("aria-label")).toContain(
            modo === "dia" ? "2026-10-14" : "2026-09",
          );
          await page.keyboard.press("Enter");
          const selecionado =
            modo === "dia"
              ? page.locator('[data-dia="2026-10-14"]')
              : page.getByRole("button", { name: "Setembro", exact: true });
          await expect
            .poll(() => selecionado.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
            .toBe(true);
        } finally {
          await browser.close();
        }
      });
    }
  }
  it(`${motor}: Fechar devolve foco e o gatilho alterna uma única vez`, async ({ skip }) => {
    if (motor === "webkit" && !webkitDisponivel)
      skip("WebKit indisponível: dependências de sistema ausentes no host.");
    const browser = await tipo.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const gatilho = await abrirFixture(page, "dia");
      const estado = page.getByLabel("Estado do calendário");
      await page.keyboard.press("Enter");
      await expect.poll(() => estado.textContent()).toBe("aberto");
      await page.getByRole("button", { name: "Fechar", exact: true }).focus();
      await page.keyboard.press("Space");
      await expect.poll(() => estado.textContent()).toBe("fechado");
      await expect
        .poll(() => gatilho.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
        .toBe(true);
      await gatilho.click();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
      await gatilho.click();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
    } finally {
      await browser.close();
    }
  });
  it(`${motor}: foco deslocado para outro controle não volta ao gatilho`, async ({ skip }) => {
    if (motor === "webkit" && !webkitDisponivel)
      skip("WebKit indisponível: dependências de sistema ausentes no host.");
    const browser = await tipo.launch({ headless: true });
    try {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      const gatilho = await abrirFixture(page, "dia");
      await page.keyboard.press("Enter");
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
      const externo = page.getByRole("button", { name: "Controle externo" });
      await externo.focus();
      await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
      await expect
        .poll(() => externo.evaluate((el) => el === document.activeElement), ESPERA_FOCO)
        .toBe(true);
    } finally {
      await browser.close();
    }
  });
  for (const toque of [false, true]) {
    it(`${motor}: ${toque ? "toque" : "clique"} fora ativa outro controle sem devolver foco`, async ({
      skip,
    }) => {
      if (motor === "webkit" && !webkitDisponivel)
        skip("WebKit indisponível: dependências de sistema ausentes no host.");
      const browser: Browser = await tipo.launch({ headless: true });
      try {
        const page = await browser.newPage({ hasTouch: toque, reducedMotion: "reduce" });
        const gatilho = await abrirFixture(page, "dia");
        await page.keyboard.press("Enter");
        await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("true");
        const externo = page.getByRole("button", { name: "Controle externo" });
        if (toque) await externo.tap();
        else await externo.click();
        await expect.poll(() => gatilho.getAttribute("aria-expanded")).toBe("false");
        await expect.poll(() => page.getByLabel("Ativações externas").textContent()).toBe("1");
        expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(false);
      } finally {
        await browser.close();
      }
    });
  }
}
