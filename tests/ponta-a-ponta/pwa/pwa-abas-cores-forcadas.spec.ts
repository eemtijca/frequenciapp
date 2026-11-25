// Verifica seleção e teclado na gaveta em cores forçadas no navegador.
import path from "node:path";
import { expect, test } from "@playwright/test";
import { garantirContasDeTeste } from "../helpers/banco";
import { entrarAdmin } from "../helpers/auth";
import { trocarVisao } from "../helpers/pagina";

test.beforeAll(async () => {
  await garantirContasDeTeste();
});
test("o cadastro selecionado continua identificável após o foco sair", async ({ page }, info) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await entrarAdmin(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.setViewportSize({ width: 1280, height: 800 });
  const nav = page.getByRole("navigation", { name: "Seções do aplicativo", exact: true });
  const series = nav.getByRole("button", { name: "Séries", exact: true });
  const turmas = nav.getByRole("button", { name: "Turmas", exact: true });
  await expect(series).toHaveAttribute("aria-current", "page");
  await series.focus();
  await page.keyboard.press("Tab");
  await expect(turmas).toBeFocused();
  await page.keyboard.press("Space");
  await expect(turmas).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Tab");
  await expect(turmas).not.toBeFocused();
  if (process.env.CAPTURAS_ESTADOS)
    await page.screenshot({
      path: path.join(process.env.CAPTURAS_ESTADOS, `gaveta-forced-${info.project.name}.png`),
    });
  await expect(turmas).toHaveCSS("border-inline-start-style", "solid");
  await expect(turmas).toHaveCSS("border-inline-start-width", "3px");
  await expect(series).toHaveCSS("border-inline-start-width", "0px");
});
