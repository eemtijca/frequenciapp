// Verifica identidade, ações e legibilidade dos cadastros com Chromium e massa sintética.
import { chromium, expect, type Browser, type Locator } from "@playwright/test";
import { afterAll, beforeAll, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { nomeTurma, rotuloTurma, serieA, serieB } from "./series-turmas-dados";

let servidor: ServidorFixture;
let browser: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/gestao/series-turmas.html");
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.fechar();
});

async function textoCabe(texto: Locator, obstaculo?: Locator) {
  if (obstaculo) await expect(obstaculo, "separador visual do texto").toBeVisible();
  const elemento = obstaculo ? await obstaculo.elementHandle() : null;
  return texto.evaluate((el, separador) => {
    const caixa = el.getBoundingClientRect();
    let direita = Math.min(innerWidth, caixa.right);
    if (separador) {
      const limite = separador.getBoundingClientRect();
      if (!separador.isConnected || !(limite.width > 0 && limite.height > 0)) {
        throw new Error(`Separador sem caixa mensurável: ${JSON.stringify(limite)}`);
      }
      direita = Math.min(direita, limite.left);
    }
    const faixa = document.createRange();
    faixa.selectNodeContents(el);
    const fragmentos = [...faixa.getClientRects()];
    return (
      fragmentos.length > 0 &&
      fragmentos.every(
        (r) =>
          r.left >= Math.max(0, caixa.left) - 1 &&
          r.right <= direita + 1 &&
          r.top >= Math.max(0, caixa.top) - 1 &&
          r.bottom <= Math.min(innerHeight, caixa.bottom) + 1,
      )
    );
  }, elemento);
}

async function medirCelula(celula: Locator) {
  return celula.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const estilo = getComputedStyle(el);
    const esquerda = caixa.left + parseFloat(estilo.paddingLeft);
    const direita = caixa.right - parseFloat(estilo.paddingRight);
    const medir = ({ left, right, top, bottom, width, height }: DOMRect) => ({
      left,
      right,
      top,
      bottom,
      width,
      height,
    });
    const faixa = document.createRange();
    const textos = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const fragmentos = [];
    for (let texto = textos.nextNode(); texto; texto = textos.nextNode()) {
      faixa.selectNodeContents(texto);
      fragmentos.push(...[...faixa.getClientRects()].filter((r) => r.width > 0).map(medir));
    }
    return {
      largura: caixa.width,
      esquerda,
      direita,
      alinhamento: estilo.textAlign,
      numerais: estilo.fontVariantNumeric,
      fragmentos,
      acoes: [...el.querySelectorAll("button")].map((botao) =>
        medir(botao.getBoundingClientRect()),
      ),
    };
  });
}

it.each([
  {
    aba: "series",
    acao: `Excluir série ${serieA}`,
    titulo: `Excluir a série ${serieA}?`,
    papel: "alertdialog",
  },
  {
    aba: "turmas",
    acao: `Excluir turma ${rotuloTurma}`,
    titulo: `Excluir a turma ${rotuloTurma}?`,
    papel: "alertdialog",
  },
  {
    aba: "turmas",
    acao: `Editar turma ${rotuloTurma}`,
    titulo: `Editar turma ${rotuloTurma}`,
    papel: "dialog",
  },
] as const)("título integral de $acao a 320 px", async ({ aba, acao, titulo, papel }) => {
  for (const tema of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 320, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(`${servidor.url}?aba=${aba}&tema=${tema}`);
      const gatilho = page.getByRole("button", { name: acao, exact: true });
      await gatilho.click();
      const dialogo = page.getByRole(papel, { name: titulo, exact: true });
      const cabecalho = dialogo.getByRole("heading", { name: titulo, exact: true });
      await expect(cabecalho).toBeVisible();
      const fechar =
        papel === "dialog"
          ? dialogo.getByRole("button", { name: "Fechar", exact: true })
          : undefined;
      expect(await textoCabe(cabecalho, fechar), `título cabe sem corte em ${tema}`).toBe(true);
      await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(gatilho).toBeFocused();
    } finally {
      await page.close();
    }
  }
});

it.each(["light", "dark"])(
  "série selecionada não invade o indicador e o teclado preserva foco em %s",
  async (tema) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(`${servidor.url}?aba=turmas&tema=${tema}`);
      await page.getByRole("button", { name: "Nova turma", exact: true }).click();
      const seletor = page.getByRole("combobox", { name: /Série/ });
      await expect(seletor).toHaveText(serieA);
      const indicador = seletor.locator("..").locator(".MuiSelect-icon");
      expect(await textoCabe(seletor, indicador), "série selecionada cabe antes do indicador").toBe(
        true,
      );
      await seletor.press("ArrowDown");
      const lista = page.getByRole("listbox");
      await expect(lista.getByRole("option", { name: serieA, exact: true })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(lista.getByRole("option", { name: serieB, exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(lista).toBeHidden();
      await expect(seletor).toBeFocused();
      await expect(seletor).toHaveText(serieB);
      expect(await textoCabe(seletor, indicador)).toBe(true);
    } finally {
      await page.close();
    }
  },
);

it.each(["light", "dark"])(
  "opções da série mostram sufixos distintos no menu em %s",
  async (tema) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(`${servidor.url}?aba=turmas&tema=${tema}`);
      await page.getByRole("button", { name: "Nova turma", exact: true }).click();
      const seletor = page.getByRole("combobox", { name: /Série/ });
      await seletor.press("ArrowDown");
      const lista = page.getByRole("listbox");
      for (const serie of [serieA, serieB]) {
        const opcao = lista.getByRole("option", { name: serie, exact: true });
        await expect(opcao).toBeVisible();
        const limites = await opcao.evaluate((item) => {
          const area = item.closest('[role="listbox"]');
          if (!area) throw new Error("Lista de séries ausente.");
          const retanguloItem = item.getBoundingClientRect();
          const retanguloLista = area.getBoundingClientRect();
          const faixa = document.createRange();
          faixa.selectNodeContents(item);
          return {
            esquerda: Math.max(0, retanguloItem.left, retanguloLista.left),
            direita: Math.min(innerWidth, retanguloItem.right, retanguloLista.right),
            topo: Math.max(0, retanguloItem.top, retanguloLista.top),
            fundo: Math.min(innerHeight, retanguloItem.bottom, retanguloLista.bottom),
            fragmentos: [...faixa.getClientRects()].map(({ left, right, top, bottom }) => ({
              left,
              right,
              top,
              bottom,
            })),
          };
        });
        expect(limites.fragmentos.length).toBeGreaterThan(0);
        expect(
          limites.fragmentos.every(
            (r) =>
              r.left >= limites.esquerda - 1 &&
              r.right <= limites.direita + 1 &&
              r.top >= limites.topo - 1 &&
              r.bottom <= limites.fundo + 1,
          ),
          `opção cabe no item e na lista, incluindo o sufixo: ${JSON.stringify(limites)}`,
        ).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(lista).toBeHidden();
      await expect(seletor).toBeFocused();
      await expect(seletor).toHaveText(serieA);
    } finally {
      await page.close();
    }
  },
);

for (const aba of ["series", "turmas"] as const) {
  for (const largura of [320, 390, 1440]) {
    it.each(["light", "dark"])(
      `tabela de ${aba} mantém identidade e ação a ${largura} px em %s`,
      async (tema) => {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await page.goto(`${servidor.url}?aba=${aba}&tema=${tema}`);
          await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
          const ehTurma = aba === "turmas";
          const rotulo = ehTurma ? rotuloTurma : serieA;
          const editar = page.getByRole("button", {
            name: `Editar ${ehTurma ? "turma" : "série"} ${rotulo}`,
            exact: true,
          });
          const tabela = page.getByRole("table", {
            name: ehTurma ? `Turmas de ${serieA}.` : "Séries cadastradas, na ordem de exibição.",
            exact: true,
          });
          const linha = tabela.getByRole("row").filter({ has: editar });
          const nome = linha.getByRole("rowheader", { name: rotulo, exact: true });
          const busca = page.getByRole("searchbox", {
            name: ehTurma ? "Buscar turma" : "Buscar série",
          });
          await expect(nome).toBeVisible();
          const linhas = await tabela.getByRole("row").evaluateAll((itens) =>
            itens.slice(1).map((el) => {
              const { top, bottom, height } = el.getBoundingClientRect();
              return { completa: top >= 0 && bottom <= innerHeight, altura: height };
            }),
          );
          const total = await medirCelula(
            linha.getByRole("cell", { name: ehTurma ? "1 aula" : "01", exact: true }),
          );
          const semAulas = ehTurma
            ? await medirCelula(page.getByRole("cell", { name: "sem aulas ativas", exact: true }))
            : null;
          const acoes = await medirCelula(linha.getByRole("cell").filter({ has: editar }));
          process.stdout.write(
            `${JSON.stringify({ aba, largura, tema, linhas, total, semAulas, acoes })}\n`,
          );
          expect(total.fragmentos, "contagem legível numa linha").toHaveLength(1);
          if (semAulas) {
            const linhasDoEstado = new Set(semAulas.fragmentos.map((trecho) => trecho.top));
            expect(linhasDoEstado.size).toBeGreaterThan(0);
            expect(
              linhasDoEstado.size,
              "estado sem aulas legível em até duas linhas",
            ).toBeLessThanOrEqual(2);
          } else {
            expect(total.alinhamento, "ordem numérica alinhada à direita").toBe("right");
            expect(total.numerais).toContain("tabular-nums");
          }
          for (const medida of semAulas ? [total, semAulas] : [total]) {
            for (const trecho of medida.fragmentos) {
              expect(trecho.left).toBeGreaterThanOrEqual(medida.esquerda - 1);
              expect(trecho.right).toBeLessThanOrEqual(medida.direita + 1);
            }
          }
          expect(acoes.acoes).toHaveLength(ehTurma ? 3 : 2);
          for (const [i, alvo] of acoes.acoes.entries()) {
            expect(alvo.left).toBeGreaterThanOrEqual(acoes.esquerda - 1);
            expect(alvo.right).toBeLessThanOrEqual(acoes.direita + 1);
            const anterior = acoes.acoes[i - 1];
            if (anterior) {
              const folga =
                alvo.top > anterior.top ? alvo.top - anterior.bottom : alvo.left - anterior.right;
              expect(folga, "folga entre alvos na linha ou na quebra").toBeGreaterThanOrEqual(3.99);
            }
          }
          await busca.focus();
          if (ehTurma) {
            await page.keyboard.press("Tab");
            await expect(
              linha.getByRole("button", { name: `Horários de ${rotulo}`, exact: true }),
            ).toBeFocused();
          }
          await page.keyboard.press("Tab");
          await expect(editar).toBeFocused();
          await expect(editar).toBeInViewport({ ratio: 0.99 });
          expect(
            await textoCabe(nome, editar),
            "nome completo junto de Editar, sem corte no viewport",
          ).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
          expect(
            await tabela.evaluate((el) => {
              const janela = el.parentElement;
              return janela ? janela.scrollWidth - janela.clientWidth : -1;
            }),
          ).toBe(0);
          for (const botao of await linha.getByRole("button").all()) {
            const caixa = await botao.boundingBox();
            expect(caixa?.width).toBeGreaterThanOrEqual(48);
            expect(caixa?.height).toBeGreaterThanOrEqual(48);
          }
          for (const celula of [...(await linha.getByRole("cell").all()), nome]) {
            expect(
              await celula.evaluate((el) => {
                const { paddingLeft, paddingRight } = getComputedStyle(el);
                return [paddingLeft, paddingRight];
              }),
            ).toEqual(["16px", "16px"]);
          }
          await page.keyboard.press("Enter");
          const dialogo = page.getByRole("dialog", {
            name: ehTurma ? `Editar turma ${rotulo}` : "Editar série",
            exact: true,
          });
          await expect(
            dialogo.getByRole("textbox", {
              name: ehTurma ? "Turma (letra ou nome)" : "Nome",
              exact: true,
            }),
          ).toHaveValue(ehTurma ? nomeTurma : serieA);
          await page.keyboard.press("Escape");
          await expect(editar).toBeFocused();
          if (ehTurma) {
            const titulo = page.getByRole("heading", { name: serieA, exact: true });
            expect(await textoCabe(titulo), "nome completo da série no cabeçalho do grupo").toBe(
              true,
            );
          }
          const ultima = page.getByRole("button", {
            name: ehTurma ? /^Excluir turma .* Turma de Teste$/ : "Excluir série Série de Teste",
          });
          await ultima.scrollIntoViewIfNeeded();
          await expect(ultima).toBeInViewport({ ratio: 0.99 });
          await ultima.click();
          await expect(page.getByRole("alertdialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(ultima).toBeFocused();
        } finally {
          await page.close();
        }
      },
    );
  }
}

it("filtros preservam ordem, grupos, contagens e ações do cadastro", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      chamadas.push(route.request().method());
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(servidor.url);
    await expect(page.getByText("3 séries", { exact: true })).toBeVisible();
    await expect(page.getByRole("rowheader")).toHaveText([serieA, serieB, "Série de Teste"]);
    const buscarSerie = page.getByRole("searchbox", { name: "Buscar série" });
    await buscarSerie.fill("serie de teste");
    await expect(page.getByRole("rowheader")).toHaveText(["Série de Teste"]);
    await expect(page.getByRole("cell", { name: "03", exact: true })).toBeVisible();
    await buscarSerie.fill("inexistente");
    await expect(page.getByText("Nenhuma série encontrada")).toBeVisible();
    await page.goto(`${servidor.url}?aba=turmas`);
    await expect(page.getByText("2 turmas", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([serieA, serieB]);
    await expect(page.getByRole("cell", { name: "1 aula", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "sem aulas ativas", exact: true })).toBeVisible();
    const horarios = page.getByRole("button", { name: `Horários de ${rotuloTurma}`, exact: true });
    await horarios.click();
    const grade = page.getByRole("dialog", { name: `Horários de ${rotuloTurma}`, exact: true });
    await expect(grade.getByRole("button", { name: "Editar aula 1", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(horarios).toBeFocused();
    const buscarTurma = page.getByRole("searchbox", { name: "Buscar turma" });
    await buscarTurma.fill("turma de teste");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([serieB]);
    await expect(page.getByText("1 turma", { exact: true })).toBeVisible();
    const reorganizar = page.getByRole("button", { name: "Reorganizar turmas", exact: true });
    await expect(reorganizar).toHaveClass(/MuiButton-outlined/);
    await expect(page.getByRole("button", { name: "Nova turma", exact: true })).toHaveClass(
      /MuiButton-contained/,
    );
    await reorganizar.click();
    const revisao = page.getByRole("alertdialog", {
      name: "Reorganizar todas as turmas?",
      exact: true,
    });
    await expect(
      revisao.getByRole("button", { name: "Reorganizar todas", exact: true }),
    ).toBeVisible();
    await revisao.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(reorganizar).toBeFocused();
    await expect(buscarTurma).toHaveValue("turma de teste");
    await buscarTurma.fill("inexistente");
    await expect(page.getByText("Nenhuma turma encontrada")).toBeVisible();
    expect(chamadas.filter((metodo) => metodo !== "GET")).toEqual([]);
  } finally {
    await page.close();
  }
});

it("distingue cadastros vazios e pré-requisito de série", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
  try {
    await page.goto(`${servidor.url}?sem-series`);
    await expect(page.getByText("Nenhuma série cadastrada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova série", exact: true })).toBeEnabled();
    await page.goto(`${servidor.url}?aba=turmas&sem-series`);
    await expect(page.getByText("Crie uma série primeiro")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova turma", exact: true })).toBeDisabled();
    await page.goto(`${servidor.url}?aba=turmas&sem-turmas`);
    await expect(page.getByText("Nenhuma turma cadastrada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova turma", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Reorganizar turmas", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  } finally {
    await page.close();
  }
});

it("editar turma só envia ao salvar e mantém os campos depois de erro simulado", async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 844 },
    reducedMotion: "reduce",
  });
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const pedido = route.request();
      chamadas.push({
        metodo: pedido.method(),
        caminho: new URL(pedido.url()).pathname,
        corpo: pedido.postDataJSON(),
      });
      if (chamadas.length === 1) {
        await route.fulfill({ status: 422, json: { error: "Nome já cadastrado para a série." } });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
    });
    await page.goto(`${servidor.url}?aba=turmas`);
    const editar = page.getByRole("button", { name: `Editar turma ${rotuloTurma}`, exact: true });
    const dialogo = page.getByRole("dialog", { name: `Editar turma ${rotuloTurma}`, exact: true });
    const serie = dialogo.getByRole("combobox", { name: /Série/ });
    const nome = dialogo.getByRole("textbox", { name: "Turma (letra ou nome)", exact: true });
    async function preencher() {
      await serie.click();
      await page.getByRole("option", { name: serieB, exact: true }).click();
      await nome.fill("Nova identificação");
    }
    await editar.click();
    await preencher();
    await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(editar).toBeFocused();
    expect(chamadas).toEqual([]);
    await editar.click();
    await expect(serie).toHaveText(serieA);
    await expect(nome).toHaveValue(nomeTurma);
    await preencher();
    const salvar = dialogo.getByRole("button", { name: "Salvar", exact: true });
    await salvar.click();
    await expect(
      dialogo.getByText("Nome já cadastrado para a série.", { exact: true }),
    ).toBeVisible();
    await expect(serie).toHaveText(serieB);
    await expect(nome).toHaveValue("Nova identificação");
    const esperado = {
      metodo: "PATCH",
      caminho: "/api/turmas/turma-a",
      corpo: { serieId: "serie-b", nome: "Nova identificação" },
    };
    expect(chamadas).toEqual([esperado]);
    await salvar.click();
    await expect(dialogo).toBeHidden();
    expect(chamadas).toEqual([esperado, esperado]);
  } finally {
    await page.close();
  }
});
