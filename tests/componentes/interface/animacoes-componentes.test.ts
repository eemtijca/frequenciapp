// Verifica animações reais dos componentes no navegador, sem servidor ou banco do app.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminhoVite = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminhoVite).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;

beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/animacoes-componentes.html`;
  navegador = await chromium.launch({ headless: true });
  // A primeira navegação também espera a otimização de dependências do Vite;
  // esse custo de inicialização não deve consumir o timeout de um teste.
  const aquecimento = await pagina(390);
  try {
    await aquecimento.getByRole("button", { name: "Configurações" }).waitFor({ timeout: 90000 });
  } finally {
    await aquecimento.close();
  }
});

afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
});

async function pagina(largura: number): Promise<Page> {
  const pagina = await navegador.newPage({
    viewport: { width: largura, height: 800 },
    reducedMotion: "no-preference",
  });
  pagina.setDefaultNavigationTimeout(90000);
  await pagina.goto(url);
  // Congela as animações CSS reais antes da interação; o teste controla o relógio
  // pela Web Animations API, sem competir com a duração curta no navegador.
  await pagina.addStyleTag({
    content:
      '.secao-animada, [data-slot="dialog-content"] { animation-play-state: paused !important; }',
  });
  return pagina;
}

describe("animação da seção recolhível", () => {
  it("expande e recolhe o conteúdo com o estado acessível do Radix", async () => {
    const aba = await pagina(390);
    try {
      const gatilho = aba.getByRole("button", { name: "Configurações" });
      expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
      await aba.getByRole("button", { name: "Ação externa" }).click();
      expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
      await gatilho.click();
      // Uma pausa maior que a duração evita depender da velocidade da máquina.
      await aba.waitForTimeout(400);
      const regiao = aba.locator('[role="region"][aria-label="Configurações"]');
      expect(await gatilho.getAttribute("aria-expanded")).toBe("true");
      expect(await regiao.evaluate((el) => getComputedStyle(el).animationName)).toBe("secao-entra");
      const alturas = await regiao.evaluate((el) => {
        const animacao = el.getAnimations()[0];
        if (!animacao) throw new Error("Animação ausente");
        const duracao = animacao.effect?.getComputedTiming().endTime;
        if (typeof duracao !== "number" || !Number.isFinite(duracao) || duracao <= 0) {
          throw new Error("Duração da animação inválida");
        }
        animacao.currentTime = 0;
        const inicial = el.getBoundingClientRect().height;
        const recorte = getComputedStyle(el).overflow;
        animacao.currentTime = duracao * 0.99;
        const final = el.getBoundingClientRect().height;
        animacao.finish();
        return { inicial, final, recorte };
      });
      expect(alturas.inicial).toBeLessThan(alturas.final);
      expect(alturas.recorte).toBe("hidden");
      expect(await regiao.evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
      await gatilho.click();
      expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
      expect(await regiao.evaluate((el) => getComputedStyle(el).animationName)).toBe("secao-sai");
      expect(await regiao.evaluate((el) => el instanceof HTMLElement && el.inert)).toBe(true);
      const alturasSaida = await regiao.evaluate((el) => {
        const animacao = el.getAnimations()[0];
        if (!animacao) throw new Error("Animação de saída ausente");
        const duracao = animacao.effect?.getComputedTiming().endTime;
        if (typeof duracao !== "number" || !Number.isFinite(duracao) || duracao <= 0) {
          throw new Error("Duração da animação inválida");
        }
        animacao.currentTime = 0;
        const inicial = el.getBoundingClientRect().height;
        animacao.currentTime = duracao * 0.99;
        const final = el.getBoundingClientRect().height;
        animacao.finish();
        return { inicial, final };
      });
      expect(alturasSaida.inicial).toBeGreaterThan(alturasSaida.final);
      await expect.poll(() => aba.getByRole("button", { name: "Ação interna" }).count()).toBe(0);
    } finally {
      await aba.close();
    }
  });
});

describe("animação da folha inferior", () => {
  it("desliza pela borda inferior no celular ao abrir e fechar", async () => {
    const aba = await pagina(390);
    try {
      const gatilho = aba.getByRole("button", { name: "Abrir folha" });
      await gatilho.click();
      // Reproduz atrasos de agendamento maiores que a animação original.
      await aba.waitForTimeout(400);
      const conteudo = aba.getByRole("dialog");
      expect(await conteudo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await expect
        .poll(() => conteudo.evaluate((el) => getComputedStyle(el).animationName))
        .toBe("folha-entra");
      const posicoes = await conteudo.evaluate((el) => {
        const animacao = el.getAnimations()[0];
        if (!animacao) throw new Error("Animação ausente");
        const duracao = animacao.effect?.getComputedTiming().endTime;
        if (typeof duracao !== "number" || !Number.isFinite(duracao) || duracao <= 0) {
          throw new Error("Duração da animação inválida");
        }
        animacao.currentTime = 0;
        const inicial = el.getBoundingClientRect();
        animacao.currentTime = duracao * 0.99;
        const final = el.getBoundingClientRect();
        animacao.finish();
        return {
          xInicial: inicial.x,
          xFinal: final.x,
          yInicial: inicial.y,
          yFinal: final.y,
          base: final.bottom,
        };
      });
      expect(Math.abs(posicoes.xInicial - posicoes.xFinal)).toBeLessThan(1);
      expect(posicoes.yInicial).toBeGreaterThan(posicoes.yFinal);
      expect(Math.abs(posicoes.base - 800)).toBeLessThan(1);
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        await aba.keyboard.press("Tab");
        expect(await conteudo.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      }
      await aba.keyboard.press("Escape");
      await expect
        .poll(() => conteudo.evaluate((el) => getComputedStyle(el).animationName))
        .toBe("folha-sai");
      const saida = await conteudo.evaluate((el) => {
        const animacao = el.getAnimations()[0];
        if (!animacao) throw new Error("Animação de saída ausente");
        const duracao = animacao.effect?.getComputedTiming().endTime;
        if (typeof duracao !== "number" || !Number.isFinite(duracao) || duracao <= 0) {
          throw new Error("Duração da animação inválida");
        }
        animacao.currentTime = 0;
        const inicial = el.getBoundingClientRect();
        animacao.currentTime = duracao * 0.99;
        const final = el.getBoundingClientRect();
        animacao.finish();
        return { xInicial: inicial.x, xFinal: final.x, yInicial: inicial.y, yFinal: final.y };
      });
      expect(Math.abs(saida.xInicial - saida.xFinal)).toBeLessThan(1);
      expect(saida.yFinal).toBeGreaterThan(saida.yInicial);
      await expect.poll(() => gatilho.evaluate((el) => document.activeElement === el)).toBe(true);
    } finally {
      await aba.close();
    }
  });
});

describe("preferências e variantes", () => {
  it("mantém o modal central no celular e a folha central no desktop", async () => {
    for (const [largura, botao] of [
      [390, "Abrir modal"],
      [1024, "Abrir folha"],
    ] as const) {
      const aba = await pagina(largura);
      try {
        await aba.getByRole("button", { name: botao }).click();
        const conteudo = aba.getByRole("dialog");
        expect(await conteudo.evaluate((el) => getComputedStyle(el).animationName)).toBe("enter");
        await conteudo.evaluate((el) =>
          el.getAnimations().forEach((animacao) => animacao.finish()),
        );
        const caixa = await conteudo.boundingBox();
        expect(caixa).not.toBeNull();
        if (caixa) {
          expect(Math.abs(caixa.x + caixa.width / 2 - largura / 2)).toBeLessThan(1);
          expect(Math.abs(caixa.y + caixa.height / 2 - 400)).toBeLessThan(1);
        }
      } finally {
        await aba.close();
      }
    }
  });

  it("conserva a animação e o véu próprios do menu lateral", async () => {
    const aba = await pagina(390);
    try {
      await aba.getByRole("button", { name: "Abrir menu" }).click();
      const menu = aba.getByRole("dialog");
      expect(await menu.evaluate((el) => getComputedStyle(el).animationName)).toBe("gaveta-entra");
      expect(await aba.locator('[data-slot="dialog-veu"]').count()).toBe(1);
      await aba.keyboard.press("Escape");
      expect(await menu.evaluate((el) => getComputedStyle(el).animationName)).toBe("gaveta-sai");
    } finally {
      await aba.close();
    }
  });

  it("reduz o movimento da folha e da seção sem impedir a interação", async () => {
    const aba = await navegador.newPage({
      viewport: { width: 390, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await aba.goto(url);
      await aba.getByRole("button", { name: "Abrir folha" }).click();
      const folha = aba.getByRole("dialog");
      expect(await folha.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("1e-05s");
      await aba.keyboard.press("Escape");
      await expect.poll(() => folha.count()).toBe(0);
      const gatilho = aba.getByRole("button", { name: "Configurações" });
      await gatilho.click();
      const regiao = aba.getByRole("region", { name: "Configurações" });
      expect(await regiao.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("1e-05s");
      await gatilho.click();
      await expect.poll(() => aba.getByRole("button", { name: "Ação interna" }).count()).toBe(0);
    } finally {
      await aba.close();
    }
  });
});
