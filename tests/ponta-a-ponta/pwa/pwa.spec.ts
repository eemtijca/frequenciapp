// PWA contra o build de produção: manifest, service worker e página offline.
// Roda com playwright.pwa.config.ts, onde o worker é o real do build.
import { expect, test } from "@playwright/test";
import { entrarAdmin } from "../helpers/auth";
import { aguardarHidratacao } from "../helpers/pagina";

test.describe("PWA", () => {
  test("ativação real preserva caches externos e limpa somente versões próprias", async ({
    page,
    context,
  }) => {
    // Página estática não registra o worker antes de criar os canários.
    await page.goto("/offline.html");
    await page.evaluate(async () => {
      for (const nome of [
        "canario-externo-e2e",
        "frequenciapp-relatorio-estatico",
        "frequenciapp-8-estatico",
      ])
        await caches.open(nome);
      const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const worker = registro.installing ?? registro.waiting ?? registro.active;
      if (!worker) throw new Error("Worker não foi registrado.");
      if (worker.state !== "activated")
        await new Promise<void>((resolve, reject) => {
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
            if (worker.state === "redundant")
              reject(new Error("Worker descartado antes da ativação."));
          });
        });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const nomes = await page.evaluate(() => caches.keys());
    expect(nomes).toContain("canario-externo-e2e");
    expect(nomes).toContain("frequenciapp-relatorio-estatico");
    expect(nomes).not.toContain("frequenciapp-8-estatico");
    expect(nomes.filter((nome) => /^frequenciapp-\d+-estatico$/.test(nome))).toHaveLength(1);
    await page.evaluate(() => fetch("/api/saude"));
    const urls = await page.evaluate(async () => {
      const entradas = await Promise.all(
        (await caches.keys()).map(async (nome) =>
          (await (await caches.open(nome)).keys()).map((r) => r.url),
        ),
      );
      return entradas.flat();
    });
    expect(urls.some((url) => new URL(url).pathname.startsWith("/api/"))).toBe(false);
    await context.setOffline(true);
    await page.goto("/caminho-offline-sintetico");
    await expect(page.getByText("Sem conexão", { exact: true })).toBeVisible();
  });
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
    await expect(page.getByText("Sem conexão", { exact: true })).toBeVisible();
  });
});
