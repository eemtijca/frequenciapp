// Capturas do README: gera as imagens de docs/imagens com massa sintética e sem dados reais.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const pastaImagens = path.resolve(process.cwd(), "docs/imagens");

test.describe("Capturas do README", () => {
  test("painel do dia no desktop, claro e escuro", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Capturas de desktop apenas no Chromium.");
    await mkdir(pastaImagens, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Painel", "painel");
    await page.waitForTimeout(800);
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      path: path.join(pastaImagens, "painel-desktop-claro.png"),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: path.join(pastaImagens, "painel-desktop-escuro.png"),
      animations: "disabled",
    });
  });

  test("chamada no celular, claro e escuro", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "Capturas de celular apenas no mobile-chrome.",
    );
    await mkdir(pastaImagens, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    await page.waitForTimeout(800);
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      path: path.join(pastaImagens, "chamada-mobile-claro.png"),
      animations: "disabled",
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({
      path: path.join(pastaImagens, "chamada-mobile-escuro.png"),
      animations: "disabled",
    });
  });
});
