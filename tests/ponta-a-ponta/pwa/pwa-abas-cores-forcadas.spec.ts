// Verifica a seleção das abas e o teclado em cores forçadas no navegador.
import path from "node:path";
import { expect, test } from "@playwright/test";
import { garantirContasDeTeste } from "../helpers/banco";
import { entrarAdmin } from "../helpers/auth";
import { trocarVisao } from "../helpers/pagina";

test.beforeAll(async () => {
  await garantirContasDeTeste();
});
test("a aba selecionada continua identificável após o foco sair", async ({ page }, info) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await entrarAdmin(page);
  await trocarVisao(page, "Gestão", "gestao");
  const lista = page.getByRole("tablist", { name: "Áreas de gestão" });
  const abas = lista.getByRole("tab");
  await expect(abas.first()).toHaveAttribute("aria-selected", "true");
  await abas.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(abas.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(abas.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(abas.nth(1)).not.toBeFocused();
  if (process.env.CAPTURAS_ESTADOS)
    await page.screenshot({
      path: path.join(process.env.CAPTURAS_ESTADOS, `abas-forced-${info.project.name}.png`),
    });
  const indicador = lista.locator(".indicador-abas");
  const css = await indicador.evaluate((el) => ({
    outline: getComputedStyle(el).outlineStyle,
    width: parseFloat(getComputedStyle(el).outlineWidth),
    color: getComputedStyle(el).outlineColor,
  }));
  expect(css.outline).toBe("solid");
  expect(css.width).toBeGreaterThanOrEqual(2);
  const bordaInativa = await abas.first().evaluate((el) => getComputedStyle(el).borderColor);
  expect(css.color).not.toBe(bordaInativa);
});
