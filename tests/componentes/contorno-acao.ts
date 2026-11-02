// Verifica cores computadas, alvo e foco dos botões reais nas superfícies em que aparecem.
import type { Locator, Page } from "@playwright/test";
import { expect } from "vitest";
import { contraste, type Rgb } from "../helpers/cor";

export async function conferirContorno(page: Page, botao: Locator, tema: "light" | "dark") {
  await botao.waitFor({ state: "visible" });
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
    tema === "dark",
  );
  expect(await botao.isEnabled()).toBe(true);
  await expect
    .poll(() =>
      botao.evaluate((el) => el.getAnimations().filter((a) => a.playState === "running").length),
    )
    .toBe(0);
  const estilo = await botao.evaluate((el) => {
    const css = getComputedStyle(el);
    const caixa = el.getBoundingClientRect();
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const fundos: string[] = [];
    for (let atual: Element | null = el; atual; atual = atual.parentElement)
      fundos.unshift(getComputedStyle(atual).backgroundColor);
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1, 1);
    for (const fundo of fundos) {
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, 1, 1);
    }
    const superficie = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    ctx.fillStyle = css.color;
    ctx.fillRect(0, 0, 1, 1);
    const texto = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    return {
      fundo: css.backgroundColor,
      borda: css.borderTopColor,
      larguraBorda: css.borderTopWidth,
      estiloBorda: css.borderTopStyle,
      largura: caixa.width,
      altura: caixa.height,
      superficie,
      texto,
    };
  });
  // Uma tolerância subpixel cobre o arredondamento da geometria do navegador.
  expect(estilo.largura).toBeGreaterThanOrEqual(43.99);
  expect(estilo.altura).toBeGreaterThanOrEqual(43.99);
  expect(estilo.larguraBorda).toBe("1px");
  expect(estilo.estiloBorda).toBe("solid");
  if (tema === "light") {
    expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
    expect(estilo.borda).toBe("rgb(217, 221, 218)");
  } else {
    // Valores observados em 888df3c para .controle em repouso no tema escuro.
    expect(estilo.fundo).toBe("oklch(0.282 0.006 90)");
    expect(estilo.borda).toBe("rgba(0, 0, 0, 0)");
  }
  const rgb = (canais: number[]) => canais.map((n) => n / 255) as Rgb;
  expect(contraste(rgb(estilo.texto), rgb(estilo.superficie))).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("Tab");
  await botao.focus();
  expect(await botao.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  await expect
    .poll(() =>
      botao.evaluate((el) => el.getAnimations().filter((a) => a.playState === "running").length),
    )
    .toBe(0);
  const foco = await botao.evaluate((el) => ({
    outline: getComputedStyle(el).outlineStyle,
    outlineWidth: getComputedStyle(el).outlineWidth,
    outlineColor: getComputedStyle(el).outlineColor,
    borderColor: getComputedStyle(el).borderTopColor,
    sombra: getComputedStyle(el).boxShadow,
  }));
  if (tema === "light") {
    expect(foco.outline).toBe("solid");
    expect(foco.outlineWidth).toBe("2px");
    expect(foco.outlineColor).toBe("rgb(8, 100, 64)");
  } else {
    // O anel e a borda de foco também correspondem ao baseline 888df3c.
    expect(foco.borderColor).toBe("oklch(0.6 0.1 160)");
    expect(foco.sombra).toContain("oklab(0.6 -0.0939693 0.034202 / 0.5)");
  }
  await botao.evaluate((el: HTMLElement) => el.blur());
}
