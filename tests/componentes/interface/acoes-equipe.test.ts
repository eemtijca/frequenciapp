// Verifica a apresentação e a confirmação das ações da equipe no navegador.
import path from "node:path";
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
let browser: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/acoes-equipe.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
for (const tema of ["light", "dark"] as const) {
  it(`ações de contas sem fundos repetidos em ${tema}`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      let alteracoes = 0;
      await page.route("**/api/usuarios**", async (route) => {
        if (route.request().method() !== "GET") alteracoes += 1;
        await route.fulfill({
          json: {
            usuarios: [
              {
                id: "admin",
                nome: "Direção",
                email: "direcao@escola.exemplo",
                papel: "ADMIN",
                ativo: true,
              },
              {
                id: "coord",
                nome: "Demo",
                email: "demo@escola.exemplo",
                papel: "COORDENACAO",
                ativo: true,
              },
            ],
          },
        });
      });
      await page.goto(url);
      await page.evaluate((valor) => document.documentElement.classList.add(valor), tema);
      const excluir = page.getByRole("button", { name: "Excluir conta de Demo" });
      await excluir.waitFor({ timeout: 90000 });
      await page.mouse.move(0, 0);
      const acoes = [
        page.getByRole("button", { name: "Editar conta de Demo" }),
        page.getByRole("button", { name: "Desativar conta de Demo" }),
        excluir,
      ];
      for (const botao of acoes) {
        expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
          "rgba(0, 0, 0, 0)",
        );
        const caixa = await botao.boundingBox();
        expect(caixa?.width).toBeGreaterThanOrEqual(44);
        expect(caixa?.height).toBeGreaterThanOrEqual(44);
      }
      const principal = page.getByRole("button", { name: "Nova conta" });
      expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      await excluir.focus();
      expect(await excluir.evaluate((el) => document.activeElement === el)).toBe(true);
      await page.keyboard.press("Enter");
      const dialogo = page.getByRole("alertdialog");
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      expect(alteracoes).toBe(0);
      await expect.poll(() => excluir.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  }, 120000);
}
