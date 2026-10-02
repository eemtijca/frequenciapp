// Painel sem botão de atualizar (atualiza sozinho) e botão da planilha ao lado
// das abas Saídas e Entradas. Dados sintéticos.
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

test("Painel: sem botão de atualizar, e atualiza sozinho ao voltar para a aba", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  await expect(page.getByRole("button", { name: "Atualizar indicadores" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeAttached();

  const consulta = page.waitForRequest(
    (requisicao) =>
      new URL(requisicao.url()).pathname === "/api/frequencias" &&
      new URL(requisicao.url()).searchParams.has("mes"),
  );
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await consulta;
});

test("Saídas e entradas: o botão da planilha fica na linha das abas", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  const abas = page.getByRole("tablist", { name: "Tipo de registro" });
  const botao = page.getByRole("button", { name: "Enviar as saídas para a planilha" });
  const caixaAbas = await abas.boundingBox();
  const caixaBotao = await botao.boundingBox();
  expect(caixaAbas).not.toBeNull();
  expect(caixaBotao).not.toBeNull();
  // Mesma linha: o centro do botão cai dentro da faixa vertical das abas.
  const centro = (caixaBotao?.y ?? 0) + (caixaBotao?.height ?? 0) / 2;
  expect(centro).toBeGreaterThan(caixaAbas?.y ?? 0);
  expect(centro).toBeLessThan((caixaAbas?.y ?? 0) + (caixaAbas?.height ?? 0));
  expect((caixaBotao?.x ?? 0) + (caixaBotao?.width ?? 0)).toBeLessThanOrEqual(360);

  // Sem faixa de título vazia: a data vem logo abaixo da linha das abas.
  const data = page.locator("#dia-saidas");
  const caixaData = await data.boundingBox();
  expect((caixaData?.y ?? 0) - ((caixaAbas?.y ?? 0) + (caixaAbas?.height ?? 0))).toBeLessThan(40);

  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(estouro).toBe(false);

  // Nas Entradas, o mesmo botão leva à seção da planilha de entradas.
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  const irEntradas = page.getByRole("button", { name: "Ir à planilha de entradas" });
  await expect(irEntradas).toBeEnabled();
  await irEntradas.click();
  await expect(page.locator('section[aria-label="Planilha de entradas"]')).toBeInViewport();
});
