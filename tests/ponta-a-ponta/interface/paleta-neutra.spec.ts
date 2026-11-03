// Exercita as folhas reais no navegador, sem conta nem banco de dados.
import { expect, test } from "@playwright/test";
import { contraste, type Rgb } from "../../helpers/cor";

test.use({ storageState: { cookies: [], origins: [] } });

const rgb = (bytes: number[]): Rgb => [
  (bytes[0] ?? 0) / 255,
  (bytes[1] ?? 0) / 255,
  (bytes[2] ?? 0) / 255,
];

for (const rota of ["/", "/bi"]) {
  for (const tema of ["light", "dark"] as const) {
    test(`superfícies, texto e cores preservadas em ${rota}, ${tema}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      // As telas públicas não precisam de nenhuma API ou sessão para este ensaio.
      await page.route("**/api/**", (route) => route.abort());
      await page.goto(rota);
      await expect(page.locator("html")).toHaveClass(new RegExp(tema));
      const cartao = page.locator(".superficie").filter({ visible: true }).first();
      await expect(cartao).toBeVisible();
      const esperados =
        tema === "light"
          ? {
              primary: "oklch(0.5 0.11 160)",
              falta: "oklch(0.5 0.16 27)",
              justificada: "oklch(0.55 0.12 250)",
              alerta: "oklch(0.7 0.15 75)",
              secondary: "oklch(0.965 0.004 90)",
              input: "oklch(0.62 0.008 90)",
              accent: "oklch(0.945 0.016 160)",
              trilho: "oklch(0.9 0.005 90)",
            }
          : {
              primary: "oklch(0.7 0.13 160)",
              falta: "oklch(0.55 0.17 27)",
              justificada: "oklch(0.66 0.12 250)",
              alerta: "oklch(0.75 0.15 80)",
              secondary: "oklch(0.3 0.006 90)",
              input: "oklch(1 0 0 / 38%)",
              accent: "oklch(0.3 0.02 160)",
              trilho: "oklch(1 0 0 / 14%)",
            };
      const medidas = await cartao.evaluate((no, esperados) => {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) throw new Error("Não foi possível analisar as cores.");
        const cor = (valor: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = valor;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data);
        };
        const raiz = getComputedStyle(document.documentElement);
        return {
          fundo: cor(getComputedStyle(document.body).backgroundColor),
          texto: cor(getComputedStyle(document.body).color),
          cartao: cor(getComputedStyle(no).backgroundColor),
          textoCartao: cor(getComputedStyle(no).color),
          tokens: Object.fromEntries(
            Object.keys(esperados).map((nome) => [
              nome,
              cor(raiz.getPropertyValue(`--${nome}`).trim()),
            ]),
          ),
          tokensEsperados: Object.fromEntries(
            Object.entries(esperados).map(([nome, valor]) => [nome, cor(valor)]),
          ),
        };
      }, esperados);
      expect(medidas.tokens).toEqual(medidas.tokensEsperados);
      if (tema === "light") {
        expect(medidas.fundo).toEqual([246, 246, 246, 255]);
        expect(medidas.cartao).toEqual([255, 255, 255, 255]);
      } else {
        expect(medidas.fundo).toEqual([20, 20, 18, 255]);
      }
      expect(contraste(rgb(medidas.texto), rgb(medidas.fundo))).toBeGreaterThanOrEqual(4.5);
      expect(contraste(rgb(medidas.textoCartao), rgb(medidas.cartao))).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({
        path: info.outputPath(`paleta-${rota === "/" ? "entrada" : "bi"}-${tema}.png`),
        animations: "disabled",
      });
    });
  }
}
