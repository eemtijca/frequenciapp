// Toque na linha da Chamada: a marca P, fora do nome, alterna a falta no toque e no clique.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, liberarSabadoSeNecessario, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  await criarMassaE2E();
});

test.afterAll(async () => {
  await limparMassaE2E();
});

async function abrirChamada(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const painel = page.locator('section[aria-label="Fazer chamada"]');
  const pilula = painel
    .getByRole("group", { name: "Turma atual" })
    .getByRole("button", { name: /E2E Ano A/ });
  if (await pilula.isVisible().catch(() => false)) await pilula.click();
  await liberarSabadoSeNecessario(painel);
  const aluno = painel.getByRole("button", { name: /^E2E Aluno Um/ });
  await expect(aluno).toHaveAttribute("aria-pressed", "false");
  // A marca fica fora do botão do nome; o toque nela depende da camada que cobre a linha.
  const marca = aluno
    .locator("xpath=ancestor::div[contains(@class,'faixa-toque')]")
    .locator("span", { hasText: /^(P|F)$/ })
    .last();
  await marca.scrollIntoViewIfNeeded();
  await expect(marca).toBeInViewport();
  const caixa = await marca.boundingBox();
  if (!caixa) throw new Error("Marca da linha sem posição.");
  return { aluno, x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
}

test.describe("toque", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("o toque na marca P marca a falta e o segundo toque volta a presente", async ({ page }) => {
    const { aluno, x, y } = await abrirChamada(page);
    await page.touchscreen.tap(x, y);
    await expect(aluno).toHaveAttribute("aria-pressed", "true");
    await page.touchscreen.tap(x, y);
    await expect(aluno).toHaveAttribute("aria-pressed", "false");
  });
});

test("o clique na marca P com o mouse pressionado alterna a falta", async ({ page }) => {
  const { aluno, x, y } = await abrirChamada(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Segurar o botão mantém o estado :active, quando a escala antiga encolhia a camada.
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(aluno).toHaveAttribute("aria-pressed", "true");
});
