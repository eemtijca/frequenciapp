// Avisos de sucesso preservam o acesso à Gestão no celular e no tablet.
import { expect, test } from "@playwright/test";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

let inicial: ConfiguracaoOrigem | null = null;

test.beforeEach(async () => {
  inicial = await lerOrigem();
});

test.afterEach(async () => {
  if (inicial) await definirOrigem(inicial);
});

for (const largura of [390, 800]) {
  test(`em ${largura} px, Gestão recebe o toque com o aviso de sucesso visível`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    await page.getByRole("tab", { name: "Configurações", exact: true }).click();

    const origem = page.getByRole("group", { name: "Turma de origem na Chamada", exact: true });
    const resposta = page.waitForResponse(
      (item) =>
        new URL(item.url()).pathname === "/api/configuracoes" &&
        item.request().method() === "PATCH",
    );
    await origem.getByRole("switch").click();
    expect((await resposta).status()).toBe(200);

    const aviso = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Indicação de origem atualizada." });
    await expect(aviso).toBeVisible();
    const cabecalho = page.getByRole("banner");
    const caixaCabecalho = await cabecalho.boundingBox();
    expect(caixaCabecalho).not.toBeNull();
    await expect
      .poll(async () => {
        const caixaAviso = await aviso.boundingBox();
        return (
          caixaAviso !== null &&
          caixaAviso.y >= (caixaCabecalho?.y ?? 0) + (caixaCabecalho?.height ?? 0)
        );
      })
      .toBe(true);

    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada");
    await expect(aviso).toBeVisible();

    await trocarVisao(page, "Gestão", "gestao");
    await expect(page.locator("main")).toHaveAttribute("data-visao", "gestao");
    await expect(page.getByRole("heading", { name: "Gestão", exact: true })).toBeVisible();
    await expect(aviso).toBeVisible();
  });
}
