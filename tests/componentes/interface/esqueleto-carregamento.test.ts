// Testa a reserva da gaveta no esqueleto real em Chromium com fixture Vite isolada.
import { writeFile } from "node:fs/promises";
import type { Browser, Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { abrirChromium } from "../../apoio/navegador";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

const larguras = [320, 904, 905, 960, 1239, 1240] as const;
const destinoMedidas = process.env.MEDIDAS_ESQUELETO;
let servidor: ServidorFixture;
let navegador: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/esqueleto-carregamento.html");
  navegador = await abrirChromium();
});

afterAll(async () => {
  try {
    if (destinoMedidas) {
      await writeFile(
        destinoMedidas,
        `${JSON.stringify({ partida: 1, casos: medidas }, null, 2)}\n`,
      );
    }
  } finally {
    await navegador?.close();
    await servidor?.fechar();
  }
});

async function medirEsqueleto(pagina: Page) {
  return pagina.evaluate(() => {
    const reserva = document.querySelector("[data-reserva-gaveta]");
    const coluna = document.querySelector("[data-coluna-conteudo]");
    if (!(reserva instanceof HTMLElement) || !(coluna instanceof HTMLElement)) {
      throw new Error("Caixas do esqueleto ausentes.");
    }
    function medirCaixa(elemento: HTMLElement) {
      const caixa = elemento.getBoundingClientRect();
      const estilo = getComputedStyle(elemento);
      return {
        x: caixa.x,
        y: caixa.y,
        largura: caixa.width,
        altura: caixa.height,
        clientWidth: elemento.clientWidth,
        offsetWidth: elemento.offsetWidth,
        display: estilo.display,
        widthComputado: estilo.width,
        flexShrink: estilo.flexShrink,
      };
    }
    const documento = document.documentElement;
    const corpo = document.body;
    return {
      janela: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        visualViewportEscala: window.visualViewport?.scale ?? null,
      },
      tema: {
        atributoEsquema: documento.getAttribute("data-mui-color-scheme"),
        colorSchemeComputado: getComputedStyle(documento).colorScheme,
        fundoBody: getComputedStyle(corpo).backgroundColor,
        prefereEscuro: window.matchMedia("(prefers-color-scheme: dark)").matches,
      },
      reserva: medirCaixa(reserva),
      coluna: medirCaixa(coluna),
      overflow: {
        documento: documento.scrollWidth - documento.clientWidth,
        corpo: corpo.scrollWidth - corpo.clientWidth,
      },
    };
  });
}

const medidas: Array<Awaited<ReturnType<typeof medirEsqueleto>>> = [];

for (const largura of larguras) {
  it(`reserva da gaveta a ${largura}×900 no escuro`, async () => {
    const pagina = await navegador.newPage({
      colorScheme: "dark",
      viewport: { width: largura, height: 900 },
    });
    try {
      await pagina.goto(servidor.url);
      await pagina.locator("html[data-fixture='pronta']").waitFor();
      await expect
        .poll(() => pagina.locator("html").getAttribute("data-mui-color-scheme"))
        .toBe("dark");
      await expect
        .poll(() => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .toBe("rgb(20, 20, 19)");
      const medida = await medirEsqueleto(pagina);
      medidas.push(medida);

      expect(medida.janela).toEqual({
        innerWidth: largura,
        innerHeight: 900,
        devicePixelRatio: 1,
        visualViewportEscala: 1,
      });
      expect(medida.tema).toEqual({
        atributoEsquema: "dark",
        colorSchemeComputado: "dark",
        fundoBody: "rgb(20, 20, 19)",
        prefereEscuro: true,
      });

      const comReserva = largura >= 905;
      expect(medida.reserva).toMatchObject({
        x: 0,
        largura: comReserva ? 256 : 0,
        clientWidth: comReserva ? 255 : 0,
        offsetWidth: comReserva ? 256 : 0,
        display: comReserva ? "block" : "none",
        widthComputado: "256px",
        flexShrink: "0",
      });
      expect(medida.coluna).toMatchObject({
        x: comReserva ? 256 : 0,
        largura: comReserva ? largura - 256 : largura,
        clientWidth: comReserva ? largura - 256 : largura,
        offsetWidth: comReserva ? largura - 256 : largura,
        display: "flex",
      });
      expect(medida.overflow).toEqual({ documento: 0, corpo: 0 });
    } finally {
      await pagina.close();
    }
  });
}
