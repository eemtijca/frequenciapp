// Exercita a página offline do service worker real e a reconexão por teclado.
import path from "node:path";
import { expect, test } from "@playwright/test";
import { garantirContasDeTeste } from "../helpers/banco";
import { entrarAdmin } from "../helpers/auth";

test.beforeAll(async () => {
  await garantirContasDeTeste();
});
for (const tema of ["light", "dark"] as const) {
  test(`offline ${tema}: tentar novamente antes e depois da reconexão`, async ({
    page,
    context,
  }, info) => {
    await page.emulateMedia({ colorScheme: tema });
    await entrarAdmin(page);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await expect
      .poll(() => page.evaluate(async () => (await caches.match("/offline.html"))?.status))
      .toBe(200);
    await context.setOffline(true);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      tema === "light" ? "rgb(246, 246, 246)" : "rgb(28, 27, 25)",
    );
    await expect(page.getByRole("link", { name: "Tentar de novo" })).toHaveCSS(
      "background-color",
      "rgb(23, 120, 77)",
    );
    await page.keyboard.press("Tab");
    const tentar = page.getByRole("link", { name: "Tentar de novo" });
    await expect(tentar).toBeFocused();
    if (process.env.CAPTURAS_ESTADOS)
      await page.screenshot({
        path: path.join(process.env.CAPTURAS_ESTADOS, `offline-${tema}-${info.project.name}.png`),
      });
    await Promise.all([
      page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame() }),
      page.keyboard.press("Enter"),
    ]);
    await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("link", { name: "Tentar de novo" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  });
}
