// Barra de salvamento da Chamada compacta e atualização global da tela ativa.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, liberarSabadoSeNecessario, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

for (const [nome, largura, altura] of [
  ["desktop", 1440, 900],
  ["celular", 390, 844],
] as const) {
  test(`barra de salvamento compacta no ${nome}`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto("/?visao=chamada");
    await aguardarHidratacao(page);
    const chamada = page.getByRole("region", { name: "Fazer chamada", exact: true });
    await expect(chamada.getByText("E2E Aluno Um")).toBeVisible();
    await liberarSabadoSeNecessario(chamada);

    const barra = page.locator('[aria-label="Barra de salvamento"]');
    await expect(barra).toBeVisible();
    const inicial = await barra.boundingBox();
    const secao = await chamada.boundingBox();
    expect(inicial).not.toBeNull();
    expect(secao).not.toBeNull();
    expect((inicial?.width ?? 0) / (secao?.width ?? 1)).toBeLessThan(0.75);

    const aluno = chamada.getByRole("button", { name: /^E2E Aluno Um:/ });
    await expect(aluno).toBeEnabled();
    await aluno.click();
    await expect(barra.getByRole("button", { name: "Descartar" })).toBeVisible();

    const depois = await barra.boundingBox();
    expect(depois).not.toBeNull();
    expect((depois?.width ?? 0) / (secao?.width ?? 1)).toBeLessThan(0.85);
    if (largura >= 1280) {
      // No desktop, a barra fica à direita, sem ocupar a largura da lista.
      expect((depois?.x ?? 0) + (depois?.width ?? 0)).toBeGreaterThan(
        (secao?.x ?? 0) + (secao?.width ?? 0) / 2,
      );
    } else {
      // No celular, fica centralizada e dentro da tela.
      const centro = (depois?.x ?? 0) + (depois?.width ?? 0) / 2;
      expect(Math.abs(centro - largura / 2)).toBeLessThan(3);
      expect((depois?.x ?? 0) >= 0).toBe(true);
      expect((depois?.x ?? 0) + (depois?.width ?? 0) <= largura).toBe(true);
    }
    await barra.getByRole("button", { name: "Descartar" }).click();
    const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?" });
    await dialogo.getByRole("button", { name: "Descartar", exact: true }).click();
    await expect(barra.getByRole("button", { name: "Descartar" })).toHaveCount(0);
  });
}

test("o botão global atualiza a tela ativa e não descarta um rascunho", async ({ page }) => {
  await page.goto("/?visao=painel");
  await aguardarHidratacao(page);
  const pedido = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/frequencias" && item.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  expect((await pedido).status()).toBe(200);

  // Em Configurações, o rascunho bloqueia a atualização com uma orientação clara.
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  const recursos = page.locator('[data-secao="config-recursos"]');
  await recursos.getByRole("switch", { name: "Saídas e Entradas" }).click();
  const barra = page.locator('div[role="region"][aria-label^="Salvar"]');
  await expect(barra).toBeVisible();

  // A barra de Configurações segue a lógica compacta da Chamada.
  const caixaBarra = await barra.boundingBox();
  const caixaConteudo = await page.locator("#config-grupo-escola").boundingBox();
  const largura = page.viewportSize()?.width ?? 0;
  expect(caixaBarra).not.toBeNull();
  expect(caixaConteudo).not.toBeNull();
  expect(caixaBarra?.width ?? 0).toBeLessThan(caixaConteudo?.width ?? 0);
  if (largura < 1024) {
    const centro = (caixaBarra?.x ?? 0) + (caixaBarra?.width ?? 0) / 2;
    expect(Math.abs(centro - largura / 2)).toBeLessThan(3);
  } else {
    expect((caixaBarra?.x ?? 0) + (caixaBarra?.width ?? 0)).toBeGreaterThan(
      (caixaConteudo?.x ?? 0) + (caixaConteudo?.width ?? 0) - 24,
    );
  }

  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  await expect(
    page.getByText("Salve ou descarte as alterações antes de atualizar.", { exact: true }),
  ).toBeVisible();
  await expect(barra).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?" });
  await dialogo.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(barra).toHaveCount(0);
});
