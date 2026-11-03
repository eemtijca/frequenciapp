// Verifica a visibilidade e o contraste dos controles de data do painel.
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
    const compor = (valor: string, base: string) => {
      desenho.clearRect(0, 0, 1, 1);
      desenho.fillStyle = base;
      desenho.fillRect(0, 0, 1, 1);
      desenho.fillStyle = valor;
      desenho.fillRect(0, 0, 1, 1);
      return Array.from(desenho.getImageData(0, 0, 1, 1).data);
    };
    const estilo = getComputedStyle(no);
    const superficie = getComputedStyle(document.body).backgroundColor;
    return {
      fundo: compor(estilo.backgroundColor, superficie),
      fundoBruto: cor(estilo.backgroundColor),
      borda: compor(estilo.borderTopColor, superficie),
      larguraBorda: estilo.borderTopWidth,
      texto: cor(estilo.color),
      superficie: cor(superficie),
    };
  });
}

function rgb(cor: number[]): Rgb {
  return [(cor[0] ?? 0) / 255, (cor[1] ?? 0) / 255, (cor[2] ?? 0) / 255];
}

test("as setas de data do painel têm fundo suave e borda no tema claro", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await page.goto("/");
  await aguardarHidratacao(page);
  const anterior = page.getByRole("button", { name: "Dia anterior", exact: true });
  await expect(anterior).toBeVisible();
  await page.mouse.move(389, 843);
  const medida = await cores(anterior);
  const fundo = rgb(medida.fundo);
  const borda = rgb(medida.borda);
  const superficie = rgb(medida.superficie);
  const texto = rgb(medida.texto);
  await page.screenshot({ path: info.outputPath("painel-claro.png"), animations: "disabled" });
  await info.attach("medidas", {
    body: JSON.stringify({
      medida,
      bordaSuperficie: contraste(borda, superficie),
      textoFundo: contraste(texto, fundo),
    }),
    contentType: "application/json",
  });
  expect(medida.fundoBruto[3]).toBe(255);
  expect(medida.larguraBorda).toBe("1px");
  expect(contraste(borda, superficie)).toBeGreaterThanOrEqual(3);
  expect(contraste(texto, fundo)).toBeGreaterThanOrEqual(4.5);
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
    const superficie = rgb(seta.superficie);
    expect(seta.fundoBruto[3]).toBe(255);
    expect(controle.fundoBruto[3]).toBe(255);
    expect(seta.larguraBorda).toBe("1px");
    expect(controle.larguraBorda).toBe("1px");
    expect(contraste(rgb(seta.borda), superficie)).toBeGreaterThanOrEqual(3);
    expect(contraste(rgb(controle.borda), superficie)).toBeGreaterThanOrEqual(3);
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
    expect(coresGrafico.fundoBruto[3]).toBe(255);
    expect(coresGrafico.larguraBorda).toBe("1px");
    expect(contraste(rgb(coresGrafico.borda), superficie)).toBeGreaterThanOrEqual(3);
  });
}
