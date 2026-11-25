// Exercita legibilidade, navegação por teclado e contratos públicos das duas vistas de Alunos.
import { chromium, expect, type Browser, type Locator } from "@playwright/test";
import { afterAll, beforeAll, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { nomeLongo, rotuloA, rotuloB, rotuloC } from "./alunos-dados";

let servidor: ServidorFixture;
let browser: Browser;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/gestao/alunos.html");
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.fechar();
});

async function textoCabe(locator: Locator, limite = locator) {
  const caixa = await limite.boundingBox();
  if (!caixa) return false;
  return locator.evaluate((el, { x, y, width, height }) => {
    const faixa = document.createRange();
    faixa.selectNodeContents(el);
    const fragmentos = [...faixa.getClientRects()];
    return (
      fragmentos.length > 0 &&
      fragmentos.every(
        (r) =>
          r.left >= x - 1 &&
          r.right <= x + width + 1 &&
          r.top >= y - 1 &&
          r.bottom <= y + height + 1,
      )
    );
  }, caixa);
}

it.each(["light", "dark"])(
  "consulta mostra o nome completo e preserva agrupamento e busca em %s",
  async (tema) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
    try {
      await page.goto(`${servidor.url}?tema=${tema}`);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
      await expect(page.getByRole("heading", { name: "Alunos", exact: true })).toBeVisible();
      await expect(page.getByText("4 no total · 3 ativos")).toBeVisible();
      const nome = page.getByText(nomeLongo, { exact: true });
      await expect(nome).toBeVisible();
      expect(await textoCabe(nome), "os glifos do nome devem caber sem reticências").toBe(true);
      await expect(page.getByRole("listitem").nth(0)).toContainText(nomeLongo);
      await expect(page.getByText(`Origem ${rotuloB}`, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Turma de origem", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Turma de origem", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const listas = page.getByRole("list");
      await expect(listas.nth(0).getByRole("listitem").nth(0)).toContainText("Álvaro Teste");
      await expect(listas.nth(0).getByRole("listitem").nth(1)).toContainText("Bia Teste");
      await expect(page.getByText(`Atual ${rotuloA}`, { exact: true })).toBeVisible();
      await expect(page.getByText("Desistente", { exact: true })).toBeVisible();
      await expect(page.getByText("desativado", { exact: true })).toBeVisible();
      const busca = page.getByRole("searchbox", { name: "Buscar aluno", exact: true });
      await busca.fill("alvaro");
      await expect(page.getByRole("listitem")).toHaveCount(1);
      await expect(page.getByRole("listitem")).toContainText("Álvaro Teste");
      await busca.fill("sem correspondencia");
      await expect(page.getByText("Nenhum aluno encontrado")).toBeVisible();
      await expect(page.getByRole("listitem")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Novo aluno|Editar|Excluir/ })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    } finally {
      await page.close();
    }
  },
);

it.each([
  { largura: 320, tema: "light" },
  { largura: 320, tema: "dark" },
  { largura: 390, tema: "light" },
  { largura: 390, tema: "dark" },
])(
  "Gestão conserva identidade e ação da linha durante a rolagem a $largura px em $tema",
  async ({ largura, tema }) => {
    const page = await browser.newPage({
      viewport: { width: largura, height: 844 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(`${servidor.url}?gestao&tema=${tema}`);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
      const busca = page.getByRole("searchbox", { name: "Buscar aluno", exact: true });
      const editar = page.getByRole("button", { name: `Editar ${nomeLongo}`, exact: true });
      const nome = page.getByText(nomeLongo, { exact: true });
      await expect(editar).toBeVisible();
      const tabela = page.getByRole("table");
      const linha = tabela.getByRole("row").filter({ has: editar });
      for (const celula of [
        tabela.getByRole("columnheader", { name: "Aluno", exact: true }),
        linha.getByRole("rowheader"),
        linha.getByRole("cell").filter({ has: editar }),
      ]) {
        expect(
          await celula.evaluate((el) => {
            const { paddingLeft, paddingRight } = getComputedStyle(el);
            return [paddingLeft, paddingRight];
          }),
          "Aluno e Ações mantêm 16 px de padding horizontal",
        ).toEqual(["16px", "16px"]);
      }
      await busca.focus();
      await page.keyboard.press("Tab");
      if (!(await editar.evaluate((el) => el === document.activeElement))) {
        await page.keyboard.press("Tab");
      }
      await expect(editar).toBeFocused();
      await expect(editar).toBeInViewport({ ratio: 1 });
      const conferencia = await nome.evaluate((el) => {
        const tabela = el.closest("table");
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        const janela = tabela?.parentElement?.getBoundingClientRect();
        const acao = document.activeElement?.getBoundingClientRect();
        return (
          !!janela &&
          !!acao &&
          [...faixa.getClientRects()].every(
            (r) => r.left >= janela.left && r.right <= Math.min(acao.left, janela.right),
          )
        );
      });
      expect(conferencia, "o nome completo deve ficar visível ao tabular até Editar").toBe(true);
      await page.keyboard.press("Enter");
      const dialogo = page.getByRole("dialog", { name: `Editar ${nomeLongo}`, exact: true });
      await expect(dialogo.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue(
        nomeLongo,
      );
      await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(editar).toBeFocused();

      const regiao = page.getByRole("region", { name: "Tabela de alunos", exact: true });
      await busca.focus();
      await page.keyboard.press("Tab");
      await expect(regiao).toBeFocused();
      expect(await regiao.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
      const inicial = await regiao.evaluate((el) => el.scrollLeft);
      const esquerdaAluno = (await nome.boundingBox())?.x;
      const ordem = regiao.getByRole("columnheader", { name: "Ordem", exact: true });
      const esquerdaOrdem = (await ordem.boundingBox())?.x ?? 0;
      for (let tecla = 0; tecla < 10; tecla++) await page.keyboard.press("ArrowRight");
      const limite = await regiao.evaluate((el) => el.scrollWidth - el.clientWidth);
      if (largura === 320) expect(limite).toBeGreaterThan(inicial);
      await expect.poll(() => regiao.evaluate((el) => el.scrollLeft)).toBe(limite);
      expect((await nome.boundingBox())?.x).toBe(esquerdaAluno);
      if (limite > inicial) expect((await ordem.boundingBox())?.x).toBeLessThan(esquerdaOrdem);
      const excluir = page.getByRole("button", { name: `Excluir ${nomeLongo}`, exact: true });
      await excluir.click();
      const confirmar = page.getByRole("alertdialog", {
        name: `Excluir ${nomeLongo}?`,
        exact: true,
      });
      await expect(confirmar).toBeVisible();
      await confirmar.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(excluir).toBeFocused();

      const fim = regiao.getByRole("row").filter({ hasText: "Álvaro Teste" });
      const ultimaAcao = fim.getByRole("button", { name: "Excluir Álvaro Teste", exact: true });
      await ultimaAcao.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
      await expect(ultimaAcao).toBeInViewport({ ratio: 1 });
      for (const acao of await fim.getByRole("button").all()) {
        expect(await acao.boundingBox()).toMatchObject({ width: 48, height: 48 });
      }
      await ultimaAcao.click();
      const confirmacaoFinal = page.getByRole("alertdialog", { name: "Excluir Álvaro Teste?" });
      await confirmacaoFinal.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(ultimaAcao).toBeFocused();
      expect(
        await page.evaluate(() => ({ largura: document.documentElement.scrollWidth, x: scrollX })),
      ).toEqual({ largura, x: 0 });
    } finally {
      await page.close();
    }
  },
);

it.each([
  { tema: "light", acao: "Editar", papel: "dialog" },
  { tema: "dark", acao: "Editar", papel: "dialog" },
  { tema: "light", acao: "Excluir", papel: "alertdialog" },
  { tema: "dark", acao: "Excluir", papel: "alertdialog" },
] as const)(
  "título de $acao cabe com 100 caracteres sem espaços a 320 px em $tema",
  async ({ tema, acao, papel }) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce",
    });
    try {
      await page.goto(`${servidor.url}?gestao&tema=${tema}`);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
      const gatilho = page.getByRole("button", { name: `${acao} ${nomeLongo}`, exact: true });
      await gatilho.click();
      const nome = `${acao} ${nomeLongo}${acao === "Excluir" ? "?" : ""}`;
      const dialogo = page.getByRole(papel, { name: nome, exact: true });
      const titulo = dialogo.getByRole("heading", { name: nome, exact: true });
      await expect(titulo).toBeInViewport({ ratio: 1 });
      const glifosCabem = await titulo.evaluate((el) => {
        const caixa = el.getBoundingClientRect();
        const { paddingLeft, paddingRight } = getComputedStyle(el);
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        const fragmentos = [...faixa.getClientRects()];
        return (
          fragmentos.length > 0 &&
          fragmentos.every(
            (r) =>
              r.left >= caixa.left + parseFloat(paddingLeft) - 1 &&
              r.right <= caixa.right - parseFloat(paddingRight) + 1 &&
              r.top >= caixa.top &&
              r.bottom <= caixa.bottom,
          )
        );
      });
      expect(glifosCabem, "os glifos do título cabem na área útil do diálogo").toBe(true);
      expect(
        await dialogo.evaluate(
          (el) => el.scrollWidth === el.clientWidth && document.documentElement.scrollWidth === 320,
        ),
      ).toBe(true);

      const cancelar = dialogo.getByRole("button", { name: "Cancelar", exact: true });
      const confirmar = dialogo.getByRole("button", {
        name: acao === "Editar" ? "Salvar" : "Excluir",
        exact: true,
      });
      await expect(cancelar).toBeInViewport({ ratio: 1 });
      await expect(confirmar).toBeInViewport({ ratio: 1 });
      const caixaCancelar = await cancelar.boundingBox();
      const caixaConfirmar = await confirmar.boundingBox();
      expect(caixaCancelar).not.toBeNull();
      expect(caixaConfirmar).not.toBeNull();
      if (caixaCancelar && caixaConfirmar) {
        expect(caixaCancelar.x + caixaCancelar.width).toBeLessThanOrEqual(caixaConfirmar.x);
      }
      if (acao === "Editar") {
        const fechar = dialogo.getByRole("button", { name: "Fechar", exact: true });
        await expect(fechar).toBeInViewport({ ratio: 1 });
        await fechar.click({ trial: true });
      }
      await confirmar.click({ trial: true });
      await cancelar.click();
      await expect(gatilho).toBeFocused();
    } finally {
      await page.close();
    }
  },
);

it.each(["light", "dark"])(
  "editor móvel distingue turmas, preserva busca e cancela sem gravar em %s",
  async (tema) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce",
    });
    const pedidos: string[] = [];
    try {
      await page.route("**/api/**", async (rota) => {
        pedidos.push(rota.request().method());
        await rota.abort();
      });
      await page.goto(`${servidor.url}?gestao&tema=${tema}`);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
      const editar = page.getByRole("button", { name: "Editar Álvaro Teste", exact: true });
      await editar.click();
      const dialogo = page.getByRole("dialog", { name: "Editar Álvaro Teste", exact: true });
      const atual = dialogo.getByRole("combobox", { name: "Turma atual", exact: true });
      const origem = dialogo.getByRole("combobox", { name: "Turma de origem", exact: true });
      const ajudaAtual =
        "Escolha outra turma para mover o aluno. As chamadas anteriores e a turma de origem são preservadas.";
      const ajudaOrigem =
        "Para a Grade do mês. Por padrão é a própria turma; mude quando o aluno veio de outra.";
      await expect(atual).toHaveValue(rotuloB);
      await expect(origem).toHaveValue(rotuloA);
      await expect(atual).toHaveAccessibleDescription(ajudaAtual);
      await expect(origem).toHaveAccessibleDescription(ajudaOrigem);
      for (const [campo, valor] of [
        [atual, rotuloB],
        [origem, rotuloA],
      ] as const) {
        const inteiroNoCampo = await campo.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
        const leituraAdjacente = dialogo.getByText(valor, { exact: true });
        const inteiroAoLado =
          (await leituraAdjacente.count()) === 1 && (await textoCabe(leituraAdjacente));
        expect(
          inteiroNoCampo || inteiroAoLado,
          `o sufixo ${valor.slice(-1)} deve ficar legível no valor selecionado`,
        ).toBe(true);
      }

      await atual.click();
      await expect(atual).toHaveAccessibleDescription(ajudaAtual);
      await atual.fill("turmasintetica");
      const lista = page.getByRole("listbox");
      await expect(lista.getByRole("option")).toHaveCount(3);
      await expect(
        atual,
        "a busca anuncia a turma selecionada e preserva a ajuda",
      ).toHaveAccessibleDescription(`${ajudaAtual} Opção selecionada: ${rotuloB}`);
      await expect(origem).toHaveAccessibleDescription(ajudaOrigem);
      for (const rotulo of [rotuloA, rotuloB, rotuloC]) {
        const opcao = lista.getByRole("option", { name: rotulo, exact: true });
        await expect(opcao).toBeInViewport({ ratio: 1 });
        expect(await textoCabe(opcao)).toBe(true);
        expect(await textoCabe(opcao, lista)).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(lista).toBeHidden();
      await expect(dialogo).toBeVisible();
      await expect(atual).toBeFocused();
      await expect(atual).toHaveValue(rotuloB);
      await expect(atual).toHaveAccessibleDescription(ajudaAtual);
      await atual.fill(rotuloC);
      await expect(lista.getByRole("option")).toHaveCount(1);
      await expect(lista.getByRole("option", { name: rotuloC, exact: true })).toBeVisible();
      await atual.press("ArrowDown");
      await expect(atual).toHaveAttribute("aria-activedescendant", /\S+/);
      await atual.press("Enter");
      await expect(atual).toHaveValue(rotuloC);
      await expect(origem).toHaveValue(rotuloA);
      await expect(atual).toBeFocused();
      await expect(atual).toHaveAccessibleDescription(ajudaAtual);

      await atual.fill("sem turma correspondente");
      await expect(page.getByText("Nenhuma opção encontrada.", { exact: true })).toBeVisible();
      await expect(atual).toHaveAccessibleDescription(
        `${ajudaAtual} Opção selecionada: ${rotuloC}`,
      );
      await page.keyboard.press("Tab");
      await expect(dialogo.getByRole("button", { name: "Marcar como desistente" })).toBeFocused();
      await expect(atual).toHaveValue(rotuloC);
      await expect(atual).toHaveAccessibleDescription(ajudaAtual);

      await origem.fill("mesmoprefixo");
      await expect(origem).toHaveAccessibleDescription(
        `${ajudaOrigem} Opção selecionada: ${rotuloA}`,
      );
      await page.keyboard.press("Tab");
      await expect(origem).not.toBeFocused();
      await expect(lista).toBeHidden();
      await expect(origem).toHaveValue(rotuloA);
      await expect(origem).toHaveAccessibleDescription(ajudaOrigem);
      await expect(atual).toHaveValue(rotuloC);
      await expect(dialogo.getByRole("button", { name: "Salvar", exact: true })).toBeInViewport({
        ratio: 1,
      });
      await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(editar).toBeFocused();
      await editar.press("Enter");
      await expect(atual).toHaveValue(rotuloB);
      await expect(origem).toHaveValue(rotuloA);
      await page.keyboard.press("Escape");
      await expect(dialogo).toBeHidden();
      await expect(editar).toBeFocused();

      const novo = page.getByRole("button", { name: "Novo aluno", exact: true });
      await novo.click();
      const cadastro = page.getByRole("dialog", { name: "Novo aluno", exact: true });
      await expect(
        cadastro.getByRole("combobox", { name: "Turma atual", exact: true }),
      ).toHaveValue(rotuloA);
      await expect(
        cadastro.getByRole("combobox", { name: "Turma de origem", exact: true }),
      ).toHaveValue(rotuloA);
      await expect(cadastro.getByRole("button", { name: "Cadastrar", exact: true })).toBeInViewport(
        { ratio: 1 },
      );
      await cadastro.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(novo).toBeFocused();
      expect(pedidos).toEqual([]);
    } finally {
      await page.close();
    }
  },
);
