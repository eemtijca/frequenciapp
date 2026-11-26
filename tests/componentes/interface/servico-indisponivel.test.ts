// Mede a nuvem na Chamada com HTTP 503 sintético e nos avisos compactos sem ação.
import { join } from "node:path";
import { chromium, expect as esperar, type Browser, type Locator } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let navegador: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/navegacao-data.html");
  navegador = await chromium.launch();
});

afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function medir(aviso: Locator, titulo: string, descricao: string) {
  await esperar(aviso.getByText(titulo, { exact: true })).toBeVisible();
  await esperar(aviso.getByText(descricao, { exact: true })).toBeVisible();
  return aviso.evaluate(
    (el, { titulo, descricao }) => {
      const texto = (valor: string) => {
        const paragrafo = Array.from(el.querySelectorAll("p")).find((p) => p.textContent === valor);
        if (!paragrafo) throw new Error(`Texto ausente no aviso: ${valor}`);
        const faixa = document.createRange();
        faixa.selectNodeContents(paragrafo);
        const primeiraLinha = faixa.getClientRects()[0];
        if (!primeiraLinha || primeiraLinha.height <= 0) throw new Error("Texto sem caixa visível");
        return { primeiraLinha, caixa: paragrafo.getBoundingClientRect() };
      };
      const icones = el.querySelectorAll('svg[aria-hidden="true"]');
      const icone = icones[0]?.getBoundingClientRect();
      if (icones.length !== 1 || !icone || icone.width <= 0) throw new Error("Ícone ausente");
      const centro = (caixa: DOMRect) => caixa.top + caixa.height / 2;
      const cabecalho = texto(titulo);
      const corpo = texto(descricao);
      const botao = el.querySelector("button")?.getBoundingClientRect();
      return {
        desvio: Math.abs(centro(icone) - centro(cabecalho.primeiraLinha)),
        folga: cabecalho.primeiraLinha.left - icone.right,
        antesDaDescricao: icone.bottom <= corpo.caixa.top,
        depoisDaDescricao: !botao || botao.top >= corpo.caixa.bottom,
        alinhamentoDaDescricao: corpo.caixa.left - cabecalho.caixa.left,
        alinhamentoDaAcao: botao ? botao.left - cabecalho.caixa.left : null,
        tituloEmMaisDeUmaLinha: cabecalho.caixa.height > cabecalho.primeiraLinha.height * 1.5,
        centroDoAviso: Math.abs(centro(icone) - centro(el.getBoundingClientRect())),
        iconeAcimaDoTitulo: icone.bottom <= cabecalho.caixa.top,
      };
    },
    { titulo, descricao },
  );
}

it.each([
  [320, "light"],
  [390, "dark"],
  [1440, "light"],
] as const)("alinha a nuvem ao título da Chamada com ação a %i px (%s)", async (width, tema) => {
  const pagina = await navegador.newPage({
    viewport: { width, height: 900 },
    isMobile: width < 600,
    hasTouch: width < 600,
    colorScheme: tema,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const endereco = new URL(`?tela=chamada-marcas&tema=${tema}`, servidor.url);
  const descricao =
    "A Chamada não pôde ler os dados da escola. A consulta poderá ser repetida em instantes.";
  const erros: string[] = [];
  pagina.on("pageerror", (erro) => erros.push(erro.message));
  let leituras = 0;
  try {
    await pagina.route("**/*", (rota) => {
      const pedido = rota.request();
      const alvo = new URL(pedido.url());
      if (pedido.method() === "GET" && alvo.origin === endereco.origin) {
        if (alvo.pathname === "/api/frequencias" && alvo.search === "?dia=2026-11-25") {
          return ++leituras === 1
            ? rota.fulfill({ status: 503, json: { error: descricao } })
            : rota.fulfill({ json: { frequencias: [] } });
        }
        if (alvo.pathname === "/api/frequencias/resumo")
          return rota.fulfill({ status: 503, json: {} });
        if (alvo.pathname === "/api/frequencias/alertas-beneficios")
          return rota.fulfill({ json: { alertas: [] } });
        if (!alvo.pathname.startsWith("/api/")) return rota.continue();
      }
      erros.push(`Pedido inesperado: ${pedido.method()} ${alvo.pathname}`);
      return rota.abort();
    });
    await pagina.goto(endereco.href);
    const aviso = pagina.getByRole("status").filter({ hasText: "Serviço indisponível" });
    const repetir = aviso.getByRole("button", { name: "Tentar novamente", exact: true });
    await esperar(repetir).toBeEnabled();
    await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
    await esperar
      .poll(() => aviso.evaluate((el) => getComputedStyle(el.parentElement ?? el).opacity))
      .toBe("1");
    const medidas = await medir(aviso, "Serviço indisponível", descricao);
    const destino = process.env.CAPTURAS_AJUSTES_UI;
    if (destino) await aviso.screenshot({ path: join(destino, `nuvem-${width}-${tema}.png`) });
    expect
      .soft(medidas.desvio, "centro do ícone na primeira linha do título")
      .toBeLessThanOrEqual(2);
    expect.soft(medidas.folga).toBeGreaterThan(0);
    expect.soft(medidas.antesDaDescricao).toBe(true);
    expect.soft(medidas.depoisDaDescricao).toBe(true);
    expect.soft(medidas.alinhamentoDaDescricao).toBeCloseTo(0, 0);
    expect.soft(medidas.alinhamentoDaAcao).toBeCloseTo(0, 0);
    await repetir.click();
    await esperar(aviso).toHaveCount(0);
    await esperar(pagina.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
    expect(leituras).toBe(2);
  } finally {
    await pagina.close();
  }
  expect(erros).toEqual([]);
});

it("ancora a nuvem em título personalizado sem ação e mantém os demais avisos", async () => {
  const pagina = await navegador.newPage({ viewport: { width: 320, height: 844 } });
  try {
    await pagina.goto(new URL("servico-indisponivel.html", servidor.url).href);
    const descricao = "Confira a integração antes de repetir a consulta dos registros.";
    const titulo = "Envio dos dados da escola não confirmado nesta consulta";
    const aviso = pagina.getByRole("status").filter({ hasText: titulo });
    const medidas = await medir(aviso, titulo, descricao);
    expect.soft(medidas.tituloEmMaisDeUmaLinha).toBe(true);
    expect.soft(medidas.desvio).toBeLessThanOrEqual(2);
    expect.soft(medidas.folga).toBeGreaterThan(0);
    expect.soft(medidas.antesDaDescricao).toBe(true);
    expect.soft(medidas.alinhamentoDaAcao).toBeNull();

    const offline = pagina.getByRole("status").filter({ hasText: "Sem conexão" });
    expect((await medir(offline, "Sem conexão", descricao)).centroDoAviso).toBeLessThanOrEqual(1);
    const erro = pagina.getByRole("alert").filter({ hasText: "Confira os dados" });
    expect((await medir(erro, "Confira os dados", descricao)).iconeAcimaDoTitulo).toBe(true);
  } finally {
    await pagina.close();
  }
});
