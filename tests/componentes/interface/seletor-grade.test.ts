// Mede o rótulo fechado e exercita o seletor da Grade no navegador.
import {
  chromium,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { ROTULO_A, ROTULO_B, ROTULO_CURTO } from "./seletor-grade-dados";

const TURMA_A = `${ROTULO_A} (1)`;
const TURMA_B = `${ROTULO_B} (2)`;
const CURTA = `${ROTULO_CURTO} (1)`;
let servidor: ServidorFixture;
let navegador: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/seletor-grade.html");
  navegador = await chromium.launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function abrirGrade(page: Page, tema: "light" | "dark") {
  await page.route("**/api/**", async (rota) => {
    const pedido = rota.request();
    if (pedido.method() !== "GET" || new URL(pedido.url()).pathname !== "/api/planilha/estado") {
      await rota.abort();
      return;
    }
    await rota.fulfill({ json: { estado: { ativa: false, podeEnviar: false } } });
  });
  await page.goto(servidor.url);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await esperar(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
  const grade = page.getByRole("region", { name: "Grade de frequência", exact: true });
  await esperar(
    grade.getByRole("rowheader", { name: `Aluno de origem A atual ${ROTULO_B}`, exact: true }),
  ).toBeVisible();
  return {
    grade,
    campo: grade.getByRole("combobox", { name: "Turma de origem da grade", exact: true }),
  };
}

async function medirCampo(campo: Locator, rotulo: string) {
  return campo.evaluate((el, texto) => {
    const indicador = el.parentElement?.querySelector("svg");
    const cursor = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let no = cursor.nextNode();
    while (no && no.textContent !== texto) no = cursor.nextNode();
    const caixa = no?.parentElement;
    if (!indicador || !no || !caixa) throw new Error("Rótulo ou indicador não encontrado");
    const faixa = document.createRange();
    faixa.selectNode(no);
    const estilo = getComputedStyle(caixa);
    const campoBox = el.getBoundingClientRect();
    const caixaBox = caixa.getBoundingClientRect();
    const seta = indicador.getBoundingClientRect();
    const textoBox = faixa.getBoundingClientRect();
    const limite =
      caixaBox.right - parseFloat(estilo.paddingRight) - parseFloat(estilo.borderRightWidth);
    // O Range inclui o texto recortado; só o conteúdo de um bloco com ellipsis termina no limite.
    const elipse =
      estilo.display === "block" &&
      estilo.textOverflow === "ellipsis" &&
      estilo.overflowX === "hidden";
    const fimVisivel = elipse
      ? Math.min(textoBox.right, limite)
      : Math.min(textoBox.right, caixaBox.right);
    return {
      // Um texto truncado pode produzir vários fragmentos na mesma altura.
      linhas: new Set(Array.from(faixa.getClientRects(), (r) => Math.round(r.top))).size,
      altura: campoBox.height,
      larguraSeta: seta.width,
      alturaSeta: seta.height,
      folga: seta.left - fimVisivel,
      espacoNoFim: seta.left - limite,
      textoExcede: textoBox.right > limite,
      elipse,
      larguraDocumento: document.documentElement.scrollWidth,
      larguraViewport: document.documentElement.clientWidth,
    };
  }, rotulo);
}

async function conferirOpcoes(listagem: Locator) {
  for (const rotulo of [TURMA_A, TURMA_B]) {
    const opcao = listagem.getByRole("option", { name: rotulo, exact: true });
    // Espera a caixa estabilizar após a transição real do menu MUI.
    await opcao.scrollIntoViewIfNeeded();
    const medida = await opcao.evaluate((el) => {
      const faixa = document.createRange();
      faixa.selectNodeContents(el);
      const item = el.getBoundingClientRect();
      const menu = el.closest('[role="listbox"]')?.getBoundingClientRect();
      if (!menu) throw new Error("Menu de turmas ausente");
      return {
        altura: item.height,
        excesso: Math.max(
          ...Array.from(faixa.getClientRects(), (r) =>
            Math.max(
              Math.max(item.left, menu.left, 0) - r.left,
              r.right - Math.min(item.right, menu.right, window.innerWidth),
            ),
          ),
        ),
      };
    });
    expect(medida.excesso, "nome completo da turma cabe no menu").toBeLessThanOrEqual(1);
    expect(medida.altura).toBeGreaterThanOrEqual(48);
  }
}

for (const tema of ["light", "dark"] as const) {
  it.each([320, 390, 599])(`rótulo fechado sem colisão a %i px em ${tema}`, async (width) => {
    const page = await navegador.newPage({
      viewport: { width, height: 844 },
      colorScheme: tema,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      const { campo } = await abrirGrade(page, tema);
      const longo = await medirCampo(campo, TURMA_A);
      expect(longo.larguraSeta).toBeGreaterThan(0);
      expect(longo.alturaSeta).toBeGreaterThan(0);
      expect(longo.linhas).toBe(1);
      expect(longo.folga, "rótulo fechado invade o indicador").toBeGreaterThanOrEqual(4);
      expect(longo.espacoNoFim).toBeGreaterThanOrEqual(4);
      expect(longo.altura).toBeGreaterThanOrEqual(48);
      expect(longo.textoExcede).toBe(true);
      expect(longo.elipse).toBe(true);
      expect(longo.larguraDocumento).toBe(longo.larguraViewport);
      await esperar(campo).toHaveAccessibleDescription(TURMA_A);

      await campo.click();
      await page.getByRole("option", { name: CURTA, exact: true }).click();
      await esperar(campo).toHaveAccessibleDescription(CURTA);
      const curto = await medirCampo(campo, CURTA);
      expect(curto.linhas).toBe(1);
      expect(curto.altura).toBe(longo.altura);
      expect(curto.textoExcede).toBe(false);
      expect(curto.folga).toBeGreaterThanOrEqual(4);
    } finally {
      await page.close();
    }
  });

  it.each([320, 390])(`turmas distinguíveis no menu a %i px em ${tema}`, async (width) => {
    const page = await navegador.newPage({
      viewport: { width, height: 844 },
      colorScheme: tema,
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      const { grade, campo } = await abrirGrade(page, tema);
      const listagem = page.getByRole("listbox");
      const alvo = listagem.getByRole("option", { name: TURMA_B, exact: true });
      if (width === 320) {
        await grade.getByRole("button", { name: "Baixar planilha (CSV)", exact: true }).focus();
        await page.keyboard.press("Tab");
        await esperar(campo).toBeFocused();
        await page.keyboard.press("ArrowDown");
      } else {
        await campo.tap();
      }
      await conferirOpcoes(listagem);
      await esperar(listagem.getByRole("option", { name: TURMA_A, exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      if (width === 320) {
        await esperar(listagem.getByRole("option", { name: TURMA_A, exact: true })).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await esperar(alvo).toBeFocused();
        await page.keyboard.press("Enter");
      } else {
        await alvo.tap();
      }
      await esperar(listagem).toBeHidden();
      await esperar(campo).toBeFocused();
      await esperar(campo).toHaveText(TURMA_B);
      await esperar(campo).toHaveAccessibleDescription(TURMA_B);
      await esperar(
        grade.getByRole("rowheader", { name: `Aluno de origem B atual ${ROTULO_B}`, exact: true }),
      ).toBeVisible();
      await esperar(grade.getByRole("rowheader", { name: /^Aluno de origem A/ })).toHaveCount(0);
    } finally {
      await page.close();
    }
  });

  it(`a 600 px preserva os botões e a turma escolhida em ${tema}`, async () => {
    const page = await navegador.newPage({
      viewport: { width: 599, height: 844 },
      colorScheme: tema,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      const { grade, campo } = await abrirGrade(page, tema);
      await esperar(campo).toBeVisible();
      await page.setViewportSize({ width: 600, height: 844 });
      await esperar(campo).toBeHidden();
      const botaoA = grade.getByRole("button", { name: `${ROTULO_A} 1`, exact: true });
      const botaoB = grade.getByRole("button", { name: `${ROTULO_B} 2`, exact: true });
      await esperar(botaoA).toHaveAttribute("aria-pressed", "true");
      await botaoB.click();
      await esperar(botaoB).toHaveAttribute("aria-pressed", "true");
      await esperar(botaoA).toHaveAttribute("aria-pressed", "false");
      await page.setViewportSize({ width: 599, height: 844 });
      await esperar(campo).toHaveText(TURMA_B);
    } finally {
      await page.close();
    }
  });
}
