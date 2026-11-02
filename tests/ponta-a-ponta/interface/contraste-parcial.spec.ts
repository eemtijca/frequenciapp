// Verifica a visibilidade da ação de registro na Chamada Parcial.
import { expect, test } from "@playwright/test";
import { contraste, type Rgb } from "../../helpers/cor";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

test("a ação Registrar se destaca da linha clara do aluno", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
  const botao = page.getByRole("button", {
    name: "Registrar frequência parcial de E2E Aluno Um",
    exact: true,
  });
  await expect(botao).toBeVisible();
  await page.mouse.move(389, 843);
  const cores = await botao.evaluate((no) => {
    const linha = no.closest("li");
    if (!linha) throw new Error("Linha de aluno não encontrada.");
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
    const css = getComputedStyle(no);
    // Compor os fundos ancestrais: transparente não é preto.
    const camadas: string[] = [];
    for (let atual: Element | null = no; atual; atual = atual.parentElement) {
      camadas.unshift(getComputedStyle(atual).backgroundColor);
    }
    desenho.clearRect(0, 0, 1, 1);
    desenho.fillStyle = "white";
    desenho.fillRect(0, 0, 1, 1);
    for (const camada of camadas) {
      desenho.fillStyle = camada;
      desenho.fillRect(0, 0, 1, 1);
    }
    const superficieComposta = Array.from(desenho.getImageData(0, 0, 1, 1).data);
    return {
      fundo: cor(css.backgroundColor),
      texto: cor(css.color),
      borda: cor(css.borderColor),
      larguraBorda: css.borderTopWidth,
      superficie: superficieComposta,
    };
  });
  const rgb = (cor: number[]): Rgb => [
    (cor[0] ?? 0) / 255,
    (cor[1] ?? 0) / 255,
    (cor[2] ?? 0) / 255,
  ];
  const bordaSuperficie = contraste(rgb(cores.borda), rgb(cores.superficie));
  const textoFundo = contraste(rgb(cores.texto), rgb(cores.superficie));
  await info.attach("medidas", {
    body: JSON.stringify({ cores, bordaSuperficie, textoFundo }),
    contentType: "application/json",
  });
  await page.screenshot({ path: info.outputPath("parcial-claro.png"), animations: "disabled" });
  expect(cores.fundo[3]).toBe(0);
  expect(textoFundo).toBeGreaterThanOrEqual(4.5);
  expect(parseFloat(cores.larguraBorda)).toBeGreaterThan(0);
  // Contorno discreto e visível; não apresenta esta diferença como norma WCAG.
  expect(bordaSuperficie).toBeGreaterThan(1);
  await botao.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a ação preserva o tema escuro e funciona com teclado", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
  const botao = page.getByRole("button", {
    name: "Registrar frequência parcial de E2E Aluno Um",
    exact: true,
  });
  await expect(botao).toBeEnabled();
  await page.mouse.move(389, 843);
  const fundo = (elemento: Element) => getComputedStyle(elemento).backgroundColor;
  const anterior = page.getByRole("button", {
    name: "Dia anterior da chamada parcial",
    exact: true,
  });
  expect(await botao.evaluate(fundo)).toBe(await anterior.evaluate(fundo));
  const caixa = await botao.boundingBox();
  expect(caixa?.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await botao.focus();
  await expect(botao).toBeFocused();
  expect(await botao.evaluate((no) => getComputedStyle(no).boxShadow)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: info.outputPath("parcial-escuro.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
});
