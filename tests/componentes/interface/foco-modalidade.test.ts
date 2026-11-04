// Verifica indicadores de foco reais com eventos de navegador.
import path from "node:path";
import { createRequire } from "node:module";
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
let navegador: Browser;
let url: string;

it.each(["none", "active"] as const)(
  "toque cancelado preserva foco programático e não reverte foco alterado (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ hasTouch: true, forcedColors });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const origem = pagina.getByRole("button", { name: "Superfície controle" });
      const outro = pagina.getByRole("textbox", { name: "Nome" });
      await pagina.getByRole("button", { name: "Primeira ação" }).click();
      await origem.evaluate((el: HTMLElement) => el.focus());
      expect(await origem.getAttribute("data-foco-desconhecido")).toBe("");
      const caixa = await origem.boundingBox();
      if (!caixa) throw new Error("Origem indisponível");
      const cdp = await pagina.context().newCDPSession(pagina);
      const iniciar = () =>
        cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }],
        });
      const cancelar = () =>
        cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await iniciar();
      await cancelar();
      expect(await origem.getAttribute("data-foco-desconhecido")).toBe("");
      expect(await origem.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await iniciar();
      await outro.evaluate((el: HTMLElement) => el.focus());
      await cancelar();
      expect(await outro.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await outro.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect(await origem.getAttribute("data-foco-desconhecido")).toBeNull();
    } finally {
      await pagina.close();
    }
  },
);

it("busca integrada em superfície de campo não duplica o contorno ao usar teclado", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const busca = pagina.getByRole("searchbox", { name: "Buscar" });
    await busca.click();
    await pagina.keyboard.press("Shift+Tab");
    await pagina.keyboard.press("Tab");
    expect(await busca.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await busca.locator("..").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      "solid",
    );
    expect(await busca.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  } finally {
    await pagina.close();
  }
});

it.each(["none", "active"] as const)(
  "arrastar opção para fora preserva foco da busca sem selecionar (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ forcedColors });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.getByRole("combobox", { name: "Escolha" }).click();
      const campo = pagina.getByRole("textbox", { name: "Filtrar opções" });
      const opcao = pagina.getByRole("option", { name: "Alfa" });
      await pagina.keyboard.press("ArrowDown");
      expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      const caixa = await opcao.boundingBox();
      if (!caixa) throw new Error("Opção indisponível");
      await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
      await pagina.mouse.down();
      await pagina.mouse.move(1, 1);
      await pagina.mouse.up();
      expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect(await opcao.getAttribute("aria-selected")).toBe("false");
      await opcao.click();
      expect(
        await pagina.getByRole("combobox", { name: "Escolha" }).getAttribute("aria-expanded"),
      ).toBe("false");
    } finally {
      await pagina.close();
    }
  },
);

it.each(["none", "active"] as const)(
  "edição de número clicado não vira navegação de foco (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ forcedColors });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.evaluate(() => {
        const numero = document.createElement("input");
        numero.type = "number";
        numero.value = "12";
        numero.setAttribute("aria-label", "Número de teste");
        numero.className = "campo";
        const spin = document.createElement("div");
        spin.tabIndex = 0;
        spin.setAttribute("role", "spinbutton");
        spin.setAttribute("aria-label", "Spin de teste");
        spin.setAttribute("aria-valuenow", "12");
        spin.className = "campo";
        spin.textContent = "12";
        document.querySelector("main")?.append(numero, spin);
      });
      for (const nome of ["Número de teste", "Spin de teste"]) {
        const campo = pagina.getByRole("spinbutton", { name: nome });
        await campo.click();
        expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
        for (const tecla of ["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"]) {
          await pagina.keyboard.press(tecla);
          expect(
            await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco),
            `${nome}: ${tecla}`,
          ).toBe("ponteiro");
          expect(
            await campo.evaluate((el) => getComputedStyle(el).outlineStyle),
            `${nome}: ${tecla}`,
          ).toBe("none");
        }
        if (nome === "Número de teste") {
          const antes = await campo.inputValue();
          await pagina.keyboard.press("ArrowUp");
          expect(await campo.inputValue()).not.toBe(antes);
          expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
        }
        await pagina.keyboard.press("Shift+Tab");
        await pagina.keyboard.press("Tab");
        expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
        expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      }
    } finally {
      await pagina.close();
    }
  },
);

it.each(["none", "active"] as const)(
  "busca aberta por clique mantém indicador ao navegar opções (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ forcedColors });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.getByRole("combobox", { name: "Escolha" }).click();
      const campo = pagina.getByRole("textbox", { name: "Filtrar opções" });
      await campo.waitFor();
      expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
      const indicador = () =>
        campo.evaluate((el) => {
          const visivel = (no: Element) => {
            const css = getComputedStyle(no);
            return css.outlineStyle !== "none" && css.outlineWidth !== "0px";
          };
          return visivel(el) || Boolean(el.parentElement && visivel(el.parentElement));
        });
      expect(await indicador()).toBe(true);
      const antes = await campo.getAttribute("aria-activedescendant");
      await pagina.keyboard.press("ArrowDown");
      expect(await campo.getAttribute("aria-activedescendant")).not.toBe(antes);
      expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await indicador()).toBe(true);
    } finally {
      await pagina.close();
    }
  },
);

it.each(["none", "active"] as const)(
  "cancelar toque real restaura o indicador do foco anterior (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ hasTouch: true, forcedColors });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const origem = pagina.getByRole("button", { name: "Primeira ação" });
      const destino = pagina.getByRole("button", { name: "Superfície controle" });
      await pagina.keyboard.press("Tab");
      expect(await origem.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await origem.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await pagina.evaluate(() => {
        document.addEventListener(
          "pointercancel",
          (evento) => {
            document.documentElement.dataset.cancelamentoConfiavel = String(evento.isTrusted);
          },
          { once: true },
        );
      });
      const caixa = await destino.boundingBox();
      if (!caixa) throw new Error("Destino indisponível");
      const cdp = await pagina.context().newCDPSession(pagina);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      expect(
        await pagina.evaluate(() => document.documentElement.dataset.cancelamentoConfiavel),
      ).toBe("true");
      expect(await origem.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await origem.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await destino.tap();
      expect(await destino.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await destino.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    } finally {
      await pagina.close();
    }
  },
);
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.resolve("node_modules/.vite-foco-modalidade"),
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/foco-modalidade.html`;
  navegador = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
});

it.each(["none", "active"] as const)(
  "foco programático em outro campo após clique permanece visível (cores forçadas: %s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ forcedColors, reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const origem = pagina.getByRole("textbox", { name: "Nome" });
      const destino = pagina.getByRole("textbox", { name: "Inválido" });
      await origem.click();
      expect(await origem.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
      await destino.evaluate((el: HTMLElement) => el.focus());
      expect(await destino.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await destino.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect(await destino.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("2px");
    } finally {
      await pagina.close();
    }
  },
);

it("movimento reduzido remove imediatamente o anel do pseudo-elemento ao clicar", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const botao = pagina.getByRole("button", { name: "Superfície controle" });
    const sombra = () => botao.evaluate((el) => getComputedStyle(el, "::after").boxShadow);
    const antes = await sombra();
    for (let i = 0; i < 12 && !(await botao.evaluate((el) => document.activeElement === el)); i++) {
      await pagina.keyboard.press("Tab");
    }
    expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await sombra()).not.toBe(antes);
    // Congela a linha do tempo: uma transição residual não pode depender do próximo frame.
    const cdp = await pagina.context().newCDPSession(pagina);
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
    await botao.click();
    expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
      "ponteiro",
    );
    expect(await sombra()).toBe(antes);
  } finally {
    await pagina.close();
  }
});

it.each(["controle", "discreto", "primário", "destrutivo"] as const)(
  "clique na superfície %s já focada pelo teclado remove apenas o indicador de foco",
  async (variante) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const botao = pagina.getByRole("button", { name: `Superfície ${variante}` });
      const estilo = () =>
        botao.evaluate((el) => ({
          outline: getComputedStyle(el).outlineStyle,
          shadow: getComputedStyle(el).boxShadow,
          after: getComputedStyle(el, "::after").boxShadow,
        }));
      const antes = await estilo();
      for (
        let i = 0;
        i < 12 && !(await botao.evaluate((el) => document.activeElement === el));
        i++
      ) {
        await pagina.keyboard.press("Tab");
      }
      expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await estilo()).not.toEqual(antes);
      await botao.click();
      expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await estilo()).toEqual(antes);
    } finally {
      await pagina.close();
    }
  },
);

it.each(["Nome", "Buscar"] as const)(
  "digitar no campo %s clicado não ativa indicador de teclado",
  async (nome) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const campo = pagina.getByRole(nome === "Buscar" ? "searchbox" : "textbox", { name: nome });
      const indicador = nome === "Buscar" ? campo.locator("..") : campo;
      await campo.click();
      expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
      await pagina.keyboard.type("a");
      expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
      await pagina.keyboard.press("Backspace");
      expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
      await pagina.keyboard.insertText("ç");
      expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
      expect(await campo.inputValue()).toBe("ç");
      await pagina.keyboard.press("Shift+Tab");
      await pagina.keyboard.press("Tab");
      expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    } finally {
      await pagina.close();
    }
  },
);

it.each(["Nome", "Buscar"] as const)(
  "navegação de texto em %s clicado não ativa foco de teclado",
  async (nome) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const campo = pagina.getByRole(nome === "Buscar" ? "searchbox" : "textbox", { name: nome });
      const indicador = nome === "Buscar" ? campo.locator("..") : campo;
      await campo.click();
      await pagina.keyboard.type("texto");
      for (const tecla of [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ]) {
        await pagina.keyboard.press(tecla);
        expect(
          await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco),
          tecla,
        ).toBe("ponteiro");
        expect(await indicador.evaluate((el) => getComputedStyle(el).outlineStyle), tecla).toBe(
          "none",
        );
      }
      await pagina.keyboard.press("Tab");
      expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
        "teclado",
      );
    } finally {
      await pagina.close();
    }
  },
);

it.each(["Turmas", "1ª série", "1ª série A"] as const)(
  "seletor real: clique após Tab remove foco de %s",
  async (nome) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const gatilho = pagina.getByRole("button", { name: "Turmas", exact: true });
      for (
        let i = 0;
        i < 20 && !(await gatilho.evaluate((el) => document.activeElement === el));
        i++
      )
        await pagina.keyboard.press("Tab");
      expect(await gatilho.evaluate((el) => document.activeElement === el)).toBe(true);
      if (nome !== "Turmas") {
        await pagina.keyboard.press("Enter");
        await pagina.keyboard.press("Tab");
        if (nome === "1ª série A") await pagina.keyboard.press("Tab");
      }
      const alvo = pagina.getByRole("button", { name: nome, exact: true });
      expect(await alvo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await alvo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      await alvo.click();
      expect(await alvo.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await alvo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    } finally {
      await pagina.close();
    }
  },
);

it("seletor real: foco programático na série selecionada é visível", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    // Folhas globais e módulos podem ser carregados em ordens diferentes no aplicativo.
    await pagina.evaluate(() => {
      const modulo = document.querySelector(
        'style[data-vite-dev-id*="seletor-turma-chamada.module.css"]',
      );
      if (!modulo) throw new Error("CSS do seletor ausente");
      document.head.append(modulo);
    });
    await pagina.getByRole("button", { name: "Turmas", exact: true }).click();
    const serie = pagina.getByRole("button", { name: "1ª série", exact: true, pressed: true });
    await serie.evaluate((el: HTMLElement) => el.focus());
    expect(await serie.getAttribute("data-foco-desconhecido")).toBe("");
    expect(await serie.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    expect(await serie.getAttribute("aria-pressed")).toBe("true");
  } finally {
    await pagina.close();
  }
});

it.each(["claro", "escuro"] as const)(
  "cores forçadas: foco desconhecido e seleção coexistem (%s)",
  async (tema) => {
    const pagina = await navegador.newPage({ forcedColors: "active", reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "escuro",
      );
      const selecionado = pagina.getByRole("button", { name: "Selecionado", pressed: true });
      const outro = pagina.getByRole("button", { name: "Superfície controle" });
      const borda = (el: Element) => ({
        width: getComputedStyle(el).borderTopWidth,
        color: getComputedStyle(el).borderTopColor,
      });
      const selecao = await selecionado.evaluate(borda);
      await pagina.getByRole("button", { name: "Primeira ação" }).click();
      await selecionado.evaluate((el: HTMLElement) => el.focus());
      expect(await selecionado.getAttribute("data-foco-desconhecido")).toBe("");
      expect(await selecionado.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect(await selecionado.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("2px");
      expect(await selecionado.evaluate(borda)).toEqual(selecao);
      expect(selecao).not.toEqual(await outro.evaluate(borda));
      await outro.evaluate((el: HTMLElement) => el.focus());
      expect(await selecionado.getAttribute("aria-pressed")).toBe("true");
      expect(await selecionado.evaluate(borda)).toEqual(selecao);
      expect(await selecionado.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("-3px");
    } finally {
      await pagina.close();
    }
  },
);

it("setas em busca de opções real ativam navegação de teclado", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.getByRole("combobox", { name: "Escolha" }).click();
    const campo = pagina.getByRole("textbox", { name: "Filtrar opções" });
    await campo.click();
    expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
      "ponteiro",
    );
    const antes = await campo.getAttribute("aria-activedescendant");
    await pagina.keyboard.press("ArrowDown");
    expect(await campo.getAttribute("aria-activedescendant")).not.toBe(antes);
    expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
      "teclado",
    );
  } finally {
    await pagina.close();
  }
});

it("textarea clicada não ganha contorno ao navegar texto", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const campo = pagina.getByRole("textbox", { name: "Observações" });
    await campo.click();
    await pagina.keyboard.type("texto");
    for (const tecla of ["ArrowLeft", "ArrowDown", "Home", "End", "PageUp", "PageDown"]) {
      await pagina.keyboard.press(tecla);
      expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle), tecla).toBe("none");
    }
    await pagina.keyboard.press("Shift+Tab");
    await pagina.keyboard.press("Tab");
    expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  } finally {
    await pagina.close();
  }
});

it("seletor real em cores forçadas preserva seleção e foco desconhecido", async () => {
  const pagina = await navegador.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.evaluate(() => {
      const modulo = document.querySelector(
        'style[data-vite-dev-id*="seletor-turma-chamada.module.css"]',
      );
      if (!modulo) throw new Error("CSS do seletor ausente");
      document.head.append(modulo);
    });
    await pagina.getByRole("button", { name: "Turmas", exact: true }).click();
    const serie = pagina.getByRole("button", { name: "1ª série", exact: true, pressed: true });
    const turma = pagina.getByRole("button", { name: "1ª série A", exact: true, pressed: true });
    const marcaSerie = serie.locator("svg.lucide-check");
    expect(await marcaSerie.isVisible()).toBe(true);
    expect(await turma.locator("svg.lucide-check").count()).toBe(0);
    for (const alvo of [serie, turma]) {
      await alvo.evaluate((el: HTMLElement) => el.focus());
      expect(await alvo.getAttribute("data-foco-desconhecido")).toBe("");
      expect(await alvo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect(await alvo.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("2px");
    }
    expect(await serie.getAttribute("aria-pressed")).toBe("true");
    expect(await marcaSerie.isVisible()).toBe(true);
  } finally {
    await pagina.close();
  }
});

it("foco programático no mesmo campo após desfocar não herda clique antigo", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const campo = pagina.getByRole("textbox", { name: "Nome" });
    await campo.click();
    await campo.evaluate((el: HTMLElement) => el.blur());
    await campo.evaluate((el: HTMLElement) => el.focus());
    expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  } finally {
    await pagina.close();
  }
});

it("clicar em outro campo mantém a origem de ponteiro", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.getByRole("textbox", { name: "Nome" }).click();
    const destino = pagina.getByRole("textbox", { name: "Inválido" });
    await destino.click();
    expect(await destino.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await destino.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  } finally {
    await pagina.close();
  }
});

it.each(["none", "active"] as const)(
  "foco programático em botão após clique em outro botão é perceptível (%s)",
  async (forcedColors) => {
    const pagina = await navegador.newPage({ forcedColors, reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.getByRole("button", { name: "Primeira ação" }).click();
      const destino = pagina.getByRole("button", { name: "Superfície controle" });
      await destino.evaluate((el: HTMLElement) => el.focus());
      expect(await destino.evaluate((el) => document.activeElement === el)).toBe(true);
      const visivel = await destino.evaluate((el) => {
        const css = getComputedStyle(el);
        return (
          (css.outlineStyle !== "none" && css.outlineWidth !== "0px") || css.boxShadow !== "none"
        );
      });
      expect(visivel).toBe(true);
    } finally {
      await pagina.close();
    }
  },
);

it("não mostra contorno no campo clicado e mostra ao navegar por teclado", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const nome = pagina.getByRole("textbox", { name: "Nome" });
    const contorno = () => nome.evaluate((el) => getComputedStyle(el).outlineStyle);
    const antes = await contorno();
    await nome.click();
    expect(await nome.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await contorno()).toBe(antes);
    await pagina.keyboard.press("Shift+Tab");
    await pagina.keyboard.press("Tab");
    expect(await nome.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await contorno()).not.toBe(antes);
  } finally {
    await pagina.close();
  }
});

it("busca integrada só mostra contorno ao receber foco por teclado", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const busca = pagina.getByRole("searchbox", { name: "Buscar" });
    const caixa = busca.locator("..");
    const contorno = () => caixa.evaluate((el) => getComputedStyle(el).outlineStyle);
    const antes = await contorno();
    await busca.click();
    expect(await contorno()).toBe(antes);
    await pagina.keyboard.press("Shift+Tab");
    await pagina.keyboard.press("Tab");
    expect(await busca.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await contorno()).not.toBe(antes);
  } finally {
    await pagina.close();
  }
});

it.each(["claro", "escuro"] as const)(
  "%s: toque, estados persistentes e busca acessível",
  async (tema) => {
    const pagina = await navegador.newPage({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 800 },
      reducedMotion: "reduce",
    });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "escuro",
      );
      expect(await pagina.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
        tema === "escuro",
      );
      const nome = pagina.getByRole("textbox", { name: "Nome" });
      const invalido = pagina.getByRole("textbox", { name: "Inválido" });
      const selecionado = pagina.getByRole("button", { name: "Selecionado" });
      const aparencia = (el: Element) => {
        const css = getComputedStyle(el);
        return { fundo: css.backgroundColor, linha: css.backgroundImage };
      };
      const antesInvalido = await invalido.evaluate(aparencia);
      const antesSelecionado = await selecionado.evaluate(aparencia);
      const antes = await nome.evaluate((el) => getComputedStyle(el).outlineStyle);
      await nome.tap();
      expect(await nome.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await nome.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(antes);
      expect(await invalido.evaluate(aparencia)).toEqual(antesInvalido);
      expect(await selecionado.evaluate(aparencia)).toEqual(antesSelecionado);
      await pagina.keyboard.press("Tab");
      const busca = pagina.getByRole("searchbox", { name: "Buscar" });
      expect(await busca.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await busca.locator("..").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
        "solid",
      );
      await pagina.keyboard.type("abc");
      await pagina.keyboard.press("Tab");
      const limpar = pagina.getByRole("button", { name: "Limpar busca" });
      expect(await limpar.evaluate((el) => document.activeElement === el)).toBe(true);
      const sinal = await limpar.evaluate((el) => {
        const css = getComputedStyle(el);
        return css.outlineStyle !== "none" || css.boxShadow !== "none";
      });
      expect(sinal).toBe(true);
      await pagina.keyboard.press("Enter");
      expect(await busca.inputValue()).toBe("");
      await invalido.tap();
      expect(await invalido.evaluate(aparencia)).toEqual(antesInvalido);
      expect(await invalido.getAttribute("aria-invalid")).toBe("true");
      await selecionado.tap();
      expect(await selecionado.evaluate(aparencia)).toEqual(antesSelecionado);
      expect(await selecionado.getAttribute("aria-pressed")).toBe("true");
    } finally {
      await pagina.close();
    }
  },
);

it("eventos sintéticos e atalhos modificados não mudam modalidade de ponteiro", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.getByRole("textbox", { name: "Nome" }).click();
    await pagina.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
    );
    await pagina.keyboard.press("Control+a");
    expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
      "ponteiro",
    );
    await pagina.keyboard.press("Tab");
    expect(await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco)).toBe(
      "teclado",
    );
  } finally {
    await pagina.close();
  }
});

it("sem rastreamento, Tab mantém indicador de foco disponível", async () => {
  const pagina = await navegador.newPage();
  try {
    await pagina.goto(`${url}?sem-modalidade`);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.keyboard.press("Tab");
    const botao = pagina.getByRole("button", { name: "Primeira ação" });
    expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
    const indicador = await botao.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(indicador).toBe("solid");
    expect(
      await pagina.evaluate(() => document.documentElement.dataset.modalidadeFoco),
    ).toBeUndefined();
  } finally {
    await pagina.close();
  }
});

it.each(["claro", "escuro"] as const)(
  "%s: seleção permanece independente em cores forçadas",
  async (tema) => {
    const pagina = await navegador.newPage({ forcedColors: "active", reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "escuro",
      );
      const selecionado = pagina.getByRole("button", { name: "Selecionado", pressed: true });
      const nome = pagina.getByRole("textbox", { name: "Nome" });
      const sinal = () =>
        selecionado.evaluate((el) => {
          const css = getComputedStyle(el);
          return [css.outlineStyle, css.outlineWidth, css.outlineOffset, css.outlineColor];
        });
      const antes = await sinal();
      expect(antes[0]).toBe("solid");
      expect(antes[1]).toBe("2px");
      expect(antes[2]).toBe("-3px");
      await nome.click();
      expect(await sinal()).toEqual(antes);
      await pagina.keyboard.press("Tab");
      expect(await sinal()).toEqual(antes);
    } finally {
      await pagina.close();
    }
  },
);

it.each(["teclado", "ponteiro"] as const)(
  "diálogo real: %s devolve o foco com indicador acessível",
  async (modo) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      const gatilho = pagina.getByRole("button", { name: "Abrir diálogo" });
      const antes = await gatilho.evaluate((el) => getComputedStyle(el).outlineStyle);
      if (modo === "teclado") {
        for (let i = 0; i < 6; i++) await pagina.keyboard.press("Tab");
        expect(await gatilho.evaluate((el) => document.activeElement === el)).toBe(true);
        await pagina.keyboard.press("Enter");
      } else {
        await gatilho.click();
      }
      await pagina.getByRole("dialog", { name: "Diálogo de teste" }).waitFor();
      expect(
        await pagina
          .getByRole("textbox", { name: "Campo do diálogo" })
          .evaluate((el) => document.activeElement === el),
      ).toBe(true);
      if (modo === "teclado") await pagina.keyboard.press("Escape");
      else await pagina.getByRole("button", { name: "Concluir" }).click();
      await expect.poll(() => gatilho.evaluate((el) => document.activeElement === el)).toBe(true);
      const depois = await gatilho.evaluate((el) => getComputedStyle(el).outlineStyle);
      // O retorno programático após clique tem origem desconhecida: mostra foco por segurança.
      expect(antes).toBe("none");
      expect(depois).toBe("solid");
    } finally {
      await pagina.close();
    }
  },
);

it("botão alterna entre foco visível por teclado e interação de ponteiro", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const botao = pagina.getByRole("button", { name: "Primeira ação" });
    const estilo = () =>
      botao.evaluate((el) => ({
        contorno: getComputedStyle(el).outlineStyle,
        sombra: getComputedStyle(el).boxShadow,
      }));
    const antes = await estilo();
    await pagina.keyboard.press("Tab");
    expect(await botao.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await estilo()).not.toEqual(antes);
    await pagina.getByRole("textbox", { name: "Nome" }).click();
    await botao.click();
    expect(await estilo()).toEqual(antes);
  } finally {
    await pagina.close();
  }
});

it.each(["claro", "escuro"] as const)(
  "%s: cores forçadas mantêm foco por teclado sem contorno ao clicar no campo",
  async (tema) => {
    const pagina = await navegador.newPage({ reducedMotion: "reduce", forcedColors: "active" });
    try {
      await pagina.goto(url);
      await pagina.locator('[data-pronto="sim"]').waitFor();
      await pagina.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "escuro",
      );
      expect(await pagina.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
        tema === "escuro",
      );
      const nome = pagina.getByRole("textbox", { name: "Nome" });
      const contorno = () => nome.evaluate((el) => getComputedStyle(el).outlineStyle);
      const antes = await contorno();
      await nome.click();
      expect(await nome.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await contorno()).toBe(antes);
      await pagina.keyboard.press("Shift+Tab");
      await pagina.keyboard.press("Tab");
      expect(await nome.evaluate((el) => document.activeElement === el)).toBe(true);
      expect(await contorno()).toBe("solid");
      expect(await nome.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("2px");
    } finally {
      await pagina.close();
    }
  },
);

it("label direto não deixa marcador; foco desconhecido é limpo no clique e desfoco", async () => {
  const pagina = await navegador.newPage({ reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    await pagina.evaluate(() => {
      const label = document.createElement("label");
      label.textContent = "Rótulo externo";
      label.htmlFor = "campo-rotulado";
      const input = document.createElement("input");
      input.id = "campo-rotulado";
      document.querySelector("main")?.append(label, input);
    });
    const campo = pagina.locator("#campo-rotulado");
    await pagina.getByText("Rótulo externo").click();
    expect(await campo.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await campo.getAttribute("data-foco-desconhecido")).toBeNull();
    await pagina.getByRole("button", { name: "Primeira ação" }).click();
    await campo.evaluate((el: HTMLElement) => el.focus());
    expect(await campo.getAttribute("data-foco-desconhecido")).toBe("");
    expect(await campo.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await campo.click();
    expect(await campo.getAttribute("data-foco-desconhecido")).toBeNull();
    await pagina
      .getByRole("button", { name: "Superfície controle" })
      .evaluate((el: HTMLElement) => el.focus());
    expect(await campo.getAttribute("data-foco-desconhecido")).toBeNull();
    const destino = pagina.getByRole("button", { name: "Superfície controle" });
    expect(await destino.getAttribute("data-foco-desconhecido")).toBe("");
    await destino.evaluate((el: HTMLElement) => el.blur());
    expect(await destino.getAttribute("data-foco-desconhecido")).toBeNull();
  } finally {
    await pagina.close();
  }
});

it("foco desconhecido preserva seleção e erro em cores forçadas", async () => {
  const pagina = await navegador.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await pagina.goto(url);
    await pagina.locator('[data-pronto="sim"]').waitFor();
    const selecionado = pagina.getByRole("button", { name: "Selecionado" });
    const invalido = pagina.getByRole("textbox", { name: "Inválido" });
    const aparencia = (el: Element) => {
      const css = getComputedStyle(el);
      return { fundo: css.backgroundColor, borda: css.borderColor, linha: css.backgroundImage };
    };
    const selecaoAntes = await selecionado.evaluate((el) => getComputedStyle(el).outlineOffset);
    const erroAntes = await invalido.evaluate(aparencia);
    await pagina.getByRole("button", { name: "Primeira ação" }).click();
    await selecionado.evaluate((el: HTMLElement) => el.focus());
    expect(await selecionado.getAttribute("data-foco-desconhecido")).toBe("");
    expect(await selecionado.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("2px");
    expect(selecaoAntes).toBe("-3px");
    expect(await selecionado.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
    await invalido.evaluate((el: HTMLElement) => el.focus());
    expect(await invalido.evaluate(aparencia)).toEqual(erroAntes);
    expect(await invalido.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("2px");
    expect(await invalido.getAttribute("aria-invalid")).toBe("true");
  } finally {
    await pagina.close();
  }
});
