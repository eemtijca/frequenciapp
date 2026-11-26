// Regressões de geometria e interação da Grade e do filtro de séries do Histórico.
import { join } from "node:path";
import {
  chromium,
  webkit,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { frequencias } from "./ajustes-grade-historico-dados";

const larguraDesktop = 1440;
const altura = 900;
const motor = process.env.FIXTURE_WEBKIT === "1" ? webkit : chromium;
let navegador: Browser;
let servidor: ServidorFixture;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/ajustes-grade-historico.html");
  navegador = await motor.launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function comPagina(
  width: number,
  colorScheme: "light" | "dark",
  vista: "grade" | "historico",
  testar: (pagina: Page) => Promise<void>,
) {
  const pagina = await navegador.newPage({
    viewport: { width, height: altura },
    colorScheme,
    reducedMotion: "reduce",
    timezoneId: "America/Fortaleza",
  });
  const erros: string[] = [];
  const origem = new URL(servidor.url).origin;
  pagina.on("pageerror", (erro) => erros.push(erro.name));
  await pagina.route("**/*", async (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    if (url.origin === origem && pedido.method() === "GET") {
      if (url.pathname === "/api/planilha/estado") {
        return rota.fulfill({ json: { estado: { ativa: false, podeEnviar: false } } });
      }
      if (url.pathname === "/api/frequencias" && url.search === "?de=2026-11-02&ate=2026-11-06") {
        return rota.fulfill({ json: { frequencias } });
      }
      if (!url.pathname.startsWith("/api/")) return rota.continue();
    }
    erros.push("requisição fora da fixture");
    return rota.abort();
  });
  try {
    await pagina.goto(`${servidor.url}?vista=${vista}`);
    await esperar(pagina.locator("html")).toHaveAttribute("data-mui-color-scheme", colorScheme);
    await testar(pagina);
    expect(erros).toEqual([]);
  } finally {
    await pagina.close();
  }
}

async function captura(pagina: Page, chave: string, dados: object) {
  await pagina.evaluate(() => document.fonts.ready.then(() => undefined));
  process.stdout.write(`${JSON.stringify({ chave, motor: navegador.version(), ...dados })}\n`);
  const diretorio = process.env.FIXTURE_CAPTURAS;
  if (diretorio) await pagina.screenshot({ path: join(diretorio, `${chave}.png`) });
}

function mover(region: Locator) {
  return region.evaluate((el) => {
    const aluno = el.querySelector("tbody th");
    const dia = aluno?.nextElementSibling;
    if (!aluno || !dia) throw new Error("Colunas Aluno e dia ausentes");
    return {
      x: el.scrollLeft,
      max: el.scrollWidth - el.clientWidth,
      aluno: aluno.getBoundingClientRect().left,
      dia: dia.getBoundingClientRect().left,
      paginaX: window.scrollX,
      paginaY: window.scrollY,
      excessoPagina: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function grade(pagina: Page, semana = false) {
  if (semana) {
    await pagina.getByRole("combobox", { name: "Período da consulta" }).click();
    await pagina.getByRole("option", { name: "Uma semana de aula" }).click();
  }
  const tabela = pagina.getByRole("table");
  await esperar(tabela.getByRole("cell", { name: "1234", exact: true })).toBeAttached();
  await esperar(
    tabela.getByRole("img", { name: "Estudante sintético 01 com falta em 2026-11-02" }),
  ).toBeAttached();
  // Identifica o contêiner rolável já existente, sem depender do novo nome acessível no RED.
  const regiao = tabela.locator("..");
  await pagina.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await pagina.mouse.move(1, 1);
  return { tabela, regiao };
}

async function medirTotal(tabela: Locator) {
  return tabela.evaluate((el) => {
    const cabecalho = el.querySelector('thead th[data-resumo="historico"]');
    const numero = el.querySelector('tbody tr td[data-resumo="historico"]');
    const dias = [...el.querySelectorAll("thead th[data-dia]")];
    const aluno = el.querySelector("tbody th");
    const nome = aluno?.querySelector("[data-nome-aluno]");
    const regiao = el.parentElement;
    const primeiroDia = dias[0];
    if (!cabecalho || !numero || !aluno || !nome || !regiao || !primeiroDia)
      throw new Error("Colunas da Grade ausentes");
    const faixa = document.createRange();
    faixa.selectNodeContents(numero);
    const texto = faixa.getBoundingClientRect();
    const linhasNumero = faixa.getClientRects().length;
    const celula = numero.getBoundingClientRect();
    const caixaAluno = aluno.getBoundingClientRect();
    faixa.selectNodeContents(nome);
    const caixaNome = faixa.getBoundingClientRect();
    return {
      largura: cabecalho.getBoundingClientRect().width,
      larguraPainel: regiao.clientWidth,
      larguraTabela: el.getBoundingClientRect().width,
      larguraAluno: caixaAluno.width,
      inicioPrimeiroDia: primeiroDia.getBoundingClientRect().left,
      larguraNome: caixaNome.width,
      folgaAposNome: caixaAluno.right - caixaNome.right,
      nomeInteiro: caixaNome.left > caixaAluno.left && caixaNome.right < caixaAluno.right,
      dias: dias.length,
      menorDia: Math.min(...dias.map((dia) => dia.getBoundingClientRect().width)),
      numeroInteiro: linhasNumero === 1 && texto.left > celula.left && texto.right < celula.right,
    };
  });
}

for (const tema of ["light", "dark"] as const) {
  it(`mantém Total compacto, legível e sem arraste quando cabe no desktop (${tema})`, async () => {
    await comPagina(larguraDesktop, tema, "grade", async (pagina) => {
      const { tabela, regiao } = await grade(pagina, true);
      const medidas = await medirTotal(tabela);
      const inicio = await mover(regiao);
      await captura(pagina, `grade-semana-1440-${tema}`, { ...medidas, ...inicio });
      const caixa = await regiao.boundingBox();
      if (!caixa) throw new Error("Grade fora da tela");
      const x = medidas.inicioPrimeiroDia + 60;
      await pagina.mouse.move(x, caixa.y + 62);
      await pagina.mouse.down();
      await pagina.mouse.move(x - 110, caixa.y + 62, { steps: 8 });
      await pagina.mouse.up();
      expect(await mover(regiao)).toEqual(inicio);
      expect(inicio).toMatchObject({ max: 0, excessoPagina: 0 });
      expect(medidas).toMatchObject({ dias: 5, numeroInteiro: true, nomeInteiro: true });
      expect(medidas.larguraAluno, "espaço livre transferido para Aluno").toBeLessThanOrEqual(212);
      expect(medidas.folgaAposNome).toBeLessThanOrEqual(64);
      expect(medidas.inicioPrimeiroDia - inicio.aluno).toBeLessThanOrEqual(213);
      expect(medidas.larguraPainel - medidas.larguraTabela).toBeGreaterThan(800);
      expect(medidas.menorDia).toBeGreaterThanOrEqual(30);
      expect(medidas.largura, "Total semanal ocupa espaço além do necessário").toBeLessThanOrEqual(
        64,
      );
    });
  });

  it(`rola a Grade mensal com o mouse sem mover a página ou a coluna fixa (${tema})`, async () => {
    await comPagina(640, tema, "grade", async (pagina) => {
      const { tabela, regiao } = await grade(pagina);
      const inicio = await mover(regiao);
      const medidas = await medirTotal(tabela);
      expect(inicio.max).toBeGreaterThan(200);
      expect(medidas).toMatchObject({ dias: 30, numeroInteiro: true, nomeInteiro: true });
      expect(medidas.larguraAluno).toBeLessThanOrEqual(212);
      expect(medidas.menorDia).toBeGreaterThanOrEqual(30);
      const caixa = await regiao.boundingBox();
      if (!caixa) throw new Error("Grade fora da tela");
      const x = caixa.x + 510;
      const y = caixa.y + 62;
      await pagina.mouse.move(x, y);
      await pagina.mouse.down();
      await pagina.mouse.move(x - 3, y, { steps: 2 });
      expect((await mover(regiao)).x).toBe(0);
      await pagina.mouse.move(x - 220, y, { steps: 12 });
      const durante = await mover(regiao);
      // Mover no eixo X já fora da tabela, ainda com o botão principal pressionado.
      const foraY = caixa.y - 8;
      await pagina.mouse.move(x - 220, foraY);
      await pagina.mouse.move(x - 260, foraY);
      const fora = await mover(regiao);
      expect(fora.x, "movimento horizontal fora da Grade não chegou à região").toBe(durante.x + 40);
      await pagina.mouse.up();
      const solto = await mover(regiao);
      await esperar(regiao).not.toHaveAttribute("data-arrastando");
      await pagina.mouse.move(x - 200, foraY);
      await pagina.mouse.move(x - 160, y);
      expect(await mover(regiao)).toEqual(solto);
      await pagina.mouse.move(1, 1);
      await captura(pagina, `grade-mes-640-${tema}`, { ...medidas, inicio, durante, fora, solto });
      expect(durante.x, "arraste à esquerda não deslocou a tabela").toBeGreaterThan(180);
      expect(solto).toEqual(fora);
      expect(solto.dia).toBeCloseTo(inicio.dia - solto.x);
      expect(solto).toMatchObject({
        aluno: inicio.aluno,
        paginaX: 0,
        paginaY: 0,
        excessoPagina: 0,
      });
      await pagina.mouse.move(x - 260, y);
      await pagina.mouse.down();
      await pagina.mouse.move(x, y, { steps: 12 });
      await pagina.mouse.up();
      expect((await mover(regiao)).x).toBe(0);
      expect(medidas.largura).toBeLessThanOrEqual(64);
      const busca = pagina.getByPlaceholder("Buscar aluno");
      await busca.focus();
      await pagina.keyboard.press("Tab");
      await esperar(
        pagina.getByRole("region", { name: "Rolagem da Grade de frequência" }),
      ).toBeFocused();
      await pagina.keyboard.press("ArrowRight");
      await expect.poll(async () => (await mover(regiao)).x).toBeGreaterThan(0);
      await regiao.hover({ position: { x: 480, y: 62 } });
      const antesRoda = await mover(regiao);
      await pagina.mouse.wheel(160, 0);
      await expect.poll(async () => (await mover(regiao)).x).toBeGreaterThan(antesRoda.x);
      await pagina.mouse.wheel(0, 260);
      await expect.poll(async () => (await mover(regiao)).paginaY).toBeGreaterThan(0);
    });
  });

  for (const largura of [larguraDesktop, 390]) {
    it(`Histórico sem placa atrás do filtro, com opções utilizáveis (${largura}, ${tema})`, async () => {
      await comPagina(largura, tema, "historico", async (pagina) => {
        const filtro = pagina.getByRole("radiogroup", { name: "Filtrar por série" });
        const todas = filtro.getByRole("radio", { name: "Todas" });
        const primeira = filtro.getByRole("radio", { name: "1ª série" });
        const segunda = filtro.getByRole("radio", { name: "2ª série" });
        await esperar(todas).toHaveAttribute("aria-checked", "true");
        await esperar(pagina.getByRole("listitem")).toHaveCount(6);
        const medidas = await filtro.evaluate((el) => {
          const botoes = [...el.querySelectorAll("button")];
          const primeiro = botoes[0];
          const ultimo = botoes.at(-1);
          if (!primeiro || !ultimo) throw new Error("Opções do filtro ausentes");
          const grupo = getComputedStyle(el);
          const botao = getComputedStyle(primeiro);
          const area = primeiro.getBoundingClientRect();
          const margem = el.getBoundingClientRect();
          return {
            sombra: grupo.boxShadow,
            fundo: grupo.backgroundColor,
            contorno: botao.borderTopWidth,
            altura: area.height,
            quebra: ultimo.getBoundingClientRect().top > area.top,
            excessoPagina: document.documentElement.scrollWidth - window.innerWidth,
            amostra: [Math.round(margem.right - 10), Math.round(margem.bottom + 3)],
          };
        });
        await captura(pagina, `historico-${largura}-${tema}`, medidas);
        await segunda.click();
        await esperar(segunda).toHaveAttribute("aria-checked", "true");
        await esperar(pagina.getByRole("listitem")).toHaveCount(1);
        await esperar(pagina.getByText("Turma 2ª série A")).toBeVisible();
        await pagina.keyboard.press("ArrowLeft");
        await esperar(primeira).toHaveAttribute("aria-checked", "true");
        await esperar(pagina.getByRole("listitem")).toHaveCount(5);
        expect(medidas).toMatchObject({
          fundo: "rgba(0, 0, 0, 0)",
          contorno: "1px",
          excessoPagina: 0,
          quebra: largura === 390,
        });
        expect(medidas.altura).toBeGreaterThanOrEqual(48);
        expect(medidas.sombra, "faixa pintada atrás das séries").toBe("none");
      });
    });
  }
}

it("inverte o arraste imediatamente depois de ultrapassar os dois limites", async () => {
  await comPagina(800, "light", "grade", async (pagina) => {
    const { regiao } = await grade(pagina);
    const caixa = await regiao.boundingBox();
    if (!caixa) throw new Error("Grade fora da tela");
    const x = caixa.x + 640;
    const y = caixa.y + 62;
    const { max } = await mover(regiao);
    expect(max).toBeGreaterThan(0);
    expect(max + 40).toBeLessThan(x);
    await pagina.mouse.move(x, y);
    await pagina.mouse.down();
    await pagina.mouse.move(x - max - 40, y, { steps: 16 });
    expect((await mover(regiao)).x).toBe(max);
    await pagina.mouse.move(x - max - 20, y);
    const aoInverterNoFim = (await mover(regiao)).x;
    await pagina.mouse.move(x + 40, y, { steps: 16 });
    expect((await mover(regiao)).x).toBe(0);
    await pagina.mouse.move(x + 20, y);
    const aoInverterNoInicio = (await mover(regiao)).x;
    await pagina.mouse.up();
    expect(
      [aoInverterNoFim, aoInverterNoInicio],
      "arraste reteve a distância além do limite",
    ).toEqual([max - 20, 20]);
  });
});

it("libera a captura ao soltar o principal antes do outro botão", async () => {
  await comPagina(640, "light", "grade", async (pagina) => {
    const { regiao } = await grade(pagina);
    const caixa = await regiao.boundingBox();
    if (!caixa) throw new Error("Grade fora da tela");
    const x = caixa.x + 500;
    const y = caixa.y + 62;
    await regiao.evaluate((el) => {
      el.addEventListener("contextmenu", (evento) => evento.preventDefault());
      for (const tipo of ["gotpointercapture", "lostpointercapture"] as const) {
        el.addEventListener(tipo, (evento) => {
          const ponteiro = evento as PointerEvent;
          if (ponteiro.isTrusted) el.setAttribute(`data-${tipo}`, String(ponteiro.pointerId));
        });
      }
    });
    await pagina.mouse.move(x, y);
    await pagina.mouse.down({ button: "left" });
    await pagina.mouse.move(x - 100, y, { steps: 8 });
    await esperar(regiao).toHaveAttribute("data-gotpointercapture", /^\d+$/);
    const durante = await mover(regiao);
    expect(durante.x).toBeGreaterThan(80);
    await pagina.mouse.down({ button: "right" });
    await pagina.mouse.up({ button: "left" });
    await pagina.mouse.move(x - 125, caixa.y - 8);
    const aposSoltar = await regiao.evaluate((el) => {
      const id = el.getAttribute("data-gotpointercapture");
      return {
        capturado: el.hasPointerCapture(Number(id)),
        liberado: el.getAttribute("data-lostpointercapture") === id,
      };
    });
    expect(await mover(regiao)).toEqual(durante);
    await pagina.mouse.up({ button: "right" });
    expect(aposSoltar, "captura retida até soltar o outro botão").toEqual({
      capturado: false,
      liberado: true,
    });
  });
});

it("libera a captura ativa se o movimento informar apenas o botão secundário", async () => {
  await comPagina(640, "light", "grade", async (pagina) => {
    const { regiao } = await grade(pagina);
    const caixa = await regiao.boundingBox();
    if (!caixa) throw new Error("Grade fora da tela");
    const x = caixa.x + 500;
    const y = caixa.y + 62;
    await regiao.evaluate((el) => {
      el.addEventListener("gotpointercapture", (evento) => {
        const ponteiro = evento as PointerEvent;
        if (ponteiro.isTrusted)
          el.setAttribute("data-ponteiro-capturado", String(ponteiro.pointerId));
      });
    });
    await pagina.mouse.move(x, y);
    await pagina.mouse.down();
    await pagina.mouse.move(x - 110, y, { steps: 8 });
    await esperar(regiao).toHaveAttribute("data-ponteiro-capturado", /^\d+$/);
    const durante = await mover(regiao);
    expect(durante.x).toBeGreaterThan(80);
    const captura = await regiao.evaluate((el) => {
      const pointerId = Number(el.getAttribute("data-ponteiro-capturado"));
      const antes = el.hasPointerCapture(pointerId);
      // Isola o ramo sem pointerup: a captura é real; só o estado dos botões é injetado.
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          buttons: 2,
        }),
      );
      return { antes, depois: el.hasPointerCapture(pointerId) };
    });
    await pagina.mouse.up();
    expect(await mover(regiao)).toEqual(durante);
    expect(captura, "captura retida sem o botão principal").toEqual({ antes: true, depois: false });
  });
});
