// Verifica a consulta de Horários em Chromium com dados sintéticos e sem escritas HTTP.
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { ProvaBimestral } from "@/domain/provas-bimestrais";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let navegador: Browser;

const TURMA = "Série Sintética de Horários e Atividades Interdisciplinares A";
const ROTULOS_LONGOS = [`${"W".repeat(40)} Turma A`, `${"W".repeat(40)} Turma B`];
const provas: ProvaBimestral[] = [
  {
    id: "p1",
    turmaId: "turma-a",
    dia: "2026-11-23",
    disciplina: "Matemática (prova sintética)",
    inicio: "07:00",
    fim: "07:50",
  },
  {
    id: "p2",
    turmaId: "turma-a",
    dia: "2026-11-23",
    disciplina: "Língua Portuguesa (prova sintética)",
    inicio: "08:00",
    fim: "08:50",
  },
  {
    id: "p3",
    turmaId: "turma-a",
    dia: "2026-11-24",
    disciplina: "Física (prova sintética)",
    inicio: "13:00",
    fim: "13:50",
  },
  {
    id: "p4",
    turmaId: "turma-b",
    dia: "2026-11-23",
    disciplina: "Prova de outra turma",
    inicio: "09:00",
    fim: "09:50",
  },
  {
    id: "p5",
    turmaId: "turma-a",
    dia: "2026-11-20",
    disciplina: "Prova passada",
    inicio: "07:00",
    fim: "07:50",
  },
];

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/consulta-horarios.html");
  navegador = await chromium.launch();
});

afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function consultar(
  largura: number,
  tema: "light" | "dark",
  conferir: (page: Page, vista: Locator) => Promise<void>,
) {
  const url = servidor.url;
  const page = await navegador.newPage({
    viewport: { width: largura, height: largura < 600 ? 844 : 900 },
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    colorScheme: tema,
    serviceWorkers: "block",
    isMobile: largura < 600,
    hasTouch: largura < 600,
  });
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  try {
    await page.route("**/*", (route) => {
      const pedido = route.request();
      const endereco = new URL(pedido.url());
      if (pedido.method() === "GET" && endereco.origin === new URL(url).origin) {
        if (endereco.pathname === "/api/provas-bimestrais")
          return route.fulfill({ json: { provas } });
        if (endereco.pathname === "/api/ordem-almoco") {
          return route.fulfill({
            json: {
              dias: [
                { diaSemana: 1, itens: [{ turmaId: "turma-a", posicao: 1, inicio: "11:50" }] },
              ],
            },
          });
        }
        if (!endereco.pathname.startsWith("/api/")) return route.continue();
      }
      erros.push(`Pedido inesperado: ${pedido.method()} ${endereco.pathname}`);
      return route.abort();
    });
    await page.goto(url);
    const vista = page.getByRole("region", { name: "Horários semanais", exact: true });
    await vista.getByText(TURMA, { exact: true }).filter({ visible: true }).first().waitFor();
    await vista.getByText("Matemática (prova sintética)", { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await conferir(page, vista);
  } finally {
    await page.close();
    expect(erros).toEqual([]);
  }
}

async function escolher(page: Page, campo: Locator, opcao: string) {
  await campo.click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
}

it.each(["light", "dark"] as const)(
  "alinha as faixas de pausa às bordas internas do cartão somente no celular (%s)",
  async (tema) => {
    await consultar(320, tema, async (page, vista) => {
      async function conferir(turno: "Manhã" | "Tarde", pausa: string, largura: number) {
        const nome = `Aulas de Segunda-feira · ${turno}`;
        const cartao = vista.getByRole("region", { name: nome, exact: true });
        const lista = cartao.getByRole("list", { name: nome, exact: true });
        const item = lista
          .getByRole("listitem")
          .filter({ has: page.getByText(pausa, { exact: true }) });
        await item.waitFor();
        const medidas = await item.evaluate((linha) => {
          const cartao = linha.closest("section");
          const texto = linha.querySelector("p");
          if (!cartao || !texto) throw new Error("Lista de aulas incompleta");
          const borda = getComputedStyle(cartao);
          const caixa = cartao.getBoundingClientRect();
          const faixa = linha.getBoundingClientRect();
          return {
            esquerda: faixa.left - caixa.left - parseFloat(borda.borderLeftWidth),
            direita: caixa.right - faixa.right - parseFloat(borda.borderRightWidth),
            recuoDoTexto:
              texto.getBoundingClientRect().left - caixa.left - parseFloat(borda.borderLeftWidth),
            larguraDocumento: document.documentElement.scrollWidth,
          };
        });
        const recuo = largura < 600 ? 0 : 8;
        expect.soft(medidas.esquerda, `${pausa} à esquerda, ${largura} px`).toBeCloseTo(recuo, 0);
        expect.soft(medidas.direita, `${pausa} à direita, ${largura} px`).toBeCloseTo(recuo, 0);
        expect.soft(medidas.recuoDoTexto).toBeCloseTo(68, 0);
        expect(medidas.larguraDocumento).toBeLessThanOrEqual(largura);
      }
      for (const largura of [320, 390, 599, 600, 1440]) {
        await page.setViewportSize({ width: largura, height: 844 });
        await conferir("Manhã", "Intervalo", largura);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await vista.getByRole("tab", { name: "Tarde", exact: true }).click();
      await conferir("Tarde", "Almoço", 390);
      await conferir("Tarde", "Intervalo", 390);
    });
  },
);

it.each(["light", "dark"] as const)(
  "mantém turma, provas e aulas legíveis e selecionáveis a 320 px (%s)",
  async (tema) => {
    await consultar(320, tema, async (page, vista) => {
      const turma = vista.getByRole("combobox", { name: /^Turma/ });
      const dia = vista.getByRole("combobox", { name: /^Dia da semana/ });
      const cartao = vista.getByRole("region", {
        name: `Provas bimestrais de ${TURMA}`,
        exact: true,
      });
      const dimensoes = await turma.evaluate((controle) => {
        const indicador = controle.parentElement?.querySelector("svg");
        if (!indicador) throw new Error("Indicador do seletor ausente");
        const texto = document.createRange();
        texto.selectNodeContents(controle);
        const linhas = Array.from(texto.getClientRects());
        if (linhas.length === 0) throw new Error("Texto da turma ausente");
        const seletor = controle.getBoundingClientRect();
        return {
          folga:
            indicador.getBoundingClientRect().left -
            Math.max(...linhas.map((linha) => linha.right)),
          altura: seletor.height,
        };
      });
      expect(await turma.textContent()).toBe(TURMA);
      expect(dimensoes.altura).toBeGreaterThanOrEqual(48);
      expect
        .soft(dimensoes.folga, "folga entre nome completo e indicador da turma")
        .toBeGreaterThanOrEqual(4);
      const cartaoMedido = await cartao.boundingBox();
      expect(cartaoMedido).not.toBeNull();
      expect
        .soft(cartaoMedido?.height, "altura do cartão com três provas a 320 px")
        .toBeLessThan(360);
      for (const prova of provas.slice(0, 3)) {
        expect(await cartao.getByText(prova.disciplina, { exact: true }).isVisible()).toBe(true);
        expect(
          await cartao.getByText(`${prova.inicio} às ${prova.fim}`, { exact: true }).isVisible(),
        ).toBe(true);
      }
      expect(await cartao.getByRole("heading", { level: 3 }).allTextContents()).toEqual([
        "Segunda-feira, 23/11",
        "Terça-feira, 24/11",
      ]);
      expect(await cartao.getByText("hoje", { exact: true }).isVisible()).toBe(true);
      expect(await cartao.getByText(/^Prova (passada|de outra turma)$/).count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await page.screenshot({ path: `test-results/horarios-320-${tema}.png`, fullPage: true });

      const manha = vista.getByRole("tab", { name: "Manhã" });
      const tarde = vista.getByRole("tab", { name: "Tarde" });
      expect(await manha.getAttribute("aria-selected")).toBe("true");
      const listaManha = vista.getByRole("list", {
        name: "Aulas de Segunda-feira · Manhã",
        exact: true,
      });
      for (const texto of ["Matemática", "Intervalo", "Almoço", "Sem disciplina"]) {
        expect(await listaManha.getByText(texto, { exact: true }).isVisible()).toBe(true);
      }
      const ordem = vista.getByRole("region", { name: "Ordem do almoço de Segunda-feira" });
      expect(await ordem.locator('[aria-current="true"]').getByText(TURMA).isVisible()).toBe(true);
      await manha.focus();
      await manha.press("ArrowRight");
      expect(await tarde.getAttribute("aria-selected")).toBe("true");
      expect(await tarde.evaluate((aba) => aba === document.activeElement)).toBe(true);
      await escolher(page, dia, "Terça-feira");
      expect(await tarde.getAttribute("aria-selected")).toBe("true");
      expect(await vista.getByText("Tecnologia", { exact: true }).isVisible()).toBe(true);
      expect(await ordem.count()).toBe(0);
      await escolher(page, dia, "Semana completa");
      expect(await vista.getByRole("table").count()).toBe(0);
      expect(await vista.getByRole("heading", { name: "Sábado", exact: true }).isVisible()).toBe(
        true,
      );
      expect(await vista.getByRole("tablist", { name: "Turnos do dia" }).count()).toBe(0);
      await turma.focus();
      await turma.press("Enter");
      const opcao = page.getByRole("option", { name: "Turma sem horários" });
      await opcao.waitFor();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await vista.getByText("Nenhum horário configurado").waitFor();
      expect(await turma.evaluate((controle) => controle === document.activeElement)).toBe(true);
      expect(await cartao.count()).toBe(0);
      expect(await vista.getByText("Prova de outra turma").isVisible()).toBe(true);
    });
  },
);

it.each(["light", "dark"] as const)(
  "lê palavras inteiras na semana e fixa apenas a coluna Aula (%s)",
  async (tema) => {
    await consultar(1440, tema, async (page, vista) => {
      await escolher(
        page,
        vista.getByRole("combobox", { name: /^Dia da semana/ }),
        "Semana completa",
      );
      const grade = vista.getByRole("table", { name: `Grade semanal de ${TURMA}`, exact: true });
      await grade.waitFor();
      expect(await grade.getByRole("columnheader", { name: /Sábado/ }).isVisible()).toBe(true);
      for (const nome of ["Geografia", "Química", "Tecnologia"]) {
        const linhas = await grade.getByText(nome, { exact: true }).evaluate((palavra) => {
          const texto = document.createRange();
          texto.selectNodeContents(palavra);
          return texto.getClientRects().length;
        });
        expect.soft(linhas, `${nome} não deve partir no meio`).toBe(1);
      }
      await page.screenshot({
        path: `test-results/horarios-semana-1440-${tema}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1239, height: 900 });
      await grade.waitFor({ state: "hidden" });
      expect(await vista.getByRole("heading", { name: "Sábado", exact: true }).isVisible()).toBe(
        true,
      );
      await page.setViewportSize({ width: 1240, height: 900 });
      await grade.waitFor();
      const medidas = await grade.evaluate((tabela) => {
        const contenedor = tabela.parentElement;
        const aula = tabela.querySelector("tbody th[scope=row]");
        const segunda = tabela.querySelector("tbody td");
        const sabado = tabela.querySelector("tbody tr:last-child td:last-child");
        if (!contenedor || !aula || !segunda || !sabado)
          throw new Error("Semana sem células esperadas");
        const leitura = tabela.querySelector("tbody");
        leitura?.scrollIntoView({ block: "start" });
        const xAula = aula.getBoundingClientRect().left;
        const xSegunda = segunda.getBoundingClientRect().left;
        contenedor.scrollLeft = contenedor.scrollWidth;
        const retangulo = sabado.getBoundingClientRect();
        const alvo = document.elementFromPoint(retangulo.right - 8, retangulo.top + 8);
        return {
          rolagem: contenedor.scrollLeft,
          aula: xAula - aula.getBoundingClientRect().left,
          segunda: xSegunda - segunda.getBoundingClientRect().left,
          sabadoAlcancavel: !!alvo && sabado.contains(alvo),
          pagina: document.documentElement.scrollWidth,
        };
      });
      expect
        .soft(medidas.rolagem, "a semana com sábado precisa de rolagem local neste limite")
        .toBeGreaterThan(0);
      expect.soft(medidas.aula, "Aula deve permanecer fixa").toBe(0);
      expect
        .soft(medidas.segunda, "Segunda não pode ficar fixa junto de Aula")
        .toBeCloseTo(medidas.rolagem, 0);
      expect.soft(medidas.sabadoAlcancavel, "a última coluna deve receber hit-test").toBe(true);
      expect(medidas.pagina).toBe(1240);
    });
  },
);

it.each(["light", "dark"] as const)(
  "mantém um único título visível e seu metadado nas transições de largura (%s)",
  async (tema) => {
    await consultar(320, tema, async (page, vista) => {
      const titulo = vista.getByRole("heading", { level: 1, name: "Horários", exact: true });
      const atualizacao = vista.getByText(/^Atualizado em /);
      for (const largura of [320, 904, 905, 1440]) {
        await page.setViewportSize({ width: largura, height: 844 });
        expect.soft(await atualizacao.count(), `metadado único a ${largura} px`).toBe(1);
        expect(await atualizacao.filter({ visible: true }).count()).toBe(1);
        const caixa = await titulo.boundingBox();
        expect.soft(caixa?.width, `título não recortado a ${largura} px`).toBeGreaterThan(24);
        expect.soft(caixa?.height, `título com altura real a ${largura} px`).toBeGreaterThan(18);
        const estilos = await titulo.evaluate((elemento) => {
          const { clip, clipPath } = getComputedStyle(elemento);
          return { clip, clipPath };
        });
        expect.soft(estilos, `título sem recorte a ${largura} px`).toEqual({
          clip: "auto",
          clipPath: "none",
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
      }
    });
  },
);

it.each(["light", "dark"] as const)(
  "lê as opções longas de Turma por inteiro e restaura o foco após selecionar (%s)",
  async (tema) => {
    await consultar(320, tema, async (page, vista) => {
      const turma = vista.getByRole("combobox", { name: /^Turma/ });
      const dia = vista.getByRole("combobox", { name: /^Dia da semana/ });
      const cartao = vista.getByRole("region", { name: `Provas bimestrais de ${TURMA}` });
      const horario = cartao.getByText("07:00 às 07:50", { exact: true });
      const folga = await horario.evaluate((el) => {
        const metadado = el.parentElement;
        const disciplina = metadado?.previousElementSibling;
        if (!metadado || !disciplina) throw new Error("Linha de prova incompleta");
        return metadado.getBoundingClientRect().top - disciplina.getBoundingClientRect().bottom;
      });
      expect.soft(folga, "folga entre disciplina e horário da prova").toBeCloseTo(4, 0);
      expect.soft(await turma.evaluate((el) => getComputedStyle(el).paddingInlineEnd)).toBe("48px");

      await dia.press("Enter");
      const segunda = page.getByRole("option", { name: "Segunda-feira", exact: true });
      expect(await segunda.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
      await page.keyboard.press("Escape");
      await segunda.waitFor({ state: "hidden" });

      await turma.press("Enter");
      const lista = page.getByRole("listbox");
      for (const rotulo of ROTULOS_LONGOS) {
        const opcao = lista.getByRole("option", { name: rotulo, exact: true });
        const medidas = await opcao.evaluate((el) => {
          const item = el.getBoundingClientRect();
          const menu = el.closest('[role="listbox"]')?.getBoundingClientRect();
          if (!menu) throw new Error("Menu ausente");
          const texto = document.createRange();
          texto.selectNodeContents(el);
          const fragmentos = Array.from(texto.getClientRects());
          return {
            altura: el.clientHeight,
            linhas: fragmentos.length,
            todosNoMenu: fragmentos.every(
              ({ left, right }) => left >= menu.left - 1 && right <= menu.right + 1,
            ),
            todosNoItem: fragmentos.every(
              ({ left, right, top, bottom }) =>
                left >= item.left - 1 &&
                right <= item.right + 1 &&
                top >= item.top - 1 &&
                bottom <= item.bottom + 1,
            ),
          };
        });
        expect.soft(medidas.linhas, `quebra do nome de ${rotulo}`).toBeGreaterThan(1);
        expect.soft(medidas.todosNoMenu, `nome completo dentro do menu: ${rotulo}`).toBe(true);
        expect.soft(medidas.todosNoItem, `nome completo dentro do item: ${rotulo}`).toBe(true);
        expect(medidas.altura).toBeGreaterThanOrEqual(48);
      }
      await page.screenshot({
        path: `test-results/horarios-opcoes-320-${tema}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await lista.waitFor({ state: "hidden" });
      expect(await turma.textContent()).toBe(ROTULOS_LONGOS[1]);
      expect(await turma.evaluate((el) => el === document.activeElement)).toBe(true);
      const selecionada = await turma.evaluate((el) => {
        const indicador = el.parentElement?.querySelector("svg");
        if (!indicador) throw new Error("Indicador ausente");
        const texto = document.createRange();
        texto.selectNodeContents(el);
        return {
          altura: el.clientHeight,
          folga:
            indicador.getBoundingClientRect().left -
            Math.max(...Array.from(texto.getClientRects(), ({ right }) => right)),
        };
      });
      expect(selecionada.altura).toBeGreaterThanOrEqual(48);
      expect(selecionada.folga).toBeGreaterThanOrEqual(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    });
  },
);

it.each(["light", "dark"] as const)(
  "alcança o fim da região da semana pelo teclado sem mover Aula nem a página (%s)",
  async (tema) => {
    await consultar(1240, tema, async (page, vista) => {
      const dia = vista.getByRole("combobox", { name: /^Dia da semana/ });
      await escolher(page, dia, "Semana completa");
      const grade = vista.getByRole("table", { name: `Grade semanal de ${TURMA}`, exact: true });
      const regiao = vista.getByRole("region", { name: "Rolagem da grade semanal", exact: true });
      const rolagem = grade.locator("..");
      expect.soft(await regiao.count(), "contêiner com nome próprio").toBe(1);
      expect.soft(await rolagem.getAttribute("tabindex"), "foco explícito").toBe("0");
      await dia.press("Tab");
      expect(await rolagem.evaluate((el) => el === document.activeElement)).toBe(true);
      expect.soft(await rolagem.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe("3px");
      const aula = grade.getByRole("columnheader", { name: "Aula", exact: true });
      const ultima = grade.getByRole("columnheader", { name: /Sábado/ });
      const esquerda = await aula.evaluate((el) => el.getBoundingClientRect().left);
      expect(await rolagem.evaluate((el) => el.scrollLeft)).toBe(0);
      for (let tecla = 0; tecla < 12; tecla++) await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => rolagem.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft))
        .toBeLessThanOrEqual(1);
      expect(
        await ultima.evaluate((el) => {
          const { right, top } = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(right - 8, top + 8));
        }),
      ).toBe(true);
      expect(await aula.evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(esquerda, 0);
      expect(
        await page.evaluate(() => [window.scrollX, document.documentElement.scrollWidth]),
      ).toEqual([0, 1240]);
    });
  },
);
