import { expect, test, type Page } from "@playwright/test";

async function definirConexao(page: Page, online: boolean) {
  await page.evaluate((valor) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: valor });
    window.dispatchEvent(new Event(valor ? "online" : "offline"));
  }, online);
  expect(await page.evaluate(() => navigator.onLine)).toBe(online);
  // Dois frames dão tempo para o efeito e o render do provider após o evento.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("bloqueia o callback offline e recupera online", async ({ page }) => {
  const externos: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3196") await route.continue();
    else {
      externos.push(url.origin);
      await route.abort();
    }
  });
  // Simulação explícita: não depende da conectividade real do navegador.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  await page.goto("/tests/fixtures/atualizacao-offline/");
  const atualizar = page.getByRole("button", { name: "Atualizar tela" });
  const concluir = page.getByRole("button", { name: "Concluir callback sintético" });
  const chamadas = page.getByTestId("chamadas");
  const dados = page.getByTestId("dados");
  await expect(page.locator("main")).toHaveAttribute("data-montado", "true");
  await expect(atualizar).toBeEnabled(); // Registro da tela e efeitos concluídos.
  await definirConexao(page, true);
  await expect(chamadas).toHaveText("0");
  await expect(dados).toHaveText("Dados sintéticos preservados");

  await atualizar.click();
  await expect(chamadas).toHaveText("1");
  await expect(atualizar).toBeDisabled(); // Promise ainda pendente.
  await concluir.click();
  await expect(atualizar).toBeEnabled();
  await expect(dados).toHaveText("Dados sintéticos atualizados");

  await definirConexao(page, false);
  await atualizar.click();
  await expect(page.getByText("Sem conexão. Os dados atuais continuam na tela.")).toBeVisible();
  // Janela de observação para callbacks assíncronos; o timer não é simulado.
  await page.waitForTimeout(100);
  await expect(chamadas).toHaveText("1");
  await expect(dados).toHaveText("Dados sintéticos atualizados");
  await expect(atualizar).toBeEnabled();

  await definirConexao(page, true);
  await atualizar.click();
  await expect(chamadas).toHaveText("2");
  await expect(atualizar).toBeDisabled();
  await concluir.click();
  await expect(atualizar).toBeEnabled();
  await expect(dados).toHaveText("Dados sintéticos atualizados");
  expect(externos).toEqual([]);
});
