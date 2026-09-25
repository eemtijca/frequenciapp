// PWA contra o build de produção: manifest, service worker e página offline.
// Roda com playwright.pwa.config.ts, onde o worker é o real do build.
import { expect, test } from "@playwright/test";
import { entrarAdmin } from "./helpers/auth";
import { aguardarHidratacao } from "./helpers/pagina";

test.describe("PWA", () => {
  test("serve o manifest e registra o service worker", async ({ page }) => {
    await entrarAdmin(page);
    await aguardarHidratacao(page);
    const manifest = (await page.evaluate(async () => {
      const resposta = await fetch("/manifest.webmanifest");
      return resposta.json();
    })) as { name?: string; shortcuts?: unknown[] };
    expect(manifest.name).toBe("FrequenciApp");
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            navigator.serviceWorker.getRegistration().then((registro) => Boolean(registro)),
          ),
        { timeout: 20_000 },
      )
      .toBe(true);
  });

  test("mostra a página offline quando a conexão cai", async ({ page, context }) => {
    await entrarAdmin(page);
    await aguardarHidratacao(page);
    await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 })
      .catch(() => undefined);
    // Uma recarga garante que a página está controlada pelo worker.
    await page.reload();
    await context.setOffline(true);
    await page.goto("/sem-conexao").catch(() => undefined);
    await expect(page.getByText("Você está sem conexão")).toBeVisible();
  });
});
