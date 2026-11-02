// Verifica a visibilidade dos controles de data do painel sem alterar outros controles.
import { expect, test, type Locator } from "@playwright/test";
import { contraste, type Rgb } from "../../helpers/cor";
import { aguardarHidratacao } from "../helpers/pagina";

async function cores(elemento: Locator) {
  return elemento.evaluate((no) => {
    const tela = document.createElement("canvas");
    tela.width = tela.height = 1;
    const desenho = tela.getContext("2d");
    if (!desenho) throw new Error("Não foi possível analisar as cores.");
    const cor = (valor: string) => {
      desenho.clearRect(0, 0, 1, 1);
      desenho.fillStyle = valor;
      desenho.fillRect(0, 0, 1, 1);
      return Array.from(desenho.getImageData(0, 0, 1, 1).data);
    };
    const estilo = getComputedStyle(no);
    return {
      fundo: cor(estilo.backgroundColor),
      borda: cor(estilo.borderTopColor),
      larguraBorda: estilo.borderTopWidth,
      texto: cor(estilo.color),
      superficie: cor(getComputedStyle(document.body).backgroundColor),
    };
  });
}

function rgb(cor: number[]): Rgb {
  return [(cor[0] ?? 0) / 255, (cor[1] ?? 0) / 255, (cor[2] ?? 0) / 255];
}

test("as setas de data do painel têm fundo transparente e borda no tema claro", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await page.goto("/");
  await aguardarHidratacao(page);
  const anterior = page.getByRole("button", { name: "Dia anterior", exact: true });
  await expect(anterior).toBeVisible();
  await page.mouse.move(389, 843);
  const medida = await cores(anterior);
  const superficie = rgb(medida.superficie);
  const texto = rgb(medida.texto);
  await page.screenshot({ path: info.outputPath("painel-claro.png"), animations: "disabled" });
  await info.attach("medidas", {
    body: JSON.stringify({
      medida,
      textoSuperficie: contraste(texto, superficie),
    }),
    contentType: "application/json",
  });
  expect(medida.fundo[3]).toBe(0);
  expect(medida.borda).toEqual([217, 221, 218, 255]);
  expect(medida.larguraBorda).toBe("1px");
  expect(contraste(texto, superficie)).toBeGreaterThanOrEqual(4.5);
  await anterior.click();
  await expect(page.getByRole("button", { name: "Dia seguinte", exact: true })).toBeEnabled();
});

for (const tema of ["light", "dark"] as const) {
  test(`setas preservam interação e controles vizinhos em ${tema}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(tema));
    await page.mouse.move(389, 843);
    const anterior = page.getByRole("button", { name: "Dia anterior", exact: true });
    const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
    const periodo = page.getByRole("button", { name: /^(Dia do painel|Resumo da semana):/ });
    await expect(anterior).toBeEnabled();
    await expect(seguinte).toBeDisabled();
    const seta = await cores(anterior);
    // O resumo semanal não tem navegação de gráficos; o seletor de período
    // continua presente tanto no domingo quanto nos demais dias.
    const controle = await cores(periodo);
    expect(seta.fundo).toEqual(controle.fundo);
    if (tema === "light") expect(seta.fundo[3]).toBe(0);
    const caixa = await anterior.boundingBox();
    expect(caixa?.width).toBeGreaterThanOrEqual(44);
    expect(caixa?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    await anterior.focus();
    await expect(anterior).toBeFocused();
    expect(await anterior.evaluate((no) => no.matches(":focus-visible"))).toBe(true);
    const foco = await anterior.evaluate((no) => ({
      sombra: getComputedStyle(no).boxShadow,
      contorno: getComputedStyle(no).outlineStyle,
    }));
    expect(foco.sombra !== "none" || foco.contorno !== "none").toBe(true);
    await page.keyboard.press("Enter");
    await expect(seguinte).toBeEnabled();
    await seguinte.click();
    await expect(seguinte).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`painel-${tema}.png`), animations: "disabled" });

    // Verifica também o controle de gráficos da vista diária, inclusive aos domingos.
    if ((await periodo.getAttribute("aria-label"))?.startsWith("Resumo da semana")) {
      await anterior.click();
    }
    await expect(periodo).toHaveAttribute("aria-label", /^Dia do painel:/);
    const grafico = page.getByRole("button", { name: "Próximo gráfico", exact: true });
    const coresGrafico = await cores(grafico);
    expect(coresGrafico.fundo).toEqual((await cores(periodo)).fundo);
    if (tema === "light") {
      expect(coresGrafico.borda).toEqual([217, 221, 218, 255]);
      expect(coresGrafico.larguraBorda).toBe("1px");
    }
  });
}
