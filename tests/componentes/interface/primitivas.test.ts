// Matriz de contraste e forma das primitivas de campo nos dois temas.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Browser, Page } from "@playwright/test";
import { contraste, type Rgb } from "../../helpers/cor";
import { abrirChromium, aguardarTema } from "../../apoio/navegador";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let browser: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/contraste-campos.html");
  browser = await abrirChromium();
}, 120000);

afterAll(async () => {
  await browser?.close();
  await servidor?.fechar();
});

interface Medida {
  fundo: Rgb;
  preenchimento: Rgb;
  borda: Rgb;
  texto: Rgb;
  raio: string;
  bordaPx: string;
  altura: number;
}

async function medir(page: Page, rotulo: string): Promise<Medida> {
  return page.getByLabel(rotulo, { exact: true }).evaluate((alvo) => {
    const campo =
      alvo.closest(".campo:not(.campo-integrado)") ?? alvo.closest(".campo")?.parentElement ?? alvo;
    const area = alvo.closest("[data-superficie]");
    const fundo =
      area?.getAttribute("data-superficie") === "pagina"
        ? document.body
        : (area?.parentElement ?? document.body);
    const contexto = document.createElement("canvas").getContext("2d");
    if (!contexto) throw new Error("Canvas indisponível");
    const cor = (valor: string): Rgb => {
      contexto.clearRect(0, 0, 1, 1);
      contexto.fillStyle = valor;
      contexto.fillRect(0, 0, 1, 1);
      return Array.from(contexto.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((v) => v / 255) as Rgb;
    };
    const estilo = getComputedStyle(campo);
    const texto = getComputedStyle(alvo);
    return {
      fundo: cor(getComputedStyle(fundo).backgroundColor),
      preenchimento: cor(estilo.backgroundColor),
      borda: cor(estilo.borderTopColor),
      texto: cor(texto.color),
      raio: estilo.borderRadius,
      bordaPx: estilo.borderTopWidth,
      altura: campo.getBoundingClientRect().height,
    };
  });
}

for (const tema of ["light", "dark"] as const) {
  for (const superficie of ["pagina", "cartao"] as const) {
    it(`primitivas em ${tema}, sobre ${superficie}`, async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      try {
        await page.goto(servidor.url);
        await aguardarTema(page, tema);

        for (const tipo of ["Texto", "Seletor", "Buscável", "Busca"] as const) {
          const medida = await medir(page, `${tipo} ${superficie}`);
          expect(medida.bordaPx, `${tipo}: borda`).toBe("1px");
          expect(medida.raio, `${tipo}: raio`).toBe("16px");
          expect(medida.altura, `${tipo}: altura`).toBeGreaterThanOrEqual(43.99);
          expect(
            contraste(medida.borda, medida.fundo),
            `${tipo}: contraste da borda`,
          ).toBeGreaterThanOrEqual(3);
          expect(
            contraste(medida.texto, medida.preenchimento),
            `${tipo}: contraste do texto`,
          ).toBeGreaterThanOrEqual(4.5);
        }

        const desabilitado = await medir(page, `Desabilitado ${superficie}`);
        const estiloDesabilitado = await page
          .getByLabel(`Desabilitado ${superficie}`, { exact: true })
          .evaluate((el) => getComputedStyle(el).opacity);
        expect(estiloDesabilitado, "desabilitado: opacidade").toBe("1");
        expect(
          contraste(desabilitado.texto, desabilitado.preenchimento),
          "desabilitado: contraste",
        ).toBeGreaterThanOrEqual(3);

        const normal = await medir(page, `Texto ${superficie}`);
        const invalido = await medir(page, `Inválido ${superficie}`);
        expect(invalido.borda, "inválido: borda distinta").not.toEqual(normal.borda);
      } finally {
        await page.close();
      }
    });
  }
}

it("foco visível e cores forçadas", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    forcedColors: "active",
  });
  try {
    await page.goto(servidor.url);
    const campo = page.getByLabel("Texto pagina", { exact: true });
    await campo.focus();
    const foco = await campo.evaluate((el) => {
      const estilo = getComputedStyle(el);
      return {
        visivel: el.matches(":focus-visible"),
        contorno: estilo.outlineStyle,
        largura: estilo.outlineWidth,
      };
    });
    expect(foco.visivel).toBe(true);
    expect(foco.contorno).toBe("solid");
    expect(foco.largura).toBe("2px");
  } finally {
    await page.close();
  }
});
