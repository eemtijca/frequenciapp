// Repro sintético do filtro interno, não do gatilho do seletor.
import { expect, test, type Locator } from "@playwright/test";

type Rgba = [number, number, number, number];
type Linha = { estilo: string; largura: number; cor: Rgba };
type Amostra = { fundo: Rgba; outline: Linha; bordas: Linha[] }[];

// Retorna a pintura computada do input e da moldura imediata. Sombras não contam:
// em forced-colors elas podem ser suprimidas pelo navegador.
async function amostrar(alvo: Locator): Promise<Amostra> {
  return alvo.evaluate((input) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const cor = (valor: string): Rgba => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = valor;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    const superficie = (elemento: Element | null): Rgba => {
      const camadas: string[] = [];
      for (let atual = elemento; atual; atual = atual.parentElement)
        camadas.push(getComputedStyle(atual).backgroundColor);
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "Canvas";
      ctx.fillRect(0, 0, 1, 1);
      for (const camada of camadas.reverse()) {
        ctx.fillStyle = camada;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    if (!input.parentElement) throw new Error("Moldura ausente");
    return [input, input.parentElement].map((elemento) => {
      const s = getComputedStyle(elemento);
      return {
        fundo: superficie(elemento.parentElement),
        outline: {
          estilo: s.outlineStyle,
          largura: parseFloat(s.outlineWidth),
          cor: cor(s.outlineColor),
        },
        bordas: (["Top", "Right", "Bottom", "Left"] as const).map((lado) => ({
          estilo: s[`border${lado}Style`],
          largura: parseFloat(s[`border${lado}Width`]),
          cor: cor(s[`border${lado}Color`]),
        })),
      };
    });
  });
}

function mesclar(cor: Rgba, fundo: Rgba): Rgba {
  const a = cor[3] / 255;
  return [
    cor[0] * a + fundo[0] * (1 - a),
    cor[1] * a + fundo[1] * (1 - a),
    cor[2] * a + fundo[2] * (1 - a),
    255,
  ];
}

function contraste(a: Rgba, b: Rgba): number {
  const lum = (c: Rgba) => {
    const linear = c.slice(0, 3).map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x ?? 0, y ?? 0) + 0.05) / (Math.min(x ?? 0, y ?? 0) + 0.05);
}

function pintada(linha: Linha): boolean {
  return linha.largura > 0 && !["none", "hidden"].includes(linha.estilo) && linha.cor[3] > 0;
}

// Critério conservador: uma linha visível do campo ou da sua moldura deve mudar
// com o foco e atingir 3:1 tanto contra a pintura anterior quanto a superfície.
function indicador(foco: Amostra, semFoco: Amostra): boolean {
  return foco.some((atual, i) => {
    const anterior = semFoco[i];
    if (!anterior) return false;
    return [atual.outline, ...atual.bordas].some((linha, j) => {
      if (!pintada(linha)) return false;
      const velha = [anterior.outline, ...anterior.bordas][j];
      if (!velha) return false;
      const novaCor = mesclar(linha.cor, atual.fundo);
      const antigaCor = pintada(velha) ? mesclar(velha.cor, anterior.fundo) : anterior.fundo;
      return contraste(novaCor, atual.fundo) >= 3 && contraste(novaCor, antigaCor) >= 3;
    });
  });
}

for (const tema of ["claro", "escuro"] as const) {
  test(`filtro interno tem indicador distinto em cores forçadas (${tema})`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.goto("/tests/fixtures/foco-forcado/");
    await page.locator('[data-fixture="pronta"]').waitFor();
    await page.evaluate(
      (escuro) => document.documentElement.classList.toggle("dark", escuro),
      tema === "escuro",
    );
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    expect(await page.locator("html").evaluate((el) => el.classList.contains("dark"))).toBe(
      tema === "escuro",
    );

    const gatilho = page.getByRole("combobox", { name: "Turma" });
    await expect(gatilho).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(gatilho).toBeFocused();
    await page.keyboard.press("Enter");
    const filtro = page.getByRole("textbox", { name: "Filtrar opções" });
    await expect(filtro).toBeVisible();
    await expect(filtro).toBeFocused();
    expect(await gatilho.getAttribute("aria-expanded")).toBe("true");
    const focado = await amostrar(filtro);
    await filtro.evaluate((el: HTMLInputElement) => el.blur());
    await expect(filtro).not.toBeFocused();
    await expect(filtro).toBeVisible();
    const desfocado = await amostrar(filtro);
    expect(indicador(focado, desfocado), JSON.stringify({ tema, focado, desfocado }, null, 2)).toBe(
      true,
    );
  });
}

for (const tema of ["claro", "escuro"] as const) {
  test(`regra de cores forçadas não altera a aparência normal (${tema})`, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    await page.goto("/tests/fixtures/foco-forcado/");
    await page.locator('[data-fixture="pronta"]').waitFor();
    await page.evaluate(
      (escuro) => document.documentElement.classList.toggle("dark", escuro),
      tema === "escuro",
    );
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(false);
    const gatilho = page.getByRole("combobox", { name: "Turma" });
    await page.keyboard.press("Tab");
    await expect(gatilho).toBeFocused();
    await page.keyboard.press("Enter");
    const filtro = page.getByRole("textbox", { name: "Filtrar opções" });
    await expect(filtro).toBeFocused();

    // Compara os estilos reais antes/depois de remover apenas a nova regra,
    // sem depender de valores absolutos que variam entre navegadores.
    const comparar = await page.evaluate(() => {
      const elementos = [
        document.querySelector('[role="combobox"][aria-label="Turma"]'),
        document.querySelector('input[aria-label="Filtrar opções"]'),
      ];
      const propriedades = [
        "outline-style",
        "outline-width",
        "outline-color",
        "outline-offset",
        "border-top-color",
        "background-color",
        "box-shadow",
      ];
      const estilos = () =>
        elementos.map((el) => {
          if (!el) throw new Error("Elemento da fixture ausente");
          const estilo = getComputedStyle(el);
          return propriedades.map((prop) => estilo.getPropertyValue(prop));
        });
      const antes = estilos();
      let regras = 0;
      for (const folha of Array.from(document.styleSheets)) {
        for (const regra of Array.from(folha.cssRules)) {
          if (!(regra instanceof CSSMediaRule) || !regra.conditionText.includes("forced-colors"))
            continue;
          for (const interna of Array.from(regra.cssRules)) {
            if (
              interna instanceof CSSStyleRule &&
              interna.selectorText.includes("campo-integrado") &&
              interna.selectorText.includes("aria-autocomplete")
            ) {
              interna.style.cssText = "";
              regras++;
            }
          }
        }
      }
      return { antes, depois: estilos(), regras };
    });
    expect(comparar.regras).toBe(1);
    expect(comparar.depois).toEqual(comparar.antes);
  });
}

test("controle positivo e negativo calibram a comparação de pintura", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/tests/fixtures/foco-forcado/");
  await page.locator('[data-fixture="pronta"]').waitFor();
  await page.evaluate(() => {
    const estilo = document.createElement("style");
    estilo.textContent = `.controle-teste { border: 0 !important; outline: none !important; box-shadow: none !important; }
      .controle-positivo:focus { outline: 2px solid CanvasText !important; }`;
    document.head.append(estilo);
    for (const tipo of ["positivo", "negativo"]) {
      const input = document.createElement("input");
      input.className = `controle-teste controle-${tipo}`;
      input.setAttribute("aria-label", `Controle ${tipo}`);
      document.body.append(input);
    }
  });
  for (const tipo of ["positivo", "negativo"]) {
    const alvo = page.getByLabel(`Controle ${tipo}`);
    const antes = await amostrar(alvo);
    await alvo.focus();
    await expect(alvo).toBeFocused();
    const depois = await amostrar(alvo);
    expect(indicador(depois, antes), tipo).toBe(tipo === "positivo");
    await alvo.evaluate((el: HTMLInputElement) => el.blur());
  }
});
