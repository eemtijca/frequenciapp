import { expect, test, type Locator, type Page } from "@playwright/test";
import { contraste, type Rgb } from "../helpers/cor";

const rota = "/tests/fixtures/outline-telas-mov/";
const telas = ["diretor", "entradas", "saidas", "historico"] as const;

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
      opacidade: css.opacity,
    };
  });
}

async function semVariante(botao: Locator) {
  await botao.evaluate((el) => el.classList.remove("controle-contornado"));
  const valor = await estilo(botao);
  await botao.evaluate((el) => el.classList.add("controle-contornado"));
  return valor;
}

async function preparar(page: Page, tela: string, tema: string) {
  await page.route("**/api/**", async (rota) => {
    const url = new URL(rota.request().url());
    const turmaId = url.searchParams.get("turmaId") ?? "t1";
    await rota.fulfill({
      json: url.pathname.includes("diretor")
        ? {
            turmaId,
            periodo: { de: "2026-10-01", ate: "2026-10-30" },
            vinculo: { inicio: "2026-01-01" },
            estatisticas: {
              categorias: [],
              limiteRisco: 25,
              resumo: { alunos: 1, emRisco: 0, alunoDias: 1, taxa: 0 },
              alunos: [],
              semanas: [],
            },
          }
        : { entradas: [], saidas: [] },
    });
  });
  await page.goto(`${rota}?tela=${tela}`);
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle("dark", dark),
    tema === "dark",
  );
  if (tema === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
  else await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important }",
  });
}

for (const tela of telas) {
  for (const tema of ["light", "dark"] as const) {
    for (const largura of [320, 1280]) {
      test(`${tela} alterna controles reais em ${tema}, ${largura}px`, async ({ page }, info) => {
        await page.setViewportSize({ width: largura, height: 900 });
        await preparar(page, tela, tema);
        const grupos =
          tela === "diretor"
            ? ["Turma", "Forma de exibição"]
            : [tela === "historico" ? "Filtrar por série" : "Forma da justificativa"];
        for (const nome of grupos) {
          const grupo = page.getByRole(
            tela === "entradas" || tela === "saidas" ? "radiogroup" : "group",
            { name: nome },
          );
          const botoes = grupo.getByRole(
            tela === "entradas" || tela === "saidas" ? "radio" : "button",
          );
          await expect(botoes.first()).toBeVisible();
          const atributo =
            tela === "entradas" || tela === "saidas" ? "aria-checked" : "aria-pressed";
          const estados = await botoes.evaluateAll(
            (els, attr) => els.map((el) => el.getAttribute(attr)),
            atributo,
          );
          const selecionado = botoes.nth(estados.indexOf("true"));
          const livre = botoes.nth(estados.indexOf("false"));
          await expect(selecionado).toHaveCount(1);
          await expect(livre).toHaveCount(1);
          await expect(selecionado).not.toHaveClass(/controle-contornado/);
          for (const botao of [selecionado, livre]) {
            const caixa = await botao.boundingBox();
            if (!caixa) throw new Error("Controle sem caixa");
            expect(caixa.height).toBeGreaterThanOrEqual(43.99);
            expect(caixa.width).toBeGreaterThanOrEqual(43.99);
            expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura + 0.01);
          }
          await expect(livre).toHaveClass(/controle-contornado/);
          if (tema === "light") {
            expect((await estilo(livre)).fundo).toBe("rgba(0, 0, 0, 0)");
            expect((await estilo(livre)).borda).toBe("rgb(217, 221, 218)");
          } else {
            expect(await estilo(livre)).toEqual(await semVariante(livre));
          }
          await livre.focus();
          await page.keyboard.press("Shift+Tab");
          await page.keyboard.press("Tab");
          await expect(livre).toBeFocused();
          const foco = await estilo(livre);
          expect(foco.outlineStyle !== "none" || foco.sombra !== "none").toBe(true);
          if (tema === "dark") {
            expect(foco).toEqual(await semVariante(livre));
          } else {
            const cores = await livre.evaluate((el) => {
              const ctx = document.createElement("canvas").getContext("2d");
              if (!ctx) throw new Error("Canvas indisponível");
              const pixels = (cor: string) => {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = cor;
                ctx.fillRect(0, 0, 1, 1);
                return Array.from(ctx.getImageData(0, 0, 1, 1).data)
                  .slice(0, 3)
                  .map((n) => n / 255);
              };
              let pai = el.parentElement;
              while (pai && getComputedStyle(pai).backgroundColor === "rgba(0, 0, 0, 0)")
                pai = pai.parentElement;
              if (!pai) throw new Error("Superfície não encontrada");
              return [
                pixels(getComputedStyle(el).outlineColor),
                pixels(getComputedStyle(pai).backgroundColor),
              ];
            });
            expect(contraste(cores[0] as Rgb, cores[1] as Rgb)).toBeGreaterThanOrEqual(3);
          }
          await page.keyboard.press("Enter");
          await expect(livre).toHaveAttribute(atributo, "true");
          await expect(selecionado).toHaveAttribute(atributo, "false");
          await expect(livre).not.toHaveClass(/controle-contornado/);
          await expect(selecionado).toHaveClass(/controle-contornado/);
          await expect(livre).toBeFocused();
          const focoSelecionado = await estilo(livre);
          expect(focoSelecionado.outlineStyle !== "none" || focoSelecionado.sombra !== "none").toBe(
            true,
          );
        }
        await page.screenshot({
          path: info.outputPath(`${tela}-${tema}-${largura}.png`),
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  }
}

test("alternância de exibição oferece contorno no item inativo", async ({ page }) => {
  await preparar(page, "diretor", "light");
  await expect(page.getByRole("button", { name: "Tabela" })).toHaveClass(/controle-contornado/);
});

for (const tema of ["light", "dark"] as const) {
  test(`botão real de entrada desabilitado mantém estilo e não recebe foco em ${tema}`, async ({
    page,
  }) => {
    await preparar(page, "entradas", tema);
    const botao = page.getByRole("radio", { name: "Escrever" });
    // Simula o estado executando, sem efetuar uma gravação ou usar banco.
    await botao.evaluate((el: HTMLButtonElement) => {
      el.disabled = true;
    });
    await expect(botao).toBeDisabled();
    expect(await estilo(botao)).toEqual(await semVariante(botao));
    await botao.focus();
    await expect(botao).not.toBeFocused();
  });
}
