// Abre o Swagger real, com os arquivos locais e a CSP do servidor de produção.
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("carrega a documentação anônima com estilos e operações da API", async ({ page }) => {
  const erros: string[] = [];
  const respostas = new Map<string, number>();
  page.on("pageerror", (erro) => erros.push(erro.message));
  page.on("response", (resposta) =>
    respostas.set(new URL(resposta.url()).pathname, resposta.status()),
  );

  const pagina = await page.goto("/api/docs");

  expect(pagina?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /API do FrequenciApp/ })).toBeVisible();
  await expect(page.locator(".opblock").first()).toBeVisible();
  for (const caminho of [
    "/vendor/swagger-ui/swagger-ui-bundle.js",
    "/vendor/swagger-ui/swagger-ui.css",
    "/api/docs/openapi.json",
  ]) {
    expect(respostas.get(caminho), caminho).toBe(200);
  }
  expect(
    await page.evaluate(() =>
      Array.from(document.styleSheets).some(
        (folha) =>
          folha.href?.endsWith("/vendor/swagger-ui/swagger-ui.css") && folha.cssRules.length > 0,
      ),
    ),
  ).toBe(true);

  const saude = page.locator(".opblock").filter({
    has: page.locator('.opblock-summary-path[data-path="/api/saude"]'),
  });
  await saude.locator(".opblock-summary-control").click();
  await saude.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(saude.locator(".live-responses-table tbody .response-col_status")).toHaveText("200");
  await expect(
    saude.locator(".live-responses-table tbody .response-col_description"),
  ).toContainText('"ok": true');
  expect(erros).toEqual([]);
});
