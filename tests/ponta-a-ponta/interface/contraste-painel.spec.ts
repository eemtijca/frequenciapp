// Verifica a disposição dos indicadores e o contraste dos controles do Painel.
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
    const camadas: string[] = [];
    for (let pai = no.parentElement; pai; pai = pai.parentElement) {
      const fundo = getComputedStyle(pai).backgroundColor;
      camadas.push(fundo);
      if (cor(fundo)[3] === 255) break;
    }
    desenho.clearRect(0, 0, 1, 1);
    for (const fundo of camadas.reverse()) {
      desenho.fillStyle = fundo;
      desenho.fillRect(0, 0, 1, 1);
    }
    const [r, g, b, a] = desenho.getImageData(0, 0, 1, 1).data;
    if (a !== 255) throw new Error("A superfície sob o controle precisa ser opaca.");
    const superficie = `rgb(${r}, ${g}, ${b})`;
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

test("os indicadores do dia empilham no celular e ficam lado a lado no desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await aguardarHidratacao(page);
  const periodo = page.getByRole("button", { name: /^(Dia do painel|Resumo da semana):/ });
  await expect(periodo).toBeVisible();
  if ((await periodo.getAttribute("aria-label"))?.startsWith("Resumo da semana")) {
    await page.getByRole("button", { name: "Dia anterior", exact: true }).click();
  }
  const cartao = page.getByRole("region", { name: "Indicadores do dia", exact: true });
  const infrequencia = cartao.getByRole("group", { name: "Resumo do dia", exact: true });
  const cobertura = cartao.getByRole("group", { name: "Cobertura do dia", exact: true });
  await expect(infrequencia).toBeVisible();
  await expect(cobertura).toBeVisible();

  for (const largura of [320, 390, 768, 904, 905, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await expect
      .poll(async () => {
        const [a, b] = await Promise.all([infrequencia.boundingBox(), cobertura.boundingBox()]);
        if (!a || !b || Math.abs(a.width - b.width) > 1) return "indefinido";
        if (Math.abs(a.x - b.x) < 1 && b.y >= a.y + a.height) return "empilhados";
        if (Math.abs(a.y - b.y) < 1 && b.x >= a.x + a.width) return "lado a lado";
        return "indefinido";
      })
      .toBe(largura < 905 ? "empilhados" : "lado a lado");
  }
});

test("as setas de data do painel têm fundo neutro transparente e contorno legível", async ({
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
  const fundo = rgb(medida.fundo);
  const texto = rgb(medida.texto);
  await page.screenshot({ path: info.outputPath("painel-claro.png"), animations: "disabled" });
  await info.attach("medidas", {
    body: JSON.stringify({
      medida,
      textoFundo: contraste(texto, fundo),
    }),
    contentType: "application/json",
  });
  expect(medida.fundoBruto[3]).toBe(0);
  expect(medida.larguraBorda).toBe("1px");
  expect(contraste(rgb(medida.borda), rgb(medida.superficie))).toBeGreaterThanOrEqual(3);
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
    await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);
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
    expect(seta.fundoBruto[3]).toBe(0);
    expect(controle.fundoBruto[3]).toBe(0);
    expect(seta.larguraBorda).toBe("1px");
    expect(controle.larguraBorda).toBe("1px");
    expect(contraste(rgb(seta.borda), rgb(seta.superficie))).toBeGreaterThanOrEqual(3);
    expect(contraste(rgb(controle.borda), rgb(controle.superficie))).toBeGreaterThanOrEqual(3);
    expect(contraste(rgb(controle.texto), rgb(controle.fundo))).toBeGreaterThanOrEqual(4.5);
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
    expect(coresGrafico.fundoBruto[3]).toBe(0);
    expect(coresGrafico.larguraBorda).toBe("1px");
    expect(contraste(rgb(coresGrafico.borda), rgb(coresGrafico.superficie))).toBeGreaterThanOrEqual(
      3,
    );
  });
}
