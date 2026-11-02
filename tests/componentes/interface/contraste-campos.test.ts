// Contraste da borda usada para identificar campos sem foco no tema claro.
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { contraste, type Rgb } from "../../helpers/cor";

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
  url = `http://localhost:${endereco.port}/tests/componentes/interface/contraste-campos.html`;
  browser = await chromium.launch({ headless: true });
}, 120000);

afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

it("campos têm superfície leve e contorno distinto no tema claro", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    for (const tema of ["claro"]) {
      await page.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "escuro",
      );
      await page.waitForTimeout(250); // Aguarda a transição real de cores terminar.
      for (const superficie of ["pagina", "cartao"]) {
        for (const tipo of ["Texto", "Seletor", "Buscável", "Busca"]) {
          const alvo = page.getByLabel(`${tipo} ${superficie}`);
          const campo = tipo === "Busca" ? alvo.locator("..") : alvo;
          const cores = await campo.evaluate((el) => {
            const contexto = document.createElement("canvas").getContext("2d");
            if (!contexto) throw new Error("Canvas indisponível");
            const cor = (valor: string, fundo?: string) => {
              contexto.clearRect(0, 0, 1, 1);
              if (fundo) {
                contexto.fillStyle = fundo;
                contexto.fillRect(0, 0, 1, 1);
              }
              contexto.fillStyle = valor;
              contexto.fillRect(0, 0, 1, 1);
              return Array.from(contexto.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((v) => v / 255) as Rgb;
            };
            const estilo = getComputedStyle(el);
            const area = el.closest("[data-superficie]");
            if (!area || !area.parentElement) throw new Error("Superfície ausente");
            const fundo = getComputedStyle(
              area.getAttribute("data-superficie") === "pagina"
                ? document.body
                : area.parentElement,
            ).backgroundColor;
            return {
              fundo: cor(fundo),
              preenchimento: cor(estilo.backgroundColor, fundo),
              borda: cor(estilo.borderTopColor, fundo),
              texto: cor(estilo.color, estilo.backgroundColor),
            };
          });
          expect(
            contraste(cores.preenchimento, cores.fundo),
            `${tema}/${superficie}/${tipo}: superfície`,
          ).toBeLessThan(1.2);
          expect(
            contraste(cores.borda, cores.fundo),
            `${tema}/${superficie}/${tipo}: contorno`,
          ).toBeGreaterThanOrEqual(3);
          expect(
            contraste(cores.texto, cores.preenchimento),
            `${tema}/${superficie}/${tipo}: texto`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  } finally {
    await page.close();
  }
}, 120000);

for (const superficie of ["pagina", "cartao"] as const) {
  for (const tipo of ["Texto", "Seletor"] as const) {
    it(`borda de ${tipo} identificável sobre ${superficie} no tema claro`, async () => {
      const page = await browser.newPage({ reducedMotion: "reduce" });
      try {
        await page.goto(url);
        await page.mouse.move(0, 0);
        const campo = page.getByLabel(`${tipo} ${superficie}`);
        await campo.waitFor({ state: "visible" });
        const medidas = await campo.evaluate((el) => {
          const estilo = getComputedStyle(el);
          const superficie = el.closest("[data-superficie]");
          if (!superficie) throw new Error("Superfície ausente");
          const fundo =
            superficie.getAttribute("data-superficie") === "pagina"
              ? document.body
              : superficie.parentElement;
          if (!fundo) throw new Error("Fundo ausente");
          const ctx = document.createElement("canvas").getContext("2d");
          if (!ctx) throw new Error("Canvas indisponível");
          const cor = (valor: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = valor;
            ctx.fillRect(0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data);
          };
          return {
            largura: estilo.borderTopWidth,
            estilo: estilo.borderTopStyle,
            borda: cor(estilo.borderTopColor),
            preenchimento: cor(estilo.backgroundColor),
            fundo: cor(getComputedStyle(fundo).backgroundColor),
          };
        });
        expect(medidas.largura).toBe("1px");
        expect(medidas.estilo).toBe("solid");
        expect(medidas.borda[3]).toBe(255);
        expect(medidas.fundo).toEqual(
          superficie === "pagina" ? [246, 246, 246, 255] : [255, 255, 255, 255],
        );
        const rgb = (cor: number[]): Rgb => {
          const [r, g, b] = cor;
          if (r === undefined || g === undefined || b === undefined)
            throw new Error("Cor incompleta");
          return [r / 255, g / 255, b / 255];
        };
        const proporcao = contraste(rgb(medidas.borda), rgb(medidas.fundo));
        // O preenchimento sozinho não identifica a área do campo nesta superfície.
        expect(contraste(rgb(medidas.preenchimento), rgb(medidas.fundo))).toBeLessThan(3);
        expect(proporcao, `borda ${medidas.borda}, fundo ${medidas.fundo}`).toBeGreaterThanOrEqual(
          3,
        );
      } finally {
        await page.close();
      }
    }, 120000);
  }
}

it("a busca integrada usa a borda do contêiner, não a do input interno", async () => {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  try {
    await page.goto(url);
    const busca = page.getByRole("searchbox", { name: "Busca pagina" });
    await busca.waitFor({ state: "visible" });
    const bordas = await busca.evaluate((el) => {
      const pai = el.parentElement;
      if (!pai) throw new Error("Contêiner da busca ausente");
      return {
        interna: getComputedStyle(el).borderTopWidth,
        externa: getComputedStyle(pai).borderTopWidth,
        estiloExterno: getComputedStyle(pai).borderTopStyle,
      };
    });
    expect(bordas).toEqual({ interna: "0px", externa: "1px", estiloExterno: "solid" });
  } finally {
    await page.close();
  }
}, 120000);

it("todos os campos indicam foco e preservam a seleção em cores forçadas", async () => {
  const page = await browser.newPage({ forcedColors: "active", reducedMotion: "reduce" });
  try {
    await page.goto(url);
    for (const nome of ["Texto", "Seletor", "Buscável", "Busca"]) {
      const alvo = page.getByLabel(`${nome} pagina`);
      await alvo.focus();
      const moldura = nome === "Busca" ? alvo.locator("..") : alvo;
      const foco = await moldura.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return { estilo: estilo.outlineStyle, largura: parseFloat(estilo.outlineWidth) };
      });
      expect(foco.estilo, nome).toBe("solid");
      expect(foco.largura, nome).toBeGreaterThanOrEqual(2);
    }
    await page.getByLabel("Seletor pagina").click();
    await page.getByRole("option", { name: "Um", exact: true }).click();
    await page.getByLabel("Texto pagina").focus();
    expect(await page.getByLabel("Seletor pagina").innerText()).toContain("Um");
    await page.getByLabel("Buscável pagina").click();
    await page.getByRole("option", { name: "Dois" }).click();
    await page.getByLabel("Texto pagina").focus();
    expect(await page.getByLabel("Buscável pagina").innerText()).toContain("Dois");
  } finally {
    await page.close();
  }
}, 120000);

for (const escuro of [false, true]) {
  it(`a busca integrada mantém uma borda e foco em cores forçadas no tema ${escuro ? "escuro" : "claro"}`, async () => {
    const page = await browser.newPage({ forcedColors: "active", reducedMotion: "reduce" });
    try {
      await page.goto(url);
      await page.evaluate(
        (ativo) => document.documentElement.classList.toggle("dark", ativo),
        escuro,
      );
      const busca = page.getByLabel("Busca pagina");
      await busca.focus();
      const estilos = await busca.evaluate((el) => {
        if (!el.parentElement) throw new Error("Moldura ausente");
        const campo = getComputedStyle(el);
        const moldura = getComputedStyle(el.parentElement);
        return {
          bordaCampo: campo.borderTopWidth,
          bordaMoldura: moldura.borderTopWidth,
          focoCampo: campo.outlineStyle,
          focoMoldura: moldura.outlineStyle,
        };
      });
      expect(estilos.bordaCampo).toBe("0px");
      expect(estilos.bordaMoldura).toBe("1px");
      expect([estilos.focoCampo, estilos.focoMoldura]).toContain("solid");
    } finally {
      await page.close();
    }
  }, 120000);
}

for (const largura of [320, 390, 1280]) {
  for (const escuro of [false, true]) {
    it(`campos mantêm interação e foco em ${largura}px, tema ${escuro ? "escuro" : "claro"}`, async () => {
      const page = await browser.newPage({
        viewport: { width: largura, height: 900 },
        reducedMotion: "reduce",
      });
      try {
        await page.goto(url);
        await page.evaluate(
          (ativo) => document.documentElement.classList.toggle("dark", ativo),
          escuro,
        );
        const texto = page.getByLabel("Texto pagina");
        await texto.fill("Valor preservado");
        await texto.focus();
        expect(await texto.inputValue()).toBe("Valor preservado");
        const foco = await texto.evaluate((el) => ({
          estilo: getComputedStyle(el).outlineStyle,
          largura: getComputedStyle(el).outlineWidth,
          sombra: getComputedStyle(el).boxShadow,
        }));
        if (escuro) {
          expect(foco.sombra).not.toBe("none"); // Foco original do tema escuro.
        } else {
          expect(foco.estilo).toBe("solid");
          expect(parseFloat(foco.largura)).toBeGreaterThanOrEqual(2);
        }
        for (const nome of ["Texto", "Seletor", "Buscável", "Inválido", "Desabilitado", "Senha"]) {
          const caixa = await page.getByLabel(`${nome} pagina`).boundingBox();
          if (!caixa) throw new Error(`${nome}: campo sem caixa visível`);
          expect(caixa.height, nome).toBeGreaterThanOrEqual(43.99);
          expect(caixa.x + caixa.width, nome).toBeLessThanOrEqual(largura);
        }
        expect(await page.getByLabel("Desabilitado pagina").isDisabled()).toBe(true);
        const invalido = page.getByLabel("Inválido pagina");
        expect(await invalido.getAttribute("aria-invalid")).toBe("true");
        expect(await invalido.evaluate((el) => getComputedStyle(el).borderColor)).not.toBe(
          await texto.evaluate((el) => getComputedStyle(el).borderColor),
        );
        const busca = page.getByLabel("Busca pagina");
        await busca.fill("termo");
        expect(await busca.inputValue()).toBe("termo");
        expect(await busca.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
        const focoBusca = await busca.locator("..").evaluate((el) => ({
          outline: getComputedStyle(el).outlineStyle,
          sombra: getComputedStyle(el).boxShadow,
        }));
        if (escuro) expect(focoBusca.sombra).not.toBe("none");
        else expect(focoBusca.outline).toBe("solid");
        await page.getByRole("button", { name: "Limpar busca" }).click();
        expect(await busca.inputValue()).toBe("");
        await page.getByLabel("Buscável pagina").click();
        const filtro = page.getByLabel("Filtrar opções");
        expect(await filtro.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
        await filtro.fill("Dois");
        await page.getByRole("option", { name: "Dois" }).click();
        expect(await page.getByRole("combobox", { name: "Buscável pagina" }).innerText()).toContain(
          "Dois",
        );
        await page.getByLabel("Seletor pagina").click();
        await page.getByRole("option", { name: "Um", exact: true }).click();
        expect(await page.getByLabel("Seletor pagina").innerText()).toContain("Um");
        await page.getByRole("button", { name: "Mostrar senha" }).first().click();
        expect(await page.getByLabel("Senha pagina").getAttribute("type")).toBe("text");
        expect(await page.getByLabel("Senha pagina").inputValue()).toBe("senha-teste");
        const destino = path.join(tmpdir(), "frequenciapp-outline-campos");
        await mkdir(destino, { recursive: true });
        await page.screenshot({
          path: path.join(destino, `${largura}-${escuro ? "escuro" : "claro"}.png`),
          fullPage: true,
        });
      } finally {
        await page.close();
      }
    }, 120000);
  }
}
