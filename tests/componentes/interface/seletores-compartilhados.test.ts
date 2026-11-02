// Seletores reais e CSS de produção, isolados do banco.
import path from "node:path";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const vite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(vite).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const cache = mkdtempSync(path.join(tmpdir(), "seletores-vite-"));
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/seletores-compartilhados.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

it("registra estilos escuros de referência", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    await page.evaluate(() => {
      document.documentElement.className = "dark";
    });
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains("dark") &&
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim() ===
          "oklch(0.19 0.004 90)",
    );
    const ano = page.getByRole("button", { name: "Ano letivo", exact: true });
    await ano.waitFor();
    const style = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        border: s.borderColor,
        color: s.color,
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      };
    };
    const normal = await ano.evaluate(style);
    await page.keyboard.press("Tab");
    const foco = await ano.evaluate(style);
    await ano.click();
    const seta = await page.getByRole("button", { name: "Próximo bloco de anos" }).evaluate(style);
    const selecionado = await page
      .getByRole("button", { name: "2024", exact: true })
      .evaluate(style);
    const hora = await page
      .getByRole("button", { name: "Horário de entrada: 08:30" })
      .evaluate(style);
    const desabilitado = await page.getByRole("button", { name: "Ano bloqueado" }).evaluate(style);
    const resultado = { normal, foco, seta, selecionado, hora, desabilitado };
    expect(resultado).toEqual({
      normal: {
        background: "oklch(0.282 0.006 90)",
        border: "rgba(0, 0, 0, 0)",
        color: "oklch(0.945 0.003 90)",
        outline: "none 3px oklab(0.6 -0.0939693 0.034202 / 0.5)",
      },
      foco: {
        background: "oklch(0.282 0.006 90)",
        border: "rgba(0, 0, 0, 0)",
        color: "oklch(0.945 0.003 90)",
        outline: "none 2px oklch(0.6 0.1 160)",
      },
      seta: {
        background: "oklch(0.282 0.006 90)",
        border: "rgba(0, 0, 0, 0)",
        color: "oklch(0.945 0.003 90)",
        outline: "none 3px oklab(0.6 -0.0939693 0.034202 / 0.5)",
      },
      selecionado: {
        background: "oklab(0.28816 -0.0146592 0.00973551)",
        border: "oklab(0.7 -0.12216 0.0444626 / 0.25)",
        color: "oklch(0.7 0.13 160)",
        outline: "none 2px oklch(0.6 0.1 160)",
      },
      hora: {
        background: "oklch(0.282 0.006 90)",
        border: "rgba(0, 0, 0, 0)",
        color: "oklch(0.945 0.003 90)",
        outline: "none 3px oklab(0.6 -0.0939693 0.034202 / 0.5)",
      },
      desabilitado: {
        background: "oklch(0.282 0.006 90)",
        border: "rgba(0, 0, 0, 0)",
        color: "oklch(0.945 0.003 90)",
        outline: "none 3px oklab(0.6 -0.0939693 0.034202 / 0.5)",
      },
    });
  } finally {
    await page.close();
  }
});

it.each(["Ano letivo", "Horário de entrada: 08:30"])(
  "gatilho %s usa contorno neutro no tema claro",
  async (nome) => {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    try {
      await page.goto(url);
      const botao = page.getByRole("button", { name: nome, exact: true });
      await botao.waitFor();
      const estilo = await botao.evaluate((el) => ({
        fundo: getComputedStyle(el).backgroundColor,
        borda: getComputedStyle(el).borderColor,
      }));
      expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
      expect(estilo.borda).toBe("rgb(217, 221, 218)");
    } finally {
      await page.close();
    }
  },
);

it("navegação entre blocos do seletor de ano usa contorno neutro", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    await page.getByRole("button", { name: "Ano letivo", exact: true }).click();
    for (const nome of ["Bloco de anos anterior", "Próximo bloco de anos"]) {
      const botao = page.getByRole("button", { name: nome });
      const estilo = await botao.evaluate((el) => ({
        fundo: getComputedStyle(el).backgroundColor,
        borda: getComputedStyle(el).borderColor,
      }));
      expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
      expect(estilo.borda).toBe("rgb(217, 221, 218)");
    }
  } finally {
    await page.close();
  }
});

for (const largura of [320, 390, 1280]) {
  for (const tema of ["light", "dark"] as const) {
    it(`seletores acessíveis em ${largura}px ${tema}`, async () => {
      const page = await browser.newPage({
        viewport: { width: largura, height: 844 },
        reducedMotion: "reduce",
      });
      try {
        await page.goto(url);
        await page.evaluate((t) => {
          document.documentElement.className = t;
        }, tema);
        await page.waitForFunction((classe) => {
          const html = document.documentElement;
          if (!html.classList.contains(classe)) return false;
          const fundo = getComputedStyle(html).getPropertyValue("--background").trim();
          return classe === "dark" ? fundo === "oklch(0.19 0.004 90)" : fundo === "#f6f6f6";
        }, tema);
        const ano = page.getByRole("button", { name: "Ano letivo", exact: true });
        const hora = page.getByRole("button", { name: "Horário de entrada: 08:30" });
        const periodo = page.getByRole("button", { name: "Mês avulso: Outubro" });
        await ano.waitFor();
        for (const botao of [ano, hora, periodo]) {
          const box = await botao.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(43.99);
          expect(box?.width).toBeGreaterThanOrEqual(43.99);
          expect((box?.x ?? -1) + (box?.width ?? largura + 1)).toBeLessThanOrEqual(largura + 0.01);
          const contraste = await botao.evaluate((el) => {
            const ctx = document.createElement("canvas").getContext("2d");
            if (!ctx) throw new Error("Canvas indisponível");
            const rgb = (cor: string) => {
              ctx.clearRect(0, 0, 1, 1);
              ctx.fillStyle = cor;
              ctx.fillRect(0, 0, 1, 1);
              return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
            };
            const lum = (cor: number[]) =>
              cor
                .map((v) => v / 255)
                .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
            const ratio = (a: string, b: string) => {
              const x = lum(rgb(a));
              const y = lum(rgb(b));
              return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            const s = getComputedStyle(el);
            const bg =
              s.backgroundColor === "rgba(0, 0, 0, 0)"
                ? getComputedStyle(document.body).backgroundColor
                : s.backgroundColor;
            const icone = el.querySelector("svg:not(.hidden)") ?? el.querySelector("svg");
            return {
              texto: ratio(s.color, bg),
              icone: icone ? ratio(getComputedStyle(icone).color, bg) : 0,
            };
          });
          expect(contraste.texto).toBeGreaterThanOrEqual(4.5);
          expect(contraste.icone).toBeGreaterThanOrEqual(3);
        }
        expect(await page.getByRole("button", { name: "Ano bloqueado" }).isDisabled()).toBe(true);
        expect(
          await page.getByRole("button", { name: "Horário bloqueado: 08:30" }).isDisabled(),
        ).toBe(true);
        if (process.env.CAPTURAS_SELETORES)
          await page.screenshot({
            path: `${process.env.CAPTURAS_SELETORES}/${largura}-${tema}-controles.png`,
          });
        await page.keyboard.press("Tab");
        expect(await ano.evaluate((el) => el === document.activeElement)).toBe(true);
        if (tema === "light") {
          const foco = await ano.evaluate((el) => ({
            style: getComputedStyle(el).outlineStyle,
            width: getComputedStyle(el).outlineWidth,
          }));
          expect(foco).toEqual({ style: "solid", width: "2px" });
        }
        await page.keyboard.press("Enter");
        const selecionado = page.getByRole("button", { name: "2024", exact: true });
        expect(await selecionado.getAttribute("aria-pressed")).toBe("true");
        expect(
          await page.getByRole("button", { name: "Bloco de anos anterior" }).isDisabled(),
        ).toBe(true);
        if (process.env.CAPTURAS_SELETORES)
          await page.screenshot({
            path: `${process.env.CAPTURAS_SELETORES}/${largura}-${tema}-ano.png`,
          });
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
        expect(await ano.textContent()).toContain("2025");
        await hora.focus();
        await page.keyboard.press("Enter");
        expect(
          await page
            .getByRole("listbox", { name: "Horas" })
            .getByRole("option", { name: "08", exact: true })
            .getAttribute("aria-selected"),
        ).toBe("true");
        if (process.env.CAPTURAS_SELETORES)
          await page.screenshot({
            path: `${process.env.CAPTURAS_SELETORES}/${largura}-${tema}-hora.png`,
          });
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        expect(await page.getByRole("button", { name: "Horário de entrada: 09:31" }).count()).toBe(
          1,
        );
        await periodo.focus();
        await page.keyboard.press("Enter");
        expect(
          await page
            .getByRole("button", { name: "Outubro", exact: true })
            .getAttribute("aria-pressed"),
        ).toBe("true");
        if (process.env.CAPTURAS_SELETORES)
          await page.screenshot({
            path: `${process.env.CAPTURAS_SELETORES}/${largura}-${tema}-periodo.png`,
          });
        await page.keyboard.press("Escape");
        expect(await periodo.getAttribute("aria-expanded")).toBe("false");
      } finally {
        await page.close();
      }
    });
  }
}

it("cores forçadas mantêm limite, foco e seleção persistente", async () => {
  const page = await browser.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await page.goto(url);
    const ano = page.getByRole("button", { name: "Ano letivo", exact: true });
    await ano.waitFor();
    const borda = await ano.evaluate((el) => ({
      estilo: getComputedStyle(el).borderTopStyle,
      largura: getComputedStyle(el).borderTopWidth,
      cor: getComputedStyle(el).borderTopColor,
    }));
    expect(borda.estilo).toBe("solid");
    expect(borda.largura).toBe("1px");
    expect(borda.cor).not.toBe("rgba(0, 0, 0, 0)");
    await page.keyboard.press("Tab");
    expect(await ano.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    const selecionado = page.getByRole("button", { name: "2024", exact: true });
    await page.getByRole("button", { name: "Próximo bloco de anos" }).focus();
    expect(await selecionado.getAttribute("aria-pressed")).toBe("true");
    const estilo = await selecionado.evaluate((el) => ({
      estilo: getComputedStyle(el).outlineStyle,
      largura: getComputedStyle(el).outlineWidth,
    }));
    expect(estilo).toEqual({ estilo: "solid", largura: "2px" });
  } finally {
    await page.close();
  }
});

it("seletor de mês avulso e navegação interna usam contorno claro", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    const gatilho = page.getByRole("button", { name: "Mês avulso: Outubro" });
    await gatilho.waitFor();
    const verificar = async (botao: typeof gatilho) => {
      const estilo = await botao.evaluate((el) => ({
        fundo: getComputedStyle(el).backgroundColor,
        borda: getComputedStyle(el).borderColor,
      }));
      expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
      expect(estilo.borda).toBe("rgb(217, 221, 218)");
    };
    await verificar(gatilho);
    await gatilho.click();
    await verificar(page.getByRole("button", { name: "Ano anterior" }));
    await verificar(page.getByRole("button", { name: "Ano seguinte" }));
  } finally {
    await page.close();
  }
});
