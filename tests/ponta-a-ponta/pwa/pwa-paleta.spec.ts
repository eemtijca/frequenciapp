// Cores do navegador e manifesto reais, inclusive troca manual e sistema.
import { expect, test } from "@playwright/test";
import { entrarAdmin } from "../helpers/auth";
import { garantirContasDeTeste } from "../helpers/banco";

test.beforeAll(async () => {
  await garantirContasDeTeste();
});

test("manifesto e viewport inicial usam a paleta aprovada", async ({ request }) => {
  const manifesto = await (await request.get("/manifest.webmanifest")).json();
  expect(manifesto.background_color).toBe("#fcfcfc");
  expect(manifesto.theme_color).toBe("#fcfcfc");
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/name="theme-color"[^>]*content="#fcfcfc"/);
  expect(html).toMatch(/name="theme-color"[^>]*content="#05070a"/);
});

test("theme-color acompanha sistema e preferências manuais", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await entrarAdmin(page);
  const metas = page.locator('meta[name="theme-color"]');
  const conferir = async (cor: string) => {
    await expect
      .poll(() =>
        metas.evaluateAll((nodes) =>
          nodes
            .filter((node) => !node.media || window.matchMedia(node.media).matches)
            .map((node) => node.content),
        ),
      )
      .toEqual([cor]);
  };
  await conferir("#fcfcfc");
  await page.emulateMedia({ colorScheme: "dark" });
  await conferir("#05070a");
  const escolher = async (rotulo: string) => {
    const seletor = page.getByRole("button", { name: /Tema: .* Alterar tema/ });
    if (!(await seletor.isVisible())) {
      await page.getByRole("button", { name: "Conta de Direção" }).click();
    }
    await seletor.click();
    await page.getByRole("radio", { name: rotulo, exact: true }).click();
    await page.keyboard.press("Escape");
  };
  await escolher("Claro");
  await conferir("#fcfcfc");
  await page.emulateMedia({ colorScheme: "light" });
  await escolher("Escuro");
  await conferir("#05070a");
  await escolher("Sistema");
  await conferir("#fcfcfc");
});
