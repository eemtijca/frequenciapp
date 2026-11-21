// Mede altura, forma, contraste e estados dos campos MUI reais nos dois temas.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Browser, Page } from "@playwright/test";
import { contraste, deltaE, type Rgb } from "../../helpers/cor";
import { abrirChromium, aguardarTema } from "../../apoio/navegador";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { TOKENS_LAYOUT } from "../../../src/theme/layout";

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

const TIPOS = ["Texto", "Pequeno", "Seletor", "Buscável", "Busca"] as const;
type Tipo = (typeof TIPOS)[number];

// O campo médio tem 56 dp; o pequeno, 40 dp; a busca usa o alvo de toque de 48 dp.
const ALTURAS: Record<Tipo, number> = {
  Texto: TOKENS_LAYOUT.campo.medio,
  Pequeno: TOKENS_LAYOUT.campo.pequeno,
  Seletor: TOKENS_LAYOUT.campo.medio,
  Buscável: TOKENS_LAYOUT.campo.medio,
  Busca: TOKENS_LAYOUT.alvoToque,
};

interface Medida {
  preenchimento: Rgb;
  borda: Rgb;
  texto: Rgb;
  raio: string;
  bordaPx: string;
  altura: number;
}

interface MedidaFoco {
  ativo: boolean;
  focoVisivel: boolean;
  sombra: string;
  bordaPx: string;
  bordaFoco: Rgb;
  tokenFoco: Rgb;
}

async function medir(page: Page, rotulo: string): Promise<Medida> {
  return page.getByLabel(rotulo, { exact: true }).evaluate((alvo) => {
    const campo = alvo.closest(".MuiOutlinedInput-root, .MuiInputBase-root");
    if (!campo) throw new Error("Raiz do campo ausente");
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
    const compor = (valor: string, base: Rgb): Rgb => {
      contexto.clearRect(0, 0, 1, 1);
      contexto.fillStyle = `rgb(${base.map((canal) => Math.round(canal * 255)).join(" ")})`;
      contexto.fillRect(0, 0, 1, 1);
      contexto.fillStyle = valor;
      contexto.fillRect(0, 0, 1, 1);
      return Array.from(contexto.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((v) => v / 255) as Rgb;
    };
    const estilo = getComputedStyle(campo);
    const notched = campo.querySelector(".MuiOutlinedInput-notchedOutline");
    const estiloBorda = notched ? getComputedStyle(notched) : estilo;
    const fundoMedido = cor(getComputedStyle(fundo).backgroundColor);
    const preenchimento = compor(estilo.backgroundColor, fundoMedido);
    return {
      preenchimento,
      borda: compor(estiloBorda.borderTopColor, preenchimento),
      texto: compor(getComputedStyle(alvo).color, preenchimento),
      raio: estilo.borderRadius,
      bordaPx: estiloBorda.borderTopWidth,
      altura: campo.getBoundingClientRect().height,
    };
  });
}

async function medirFoco(page: Page, rotulo: string): Promise<MedidaFoco> {
  const alvo = page.getByLabel(rotulo, { exact: true });
  await alvo.focus();
  await page.waitForTimeout(180);
  return alvo.evaluate((elemento) => {
    const campo = elemento.closest(".MuiOutlinedInput-root, .MuiInputBase-root");
    if (!campo) throw new Error("Raiz do campo ausente");
    const notched = campo.querySelector(".MuiOutlinedInput-notchedOutline");
    if (!notched) throw new Error("Borda do campo ausente");
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
    const compor = (valor: string, base: Rgb): Rgb => {
      contexto.clearRect(0, 0, 1, 1);
      contexto.fillStyle = `rgb(${base.map((canal) => Math.round(canal * 255)).join(" ")})`;
      contexto.fillRect(0, 0, 1, 1);
      contexto.fillStyle = valor;
      contexto.fillRect(0, 0, 1, 1);
      return Array.from(contexto.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((v) => v / 255) as Rgb;
    };
    const sonda = document.createElement("span");
    sonda.style.color = "var(--template-palette-primary-main)";
    document.body.append(sonda);
    const tokenFoco = getComputedStyle(sonda).color;
    sonda.remove();
    const preenchimento = cor(getComputedStyle(campo).backgroundColor);
    const estiloBorda = getComputedStyle(notched);
    return {
      ativo: elemento === document.activeElement,
      focoVisivel: elemento.matches(":focus-visible"),
      contorno: getComputedStyle(campo).outlineStyle,
      larguraContorno: getComputedStyle(campo).outlineWidth,
      bordaPx: estiloBorda.borderTopWidth,
      bordaFoco: compor(estiloBorda.borderTopColor, preenchimento),
      tokenFoco: cor(tokenFoco),
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

        for (const tipo of TIPOS) {
          const medida = await medir(page, `${tipo} ${superficie}`);
          expect(Math.round(medida.altura), `${tipo}: altura`).toBe(ALTURAS[tipo]);
          expect(medida.raio, `${tipo}: raio`).toBe(`${TOKENS_LAYOUT.campo.raio}px`);
          expect(medida.bordaPx, `${tipo}: borda`).toBe("1px");
          expect(
            contraste(medida.texto, medida.preenchimento),
            `${tipo}: contraste do texto`,
          ).toBeGreaterThanOrEqual(4.5);
          // O contorno identifica o campo mesmo antes do foco.
          expect(
            contraste(medida.borda, medida.preenchimento),
            `${tipo}: fio do campo`,
          ).toBeGreaterThanOrEqual(3);
        }

        const normal = await medir(page, `Texto ${superficie}`);
        const desabilitado = await medir(page, `Desabilitado ${superficie}`);
        expect(
          await page.getByLabel(`Desabilitado ${superficie}`, { exact: true }).isDisabled(),
          "desabilitado: atributo",
        ).toBe(true);
        expect(desabilitado.texto, "desabilitado: texto distinto").not.toEqual(normal.texto);
        expect(desabilitado.borda, "desabilitado: borda distinta").not.toEqual(normal.borda);

        const invalido = await medir(page, `Inválido ${superficie}`);
        expect(
          await page
            .getByLabel(`Inválido ${superficie}`, { exact: true })
            .getAttribute("aria-invalid"),
          "inválido: aria-invalid",
        ).toBe("true");
        expect(invalido.borda, "inválido: borda distinta").not.toEqual(normal.borda);
        expect(
          contraste(invalido.borda, invalido.preenchimento),
          "inválido: contraste da borda",
        ).toBeGreaterThanOrEqual(3);

        const foco = await medirFoco(page, `Texto ${superficie}`);
        expect(foco.ativo).toBe(true);
        expect(foco.focoVisivel).toBe(true);
        expect(foco.bordaPx).toBe("1px");
        expect(foco.contorno).toBe("solid");
        expect(foco.larguraContorno).toBe(`${TOKENS_LAYOUT.campo.foco}px`);
        expect(
          contraste(foco.bordaFoco, normal.preenchimento),
          "borda de foco: contraste",
        ).toBeGreaterThanOrEqual(3);
        expect(deltaE(foco.bordaFoco, foco.tokenFoco), "borda de foco: token").toBeLessThan(1);
      } finally {
        await page.close();
      }
    });
  }
}

it("foco em cores forçadas mantém a borda do campo visível", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    forcedColors: "active",
  });
  try {
    await page.goto(servidor.url);
    const campo = page.getByLabel("Texto pagina", { exact: true });
    await campo.focus();
    const foco = await campo.evaluate((el) => {
      const raiz = el.closest(".MuiOutlinedInput-root, .MuiInputBase-root");
      if (!raiz) throw new Error("Raiz do campo ausente");
      const borda = raiz.querySelector(".MuiOutlinedInput-notchedOutline");
      if (!borda) throw new Error("Borda do campo ausente");
      const css = getComputedStyle(borda);
      return {
        ativo: el === document.activeElement,
        focoVisivel: el.matches(":focus-visible"),
        largura: css.borderTopWidth,
        estilo: css.borderTopStyle,
        cor: css.borderTopColor,
      };
    });
    expect(foco.ativo).toBe(true);
    expect(foco.focoVisivel).toBe(true);
    expect(foco.largura).toBe("1px");
    expect(foco.estilo).toBe("solid");
    expect(foco.cor).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await page.close();
  }
});
