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
  linha: Rgb;
  bordaTopo: Rgb;
  imagemFundo: string;
  texto: Rgb;
  raio: string;
  bordaTopoPx: string;
  bordaBasePx: string;
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
    const texto = getComputedStyle(alvo);
    const fundoMedido = cor(getComputedStyle(fundo).backgroundColor);
    const sonda = document.createElement("span");
    sonda.style.color = "var(--linha-campo)";
    document.body.append(sonda);
    const corLinha = getComputedStyle(sonda).color;
    sonda.remove();
    return {
      fundo: fundoMedido,
      preenchimento: compor(estilo.backgroundColor, fundoMedido),
      linha: compor(corLinha, fundoMedido),
      bordaTopo: compor(estilo.borderTopColor, fundoMedido),
      imagemFundo: estilo.backgroundImage,
      texto: cor(texto.color),
      raio: estilo.borderRadius,
      bordaTopoPx: estilo.borderTopWidth,
      bordaBasePx: estilo.borderBottomWidth,
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
          const temLinha = tipo === "Texto" || tipo === "Busca";
          expect(medida.bordaTopoPx, `${tipo}: borda superior`).toBe(temLinha ? "0px" : "1px");
          expect(medida.bordaBasePx, `${tipo}: borda inferior`).toBe(temLinha ? "0px" : "1px");
          expect(medida.imagemFundo.includes("linear-gradient"), `${tipo}: linha de fundo`).toBe(
            temLinha,
          );
          expect(medida.raio, `${tipo}: raio`).toBe("16px");
          expect(medida.altura, `${tipo}: altura`).toBeGreaterThanOrEqual(43.99);
          if (temLinha) {
            expect(
              contraste(medida.linha, medida.fundo),
              `${tipo}: contraste da linha inferior`,
            ).toBeGreaterThanOrEqual(3);
          } else {
            expect(
              contraste(medida.bordaTopo, medida.fundo),
              `${tipo}: contraste do fio`,
            ).toBeGreaterThanOrEqual(1.3);
          }
          expect(
            contraste(medida.texto, medida.preenchimento),
            `${tipo}: contraste do texto`,
          ).toBeGreaterThanOrEqual(4.5);
        }

        const normal = await medir(page, `Texto ${superficie}`);
        const desabilitado = await medir(page, `Desabilitado ${superficie}`);
        const estiloDesabilitado = await page
          .getByLabel(`Desabilitado ${superficie}`, { exact: true })
          .evaluate((el) => getComputedStyle(el).opacity);
        expect(estiloDesabilitado, "desabilitado: opacidade").toBe("1");
        expect(
          contraste(desabilitado.texto, desabilitado.preenchimento),
          "desabilitado: contraste",
        ).toBeGreaterThanOrEqual(4.5);
        expect(desabilitado.preenchimento, "desabilitado: fundo distinto").not.toEqual(
          normal.preenchimento,
        );
        expect(desabilitado.imagemFundo, "desabilitado: linha distinta").not.toBe(
          normal.imagemFundo,
        );

        const invalido = await medir(page, `Inválido ${superficie}`);
        expect(invalido.preenchimento, "inválido: fundo distinto").not.toEqual(
          normal.preenchimento,
        );
        expect(invalido.imagemFundo, "inválido: linha distinta").not.toBe(normal.imagemFundo);
      } finally {
        await page.close();
      }
    });
  }
}

for (const tema of ["light", "dark"] as const) {
  it(`estado expandido usa a seleção em ${tema}`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    try {
      await page.goto(servidor.url);
      await aguardarTema(page, tema);
      const medidas = await page.evaluate(() => {
        const tela = document.createElement("canvas");
        tela.width = tela.height = 1;
        const desenho = tela.getContext("2d");
        if (!desenho) throw new Error("Canvas indisponível");
        const cor = (valor: string): number[] => {
          desenho.clearRect(0, 0, 1, 1);
          desenho.fillStyle = valor;
          desenho.fillRect(0, 0, 1, 1);
          return Array.from(desenho.getImageData(0, 0, 1, 1).data).slice(0, 3);
        };
        const criar = (expandido: boolean) => {
          const botao = document.createElement("button");
          botao.type = "button";
          botao.className = "controle";
          botao.setAttribute("aria-expanded", String(expandido));
          botao.setAttribute("aria-label", expandido ? "Expandido" : "Recolhido");
          document.body.append(botao);
          const css = getComputedStyle(botao);
          return {
            fundo: css.backgroundColor,
            fundoRgb: cor(css.backgroundColor),
            paginaRgb: cor(getComputedStyle(document.body).backgroundColor),
            bordaTopoRgb: cor(css.borderTopColor),
            bordaTopoPx: css.borderTopWidth,
            raio: css.borderRadius,
          };
        };
        return { expandido: criar(true), recolhido: criar(false) };
      });
      const rgb = (canais: number[]): Rgb => [
        (canais[0] ?? 0) / 255,
        (canais[1] ?? 0) / 255,
        (canais[2] ?? 0) / 255,
      ];
      expect(medidas.expandido.raio).toBe("16px");
      expect(medidas.expandido.bordaTopoPx).toBe("1px");
      expect(medidas.expandido.fundo).not.toBe("rgba(0, 0, 0, 0)");
      expect(medidas.recolhido.fundo).not.toBe("rgba(0, 0, 0, 0)");
      expect(medidas.expandido.fundo).not.toBe(medidas.recolhido.fundo);
      expect(
        contraste(rgb(medidas.recolhido.bordaTopoRgb), rgb(medidas.recolhido.paginaRgb)),
        "fio do controle contra a página",
      ).toBeGreaterThanOrEqual(1.3);
      expect(
        contraste(rgb(medidas.recolhido.bordaTopoRgb), rgb(medidas.recolhido.fundoRgb)),
        "fio do controle contra o fundo",
      ).toBeGreaterThanOrEqual(1.2);
    } finally {
      await page.close();
    }
  });
}

for (const tema of ["light", "dark"] as const) {
  it(`botão primário desabilitado fica neutro em ${tema}`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    try {
      await page.goto(servidor.url);
      await aguardarTema(page, tema);
      const medidas = await page.evaluate(() => {
        const criar = (desabilitado: boolean) => {
          const botao = document.createElement("button");
          botao.type = "button";
          botao.className = "primario";
          botao.disabled = desabilitado;
          botao.textContent = desabilitado ? "Indisponível" : "Disponível";
          document.body.append(botao);
          const css = getComputedStyle(botao);
          return { fundo: css.backgroundColor, texto: css.color, opacidade: css.opacity };
        };
        return { habilitado: criar(false), desabilitado: criar(true) };
      });
      expect(medidas.desabilitado.opacidade).toBe("1");
      expect(medidas.desabilitado.fundo).not.toBe(medidas.habilitado.fundo);
      expect(medidas.desabilitado.texto).not.toBe(medidas.habilitado.texto);
    } finally {
      await page.close();
    }
  });
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
