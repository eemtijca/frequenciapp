// Navegação de data das telas reais, executada em Chromium sem banco.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
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
const cache = mkdtempSync(path.join(tmpdir(), "periodos-vite-"));
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    plugins: process.env.TESTAR_SEM_CONTORNO
      ? [
          {
            name: "teste-red-sem-contorno",
            transform(code: string, id: string) {
              if (
                /src\/components\/(relatorios\/(por-aluno|vista-resumo-relatorios|historico\/vista-historico)|diretor\/vista-minhas-turmas)\.tsx$/.test(
                  id,
                )
              )
                return code.replace("navegacao-dia ", "");
            },
          },
        ]
      : [],
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/navegacao-data.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

/** Espera a classe e a pintura real do body antes de medir contrastes. */
async function aguardarTema(page: Page, tema: "light" | "dark") {
  await page.waitForFunction((valor) => {
    const raiz = document.documentElement;
    if (!raiz.classList.contains(valor)) return false;
    const token = getComputedStyle(raiz).getPropertyValue("--background").trim();
    if (valor === "dark" ? token !== "oklch(0.19 0.004 90)" : token !== "#f6f6f6") return false;
    const corpo = getComputedStyle(document.body).backgroundColor;
    if (corpo === "rgba(0, 0, 0, 0)") return false;
    const contexto = document.createElement("canvas").getContext("2d");
    if (!contexto) return false;
    contexto.clearRect(0, 0, 1, 1);
    contexto.fillStyle = corpo;
    contexto.fillRect(0, 0, 1, 1);
    const r = contexto.getImageData(0, 0, 1, 1).data[0] ?? 0;
    return valor === "dark" ? r < 80 : r > 180;
  }, tema);
}

it("no painel claro o resumo usa fundo suave e fio sutil", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel`);
    const anterior = page.getByRole("button", { name: "Dia anterior", exact: true });
    const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
    const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
    for (const botao of [anterior, periodo, seguinte]) {
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(await botao.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
    }
  } finally {
    await page.close();
  }
});

// As demais visões usam o mesmo padrão, mas cada uma monta a sua própria navegação.
it.each(["chamada", "parcial", "entradas", "saidas"])(
  "aplica a superfície com fio sutil à navegação da tela %s",
  async (tela) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.route("**/api/**", (route) =>
        route.fulfill({
          json: {
            frequencias: [],
            saidas: [],
            entradas: [],
            feriados: [],
            alertas: [],
            registros: [],
          },
        }),
      );
      await page.goto(`${url}?tela=${tela}`);
      const anterior = page.getByRole("button", { name: /^Dia anterior/ }).first();
      const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
      const seguinte = page.getByRole("button", { name: /^Dia seguinte/ }).first();
      for (const botao of [anterior, periodo, seguinte]) {
        expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        expect(await botao.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
      }
    } finally {
      await page.close();
    }
  },
);

it("foco de teclado no seletor claro tem contorno com contraste contra a superfície", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel`);
    const botao = page.getByRole("button", { name: "Dia anterior", exact: true });
    await page.keyboard.press("Tab");
    await botao.focus();
    const foco = await botao.evaluate((el) => {
      const estilo = getComputedStyle(el);
      const tela = getComputedStyle(document.body).backgroundColor;
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
      const a = lum(rgb(estilo.outlineColor));
      const b = lum(rgb(tela));
      return {
        visible: el.matches(":focus-visible"),
        width: parseFloat(estilo.outlineWidth),
        style: estilo.outlineStyle,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
    expect(foco.visible).toBe(true);
    expect(foco.style).toBe("solid");
    expect(foco.width).toBeGreaterThanOrEqual(2);
    expect(foco.contrast).toBeGreaterThanOrEqual(3);
  } finally {
    await page.close();
  }
});

for (const largura of [320, 390, 1280]) {
  for (const tema of ["light", "dark"] as const) {
    it(`navegação responsiva e acessível nas cinco visões: ${largura}px ${tema}`, async () => {
      for (const tela of ["painel", "chamada", "parcial", "entradas", "saidas"]) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await page.route("**/api/**", (route) =>
            route.fulfill({
              json: {
                frequencias: [],
                saidas: [],
                entradas: [],
                feriados: [],
                alertas: [],
                registros: [],
                porAluno: [],
                diasLetivos: 0,
                primeiroDia: null,
              },
            }),
          );
          await page.goto(`${url}?tela=${tela}`);
          await page.evaluate((valor) => {
            document.documentElement.className = valor;
          }, tema);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", { name: /^Dia anterior/ }).first();
          const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
          const seguinte = page.getByRole("button", { name: /^Dia seguinte/ }).first();
          await anterior.waitFor();
          await periodo.waitFor();
          expect(await seguinte.isDisabled()).toBe(tela !== "parcial");
          const caixas = await Promise.all(
            [anterior, periodo, seguinte].map((el) => el.boundingBox()),
          );
          for (const caixa of caixas) {
            if (!caixa) throw new Error("Controle sem dimensões");
            expect(caixa.width).toBeGreaterThanOrEqual(43.99);
            expect(caixa.height).toBeGreaterThanOrEqual(43.99);
            expect(caixa.x).toBeGreaterThanOrEqual(0);
            expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura + 0.01);
          }
          const [a, b, c] = caixas;
          if (!a || !b || !c) throw new Error("Navegação sem dimensões");
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          for (const botao of [anterior, periodo, seguinte]) {
            const cor = await botao.evaluate((el) => ({
              bg: getComputedStyle(el).backgroundColor,
              bordaPx: getComputedStyle(el).borderTopWidth,
            }));
            expect(cor.bg).not.toBe("rgba(0, 0, 0, 0)");
            expect(cor.bordaPx).toBe("1px");
          }
          // Texto, legenda e ícones ativos contra sua superfície efetiva; desabilitados são isentos.
          const contraste = await periodo.evaluate((el) => {
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
            const fundoDe = (no: Element) => {
              for (let atual: Element | null = no; atual; atual = atual.parentElement) {
                const fundo = getComputedStyle(atual).backgroundColor;
                if (fundo !== "rgba(0, 0, 0, 0)") return fundo;
              }
              return (
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--background")
                  .trim() ||
                (document.documentElement.classList.contains("dark") ? "#1c1b19" : "#f6f6f6")
              );
            };
            return Array.from(el.querySelectorAll("span, svg"))
              .filter((n) => getComputedStyle(n).display !== "none")
              .map((n) => {
                const l = lum(rgb(fundoDe(n)));
                const c = lum(rgb(getComputedStyle(n).color));
                return (Math.max(c, l) + 0.05) / (Math.min(c, l) + 0.05);
              });
          });
          expect(contraste.length).toBeGreaterThan(0);
          expect(Math.min(...contraste)).toBeGreaterThanOrEqual(4.5);
          if (tela === "painel" || tela === "chamada") {
            await page
              .locator('section[aria-label="Resumo da semana"][aria-busy="false"]')
              .waitFor();
            expect(await page.getByText("Serviço indisponível").count()).toBe(0);
          }
          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          const semHover = await anterior.evaluate((el) => getComputedStyle(el).backgroundColor);
          await anterior.hover();
          await expect
            .poll(() => anterior.evaluate((el) => getComputedStyle(el).backgroundColor))
            .not.toBe(semHover);
          await page.keyboard.press("Tab");
          await anterior.focus();
          expect(await anterior.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
          const foco = await anterior.evaluate((el) => {
            const s = getComputedStyle(el);
            return { outline: s.outlineStyle, shadow: s.boxShadow };
          });
          expect(foco.outline !== "none" || foco.shadow !== "none").toBe(true);
          await anterior.press("Space");
          await expect.poll(() => seguinte.isEnabled()).toBe(true);
          const depois = await page
            .locator("[aria-haspopup=dialog]")
            .first()
            .getAttribute("aria-label");
          await seguinte.focus();
          await seguinte.press("Enter");
          expect(
            await page.locator("[aria-haspopup=dialog]").first().getAttribute("aria-label"),
          ).not.toBe(depois);
          const gatilho = page.locator("[aria-haspopup=dialog]").first();
          await gatilho.focus();
          await gatilho.press("Enter");
          expect(await gatilho.getAttribute("aria-expanded")).toBe("true");
          const grupo = page.getByRole("group", { name: /^Dias de / });
          await grupo.waitFor();
          await page.keyboard.press("ArrowLeft");
          expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-dia"))).toBe(
            true,
          );
          await page.keyboard.press("Escape");
          expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
        } finally {
          await page.close();
        }
      }
    }, 120000);
  }
}

it("outros controles mantêm suas superfícies e o seletor mensal usa fio sutil", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}?tela=outros`);
    const mensal = page.getByRole("button", { name: "Mês do relatório: Outubro" });
    expect(await mensal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    for (const nome of ["Filtro selecionado", "Outro controle"]) {
      const botao = page.getByRole("button", { name: nome });
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
    }
    expect(
      await page.getByRole("button", { name: "Filtro selecionado" }).getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await page.close();
  }
});

it("o controle desabilitado é ignorado pelo teclado e as cores forçadas mantêm o foco", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    forcedColors: "active",
  });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel`);
    const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
    const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
    expect(await seguinte.isDisabled()).toBe(true);
    await page.keyboard.press("Tab");
    await periodo.focus();
    expect(
      await periodo.evaluate((el) => ({
        focus: el.matches(":focus-visible"),
        outline: getComputedStyle(el).outlineStyle,
      })),
    ).toEqual({ focus: true, outline: "solid" });
    await page.keyboard.press("Tab");
    expect(await seguinte.evaluate((el) => document.activeElement === el)).toBe(false);
    expect(await seguinte.isDisabled()).toBe(true);
    await page.locator('section[aria-label="Resumo da semana"][aria-busy="false"]').waitFor();
    expect(await page.getByText("Serviço indisponível").count()).toBe(0);
    if (process.env.CAPTURA_DATA) {
      await periodo.focus();
      await page.screenshot({
        path: `${process.env.CAPTURA_DATA}/painel-light-390-cores-forcadas-foco.png`,
      });
    }
  } finally {
    await page.close();
  }
});

it.each(["relatorio", "grade"])(
  "navegação de período da tela %s preserva responsividade e interação",
  async (tela) => {
    for (const largura of [320, 390, 1280])
      for (const tema of ["light", "dark"] as const) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await page.goto(`${url}?tela=${tela}`);
          await page.evaluate((valor) => {
            document.documentElement.className = valor;
          }, tema);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", {
            name: tela === "grade" ? "Mês anterior" : "Dia anterior do relatório",
            exact: true,
          });
          const periodo = page.getByRole("button", {
            name: tela === "grade" ? /^Mês da consulta:/ : /^Data do relatório:/,
          });
          const seguinte = page.getByRole("button", {
            name: tela === "grade" ? "Mês seguinte" : "Próximo dia do relatório",
            exact: true,
          });
          const botoes = [anterior, periodo, seguinte];
          const caixas = await Promise.all(botoes.map((b) => b.boundingBox()));
          const [a, b, c] = caixas;
          if (!a || !b || !c) throw new Error("Controles não montados");
          for (const box of [a, b, c]) {
            expect(box.width).toBeGreaterThanOrEqual(43.99);
            expect(box.height).toBeGreaterThanOrEqual(43.99);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(largura + 0.01);
          }
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          for (const botao of botoes) {
            const cor = await botao.evaluate((el) => ({
              fundo: getComputedStyle(el).backgroundColor,
              bordaPx: getComputedStyle(el).borderTopWidth,
            }));
            expect(cor.fundo).not.toBe("rgba(0, 0, 0, 0)");
            expect(cor.bordaPx).toBe("1px");
          }
          expect(await seguinte.isDisabled()).toBe(true);
          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          const fundo = await anterior.evaluate((el) => getComputedStyle(el).backgroundColor);
          await anterior.hover();
          await expect
            .poll(() => anterior.evaluate((el) => getComputedStyle(el).backgroundColor))
            .not.toBe(fundo);
          await page.keyboard.press("Tab");
          await anterior.focus();
          expect(await anterior.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
          expect(
            await anterior.evaluate((el) => {
              const s = getComputedStyle(el);
              return s.outlineStyle !== "none" || s.boxShadow !== "none";
            }),
          ).toBe(true);
          const antes = await periodo.getAttribute("aria-label");
          await anterior.press("Space");
          expect(await periodo.getAttribute("aria-label")).not.toBe(antes);
          expect(await seguinte.isEnabled()).toBe(true);
          await seguinte.focus();
          await seguinte.press("Enter");
          expect(await periodo.getAttribute("aria-label")).toBe(antes);
          await periodo.focus();
          await periodo.press("Enter");
          expect(await periodo.getAttribute("aria-expanded")).toBe("true");
          await page.keyboard.press("Escape");
          expect(await periodo.getAttribute("aria-expanded")).toBe("false");
          if (tela === "relatorio") {
            await page.getByRole("button", { name: "Semana", exact: true }).click();
            const semana = page.getByRole("button", { name: "Semana anterior do relatório" });
            await page.mouse.move(0, 0);
            await expect
              .poll(() =>
                semana.evaluate(
                  (el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)",
                ),
              )
              .toBe(true);
          }
        } finally {
          await page.close();
        }
      }
  },
  120000,
);

// A resposta respeita o contrato real e o recorte até o dia corrente.
async function simularEstatisticasDiretor(page: Page) {
  await page.route("**/api/diretor/estatisticas?**", (route) => {
    const consulta = new URL(route.request().url()).searchParams;
    const de = consulta.get("de") ?? "";
    const ate = [consulta.get("ate") ?? "", "2026-11-01"].sort()[0];
    return route.fulfill({
      json: {
        turmaId: "turma",
        turma: "1º ano A",
        vinculo: { inicio: "2026-01-01", fim: null },
        periodo:
          de <= (ate ?? "") && (ate ?? "") >= "2026-01-01"
            ? { de: de < "2026-01-01" ? "2026-01-01" : de, ate }
            : null,
        estatisticas:
          de <= (ate ?? "") && (ate ?? "") >= "2026-01-01"
            ? {
                alunos: [],
                semanas: [],
                resumo: { alunos: 0, emRisco: 0, ausencias: 0, alunoDias: 0, taxa: 0 },
                limiteRisco: 25,
                categorias: [],
              }
            : null,
      },
    });
  });
}

// Componentes de produção com navegação mensal.
it.each(["por-aluno", "resumo", "historico", "diretor"])(
  "trio mensal de %s usa contorno transparente no tema claro",
  async (tela) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await simularEstatisticasDiretor(page);
      await page.goto(`${url}?tela=${tela}`);
      const nomes =
        tela === "resumo"
          ? [/^Mês anterior do resumo$/, /^Mês do resumo:/, /^Mês seguinte do resumo$/]
          : [
              /^Mês anterior$/,
              tela === "historico"
                ? /^Mês do histórico:/
                : tela === "diretor"
                  ? /^Mês das estatísticas:/
                  : /^Mês do relatório:/,
              /^Mês seguinte$/,
            ];
      for (const nome of nomes) {
        const botao = page.getByRole("button", { name: nome });
        await botao.waitFor();
        const estilo = await botao.evaluate((el) => ({
          fundo: getComputedStyle(el).backgroundColor,
          largura: getComputedStyle(el).borderTopWidth,
        }));
        expect(estilo.fundo).not.toBe("rgba(0, 0, 0, 0)");
        expect(estilo.largura).toBe("1px");
      }
    } finally {
      await page.close();
    }
  },
);

for (const tela of ["por-aluno", "resumo", "historico", "diretor"]) {
  it(`trio mensal de ${tela}: tamanhos, temas, teclado e retorno`, async () => {
    for (const largura of [320, 390, 1280]) {
      for (const tema of ["light", "dark"] as const) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await simularEstatisticasDiretor(page);
          await page.goto(`${url}?tela=${tela}`);
          await page.evaluate((tema) => {
            document.documentElement.className = tema;
          }, tema);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", {
            name: tela === "resumo" ? "Mês anterior do resumo" : "Mês anterior",
            exact: true,
          });
          const periodo = page.getByRole("button", {
            name:
              tela === "resumo"
                ? /^Mês do resumo:/
                : tela === "historico"
                  ? /^Mês do histórico:/
                  : tela === "diretor"
                    ? /^Mês das estatísticas:/
                    : /^Mês do relatório:/,
          });
          const seguinte = page.getByRole("button", {
            name: tela === "resumo" ? "Mês seguinte do resumo" : "Mês seguinte",
            exact: true,
          });
          await anterior.waitFor();
          const botoes = [anterior, periodo, seguinte];
          const caixas = await Promise.all(botoes.map((b) => b.boundingBox()));
          const [a, b, c] = caixas;
          if (!a || !b || !c) throw new Error("Trio não renderizado");
          for (const caixa of [a, b, c]) {
            expect(caixa.width).toBeGreaterThanOrEqual(43.99);
            expect(caixa.height).toBeGreaterThanOrEqual(43.99);
            expect(caixa.x).toBeGreaterThanOrEqual(0);
            expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura + 0.01);
          }
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          expect(await seguinte.isDisabled()).toBe(true);
          const medida = await periodo.evaluate((el) => {
            const contexto = document.createElement("canvas").getContext("2d");
            if (!contexto) throw new Error("Canvas indisponível");
            const luminancia = (cor: string) => {
              contexto.clearRect(0, 0, 1, 1);
              contexto.fillStyle = cor;
              contexto.fillRect(0, 0, 1, 1);
              return Array.from(contexto.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
            };
            const estilo = getComputedStyle(el);
            let fundo = estilo.backgroundColor;
            for (let no: Element | null = el; no; no = no.parentElement) {
              if (fundo !== "rgba(0, 0, 0, 0)") break;
              fundo = getComputedStyle(no).backgroundColor;
            }
            if (fundo === "rgba(0, 0, 0, 0)")
              fundo =
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--background")
                  .trim() ||
                (document.documentElement.classList.contains("dark") ? "#1c1b19" : "#f6f6f6");
            const a = luminancia(estilo.color);
            const b = luminancia(fundo);
            return {
              contraste: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              cor: estilo.color,
              fundo,
              classe: document.documentElement.className,
              htmlVar: getComputedStyle(document.documentElement)
                .getPropertyValue("--background")
                .trim(),
              bodyVar: getComputedStyle(document.body).getPropertyValue("--background").trim(),
              body: getComputedStyle(document.body).backgroundColor,
              bodyClasse: document.body.className,
              bodyEstilo: document.body.getAttribute("style"),
            };
          });
          expect(
            medida.contraste,
            JSON.stringify({ tela, tema, largura, medida }),
          ).toBeGreaterThanOrEqual(4.5);
          for (const botao of botoes) {
            const estilo = await botao.evaluate((el) => ({
              fundo: getComputedStyle(el).backgroundColor,
              largura: getComputedStyle(el).borderTopWidth,
            }));
            expect(estilo.fundo).not.toBe("rgba(0, 0, 0, 0)");
            expect(estilo.largura).toBe("1px");
          }
          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          await page.keyboard.press("Tab");
          await periodo.focus();
          await page.keyboard.press("Tab");
          expect(await seguinte.evaluate((el) => document.activeElement === el)).toBe(false);
          await anterior.focus();
          const foco = await anterior.evaluate((el) => ({
            visivel: el.matches(":focus-visible"),
            contorno: getComputedStyle(el).outlineStyle,
            sombra: getComputedStyle(el).boxShadow,
          }));
          expect(foco.visivel).toBe(true);
          expect(foco.contorno !== "none" || foco.sombra !== "none").toBe(true);
          const antes = await periodo.getAttribute("aria-label");
          await anterior.press("Space");
          expect(await periodo.getAttribute("aria-label")).not.toBe(antes);
          expect(await seguinte.isEnabled()).toBe(true);
          if (tela === "historico") {
            const reset = page.getByRole("button", { name: "Voltar para este mês" });
            expect(await reset.evaluate((el) => el.closest(".navegacao-dia"))).toBe(null);
            await reset.click();
            expect(await periodo.getAttribute("aria-label")).toBe(antes);
            await anterior.press("Space");
          }
          await seguinte.press("Enter");
          expect(await periodo.getAttribute("aria-label")).toBe(antes);
          expect(await seguinte.isDisabled()).toBe(true);
          await periodo.press("Enter");
          expect(await periodo.getAttribute("aria-expanded")).toBe("true");
          const anoAnterior = page.getByRole("button", { name: "Ano anterior", exact: true });
          await anoAnterior.press("Enter");
          expect(await page.getByText("2025", { exact: true }).isVisible()).toBe(true);
          await page.keyboard.press("Escape");
          expect(await periodo.getAttribute("aria-expanded")).toBe("false");
        } finally {
          await page.close();
        }
      }
    }
  }, 120000);
}

it("resumo bloqueado mantém os três controles desabilitados", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}?tela=resumo&bloqueado`);
    for (const nome of [
      /^Mês anterior do resumo$/,
      /^Mês do resumo:/,
      /^Mês seguinte do resumo$/,
    ]) {
      const botao = page.getByRole("button", { name: nome });
      expect(await botao.isDisabled()).toBe(true);
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
    }
  } finally {
    await page.close();
  }
});
