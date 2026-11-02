import { expect, test, type Locator, type Page } from "@playwright/test";
import { contraste, type Rgb } from "../helpers/cor";

const rota = "/tests/fixtures/controle-contornado/";

async function preparar(page: Page, tema: "light" | "dark") {
  await page.goto(rota);
  await page.evaluate(
    (atual) => document.documentElement.classList.toggle("dark", atual === "dark"),
    tema,
  );
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important }",
  });
}

async function estilo(botao: Locator) {
  return botao.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      fundo: css.backgroundColor,
      borda: css.borderColor,
      cor: css.color,
      outline: css.outlineColor,
      outlineWidth: css.outlineWidth,
      outlineStyle: css.outlineStyle,
      sombra: css.boxShadow,
      opacity: css.opacity,
    };
  });
}

async function original(botao: Locator) {
  await botao.evaluate((el) => el.classList.remove("controle-contornado"));
  const valor = await estilo(botao);
  await botao.evaluate((el) => el.classList.add("controle-contornado"));
  return valor;
}

for (const tema of ["light", "dark"] as const) {
  for (const largura of [320, 390, 1280]) {
    test(`agrupamento real funciona com teclado a ${largura}px em ${tema}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: largura, height: 850 });
      await preparar(page, tema);
      const grupo = page.getByRole("group", { name: "Agrupamento da lista" });
      const atual = grupo.getByRole("button", { name: "Turma atual" });
      const origem = grupo.getByRole("button", { name: "Turma de origem" });
      await expect(atual).toHaveAttribute("aria-pressed", "true");
      await expect(origem).toHaveAttribute("aria-pressed", "false");
      for (const botao of [atual, origem]) {
        const caixa = await botao.boundingBox();
        if (!caixa) throw new Error("Controle sem caixa visível");
        expect(caixa.height).toBeGreaterThanOrEqual(43.99);
        expect(caixa.width).toBeGreaterThanOrEqual(43.99);
        expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);
      }
      if (tema === "light") {
        expect((await estilo(origem)).fundo).toBe("rgba(0, 0, 0, 0)");
        expect((await estilo(origem)).borda).toBe("rgb(217, 221, 218)");
        expect(await estilo(atual)).toEqual(await original(atual));
      } else {
        expect(await estilo(origem)).toEqual(await original(origem));
        expect(await estilo(atual)).toEqual(await original(atual));
      }
      await page.keyboard.press("Tab");
      await expect(atual).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(origem).toBeFocused();
      if (tema === "light") {
        const foco = await estilo(origem);
        expect(foco.outlineStyle).toBe("solid");
        expect(parseFloat(foco.outlineWidth)).toBeGreaterThanOrEqual(2);
        const cores = await origem.evaluate((el) => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx || !el.parentElement) throw new Error("Não foi possível medir o foco");
          const pai = el.parentElement;
          const pixels = (cor: string) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = cor;
            ctx.fillRect(0, 0, 1, 1);
            return Array.from(ctx.getImageData(0, 0, 1, 1).data)
              .slice(0, 3)
              .map((n) => n / 255);
          };
          return [
            pixels(getComputedStyle(el).outlineColor),
            pixels(getComputedStyle(pai).backgroundColor),
          ];
        });
        expect(contraste(cores[0] as Rgb, cores[1] as Rgb)).toBeGreaterThanOrEqual(3);
      }
      await page.keyboard.press("Enter");
      await expect(origem).toHaveAttribute("aria-pressed", "true");
      await expect(atual).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByText("Turma da matrícula, usada na Grade e na planilha."),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`agrupamento-${tema}-${largura}.png`),
        animations: "disabled",
      });
    });
  }
}

test("repouso, hover, herança semântica, selecionados e desabilitados", async ({ page }) => {
  await preparar(page, "light");
  const livre = page.getByRole("button", { name: "Livre" });
  expect((await estilo(livre)).cor).toBe("rgb(112, 48, 32)");
  expect((await estilo(livre)).fundo).toBe("rgba(0, 0, 0, 0)");
  await livre.hover();
  expect((await estilo(livre)).fundo).toBe("rgb(235, 235, 235)");
  await page.mouse.move(0, 0);
  for (const nome of [
    "Selecionado",
    "Pressionado",
    "Selecionado aria",
    "Marcado",
    "Ativo",
    "Desabilitado",
    "Indisponível",
  ]) {
    const botao = page.getByText(nome, { exact: true });
    expect(await estilo(botao), nome).toEqual(await original(botao));
    if (nome !== "Desabilitado") {
      await botao.hover();
      expect(await estilo(botao), `${nome} hover`).toEqual(await original(botao));
      await page.mouse.move(0, 0);
    }
  }
});

test("tema escuro mantém todos os estados originais", async ({ page }) => {
  await preparar(page, "dark");
  for (const nome of [
    "Livre",
    "Selecionado",
    "Pressionado",
    "Selecionado aria",
    "Marcado",
    "Ativo",
    "Desabilitado",
    "Indisponível",
  ]) {
    const botao = page.getByText(nome, { exact: true });
    expect(await estilo(botao), nome).toEqual(await original(botao));
    if (nome !== "Desabilitado") {
      await botao.hover();
      expect(await estilo(botao), `${nome} hover`).toEqual(await original(botao));
      await page.mouse.move(0, 0);
    }
  }
});

test("cores forçadas preservam controle e seleção sem depender do foco", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await preparar(page, "light");
  const atual = page.getByRole("button", { name: "Turma atual" });
  const origem = page.getByRole("button", { name: "Turma de origem" });
  expect(await estilo(origem)).toEqual(await original(origem));
  expect(await estilo(atual)).toEqual(await original(atual));
  await origem.click();
  await origem.blur();
  await expect(origem).toHaveAttribute("aria-pressed", "true");
  const selecionado = await estilo(origem);
  const naoSelecionado = await estilo(atual);
  expect(selecionado.outlineStyle).toBe("solid");
  expect(parseFloat(selecionado.outlineWidth)).toBeGreaterThanOrEqual(2);
  expect(selecionado.outlineWidth).not.toBe(naoSelecionado.outlineWidth);
  await atual.focus();
  await page.keyboard.press("Tab");
  await expect(origem).toBeFocused();
  expect(parseFloat((await estilo(origem)).outlineWidth)).toBeGreaterThanOrEqual(2);
});
