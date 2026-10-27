// Verifica reversões e foco durante animações de seções recolhíveis.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator } from "@playwright/test";
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
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/interface/reversao.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
async function abrir(reducedMotion: "reduce" | "no-preference" = "no-preference") {
  const page = await browser.newPage({ reducedMotion });
  await page.goto(url);
  const gatilho = page.getByRole("button", { name: "Turmas", exact: true });
  await gatilho.click({ timeout: 90000 });
  return { page, gatilho, painel: page.locator('[aria-label="Turma atual"] > div[data-state]') };
}
// Mede imediatamente antes e depois da mudança de estado, no próprio navegador.
async function inverter(botao: Locator, seletor: string, estado: string) {
  return botao.evaluate(
    async (botao: HTMLButtonElement, { seletor, estado }) => {
      const el = document.querySelector<HTMLElement>(seletor);
      if (!el) throw new Error("Conteúdo ausente");
      const mudar = () =>
        new Promise<void>((resolve, reject) => {
          const anterior = el.dataset.state;
          const observador = new MutationObserver(() => {
            if (el.dataset.state !== anterior) {
              observador.disconnect();
              resolve();
            }
          });
          observador.observe(el, { attributes: true, attributeFilter: ["data-state"] });
          botao.click();
          setTimeout(() => {
            observador.disconnect();
            reject(new Error("Estado não mudou"));
          }, 1000);
        });
      await mudar();
      if (el.dataset.state !== estado) throw new Error("Estado inicial inesperado");
      const animacao = el.getAnimations().find((item) => item instanceof CSSAnimation);
      if (!animacao) throw new Error("Animação real ausente");
      animacao.pause();
      const duracao = animacao.effect?.getComputedTiming().endTime;
      if (typeof duracao !== "number" || duracao <= 0) throw new Error("Duração inválida");
      animacao.currentTime = duracao * 0.45;
      const antes = el.getBoundingClientRect().height;
      const completo = el.firstElementChild?.getBoundingClientRect().height ?? 0;
      await mudar();
      const depois = el.getBoundingClientRect().height;
      const novaAnimacao = el.getAnimations().find((item) => item instanceof CSSAnimation);
      if (!novaAnimacao) throw new Error("Animação de reversão ausente");
      novaAnimacao.pause();
      const novaDuracao = novaAnimacao.effect?.getComputedTiming().endTime;
      if (typeof novaDuracao !== "number" || novaDuracao <= 0) throw new Error("Duração inválida");
      novaAnimacao.currentTime = novaDuracao * 0.9;
      return { antes, depois, completo, avancado: el.getBoundingClientRect().height };
    },
    { seletor, estado },
  );
}
for (const alvo of ["painel", "serie", "secao"] as const) {
  it(`${alvo}: reversão durante saída não salta`, async () => {
    const { page, gatilho } = await abrir();
    try {
      let botao = gatilho;
      let seletor = '[aria-label="Turma atual"] > div[data-state]';
      if (alvo === "serie") {
        botao = page.getByRole("button", { name: "1ª série", exact: true });
        seletor = '[aria-label="Séries"] > div[data-state] > div[data-state]';
      }
      if (alvo === "secao") {
        botao = page.getByRole("button", { name: "Teste seção" });
        seletor = '[aria-label="Teste seção"][role="region"]';
        await botao.click();
      }
      await page.waitForTimeout(350);
      const r = await inverter(botao, seletor, "closed");
      expect(r.antes).toBeGreaterThan(2);
      expect(r.antes).toBeLessThan(r.completo - 2);
      expect(Math.abs(r.depois - r.antes)).toBeLessThan(3);
      expect(r.avancado).toBeGreaterThan(r.antes);
    } finally {
      await page.close();
    }
  });
}
for (const alvo of ["painel", "serie"] as const) {
  it(`${alvo}: conteúdo inerte e fora da navegação ao iniciar saída`, async () => {
    const { page, painel, gatilho } = await abrir();
    try {
      await page.waitForTimeout(350);
      await page.addStyleTag({
        content: 'div[data-state="closed"] { animation-play-state: paused !important; }',
      });
      const botao =
        alvo === "painel" ? gatilho : page.getByRole("button", { name: "1ª série", exact: true });
      const conteudo =
        alvo === "painel"
          ? painel
          : page.locator('[aria-label="Séries"] > div[data-state] > div[data-state]');
      await botao.focus();
      await botao.press("Enter");
      const r = await conteudo.evaluate((el: HTMLElement) => ({
        inert: el.inert,
        height: el.getBoundingClientRect().height,
        state: el.dataset.state,
      }));
      expect(r.state).toBe("closed");
      expect(r.height).toBeGreaterThan(0);
      expect(r.inert).toBe(true);
      expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
      await page.keyboard.press("Tab");
      expect(await conteudo.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    } finally {
      await page.close();
    }
  });
}
it("painel inicial mede corretamente a série ativa aninhada", async () => {
  const { page, painel } = await abrir();
  try {
    await page.waitForTimeout(350);
    const r = await painel.evaluate((el) => ({
      altura: el.getBoundingClientRect().height,
      conteudo: el.firstElementChild?.getBoundingClientRect().height ?? 0,
    }));
    expect(Math.abs(r.altura - r.conteudo)).toBeLessThan(1);
    expect(await page.getByRole("button", { name: "1ª série A" }).isVisible()).toBe(true);
  } finally {
    await page.close();
  }
});

it("fechamento externo devolve o foco interno ao gatilho da seção", async () => {
  const { page } = await abrir();
  try {
    const gatilho = page.getByRole("button", { name: "Teste seção" });
    await gatilho.click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Controle interno" }).focus();
    await page
      .getByRole("button", { name: "Fechar seção externamente" })
      .evaluate((el: HTMLButtonElement) => el.click());
    expect(await gatilho.evaluate((el) => el === document.activeElement)).toBe(true);
  } finally {
    await page.close();
  }
});

it("altura alvo inicial inclui a série aninhada aberta", async () => {
  const { page, painel } = await abrir();
  try {
    const alvo = await painel.evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue("--radix-collapsible-content-height")),
    );
    await page.waitForTimeout(350);
    const final = await painel.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(alvo - final)).toBeLessThan(2);
  } finally {
    await page.close();
  }
});

for (const alvo of ["painel", "serie", "secao"] as const) {
  it(`${alvo}: reversão durante entrada não salta`, async () => {
    const { page, gatilho } = await abrir();
    try {
      let botao = gatilho;
      let seletor = '[aria-label="Turma atual"] > div[data-state]';
      if (alvo === "serie") {
        botao = page.getByRole("button", { name: "1ª série", exact: true });
        seletor = '[aria-label="Séries"] > div[data-state] > div[data-state]';
      }
      if (alvo === "secao") {
        botao = page.getByRole("button", { name: "Teste seção" });
        seletor = '[aria-label="Teste seção"][role="region"]';
      } else {
        await page.waitForTimeout(350);
        await botao.click();
        await page.waitForTimeout(350);
      }
      const r = await inverter(botao, seletor, "open");
      expect(r.antes).toBeGreaterThan(2);
      expect(r.antes).toBeLessThan(r.completo - 2);
      expect(Math.abs(r.depois - r.antes)).toBeLessThan(3);
      expect(r.avancado).toBeLessThan(r.antes);
    } finally {
      await page.close();
    }
  });
}

it("não herda a altura inicial de um painel recolhível externo", async () => {
  const { page, painel } = await abrir();
  try {
    const interno = page.locator('[aria-label="Séries"] > div[data-state] > div[data-state]');
    await painel.evaluate((el) => el.style.setProperty("--altura-recolhivel-inicial", "999px"));
    expect(
      await interno.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--altura-recolhivel-inicial").trim(),
      ),
    ).not.toBe("999px");
  } finally {
    await page.close();
  }
});

it("preserva o contorno de foco depois da expansão", async () => {
  const { page, painel } = await abrir();
  try {
    await expect.poll(() => painel.evaluate((el) => el.getAnimations().length)).toBe(0);
    expect(await painel.evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
    const serie = page.getByRole("button", { name: "1ª série", exact: true });
    await serie.focus();
    expect(await serie.evaluate((el) => document.activeElement === el)).toBe(true);
  } finally {
    await page.close();
  }
});

it("movimento reduzido desativa as animações e desmonta o conteúdo", async () => {
  const { page, gatilho, painel } = await abrir("reduce");
  try {
    const serie = page.getByRole("button", { name: "1ª série", exact: true });
    const interna = page.locator('[aria-label="Séries"] > div[data-state] > div[data-state]');
    const secao = page.getByRole("button", { name: "Teste seção" });
    await secao.click();
    const regiao = page.getByRole("region", { name: "Teste seção" });
    for (const el of [painel, interna, regiao]) {
      const css = await el.evaluate((node) => ({
        nome: getComputedStyle(node).animationName,
        duracao: parseFloat(getComputedStyle(node).animationDuration),
      }));
      expect(css.nome === "none" || css.duracao <= 0.00001).toBe(true);
    }
    await serie.click();
    expect(await page.getByRole("button", { name: "1ª série A" }).count()).toBe(0);
    await gatilho.click();
    expect(await page.getByRole("button", { name: "1ª série", exact: true }).count()).toBe(0);
    await secao.click();
    await expect.poll(() => page.getByRole("button", { name: "Controle interno" }).count()).toBe(0);
  } finally {
    await page.close();
  }
});
