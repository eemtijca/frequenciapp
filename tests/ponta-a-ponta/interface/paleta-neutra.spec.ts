// Exercita as cores do tema Material UI no navegador, sem conta nem banco de dados.
import { expect, test } from "@playwright/test";
import { contraste, type Rgb } from "../../helpers/cor";

test.use({ storageState: { cookies: [], origins: [] } });

const rgb = (bytes: number[]): Rgb => [
  (bytes[0] ?? 0) / 255,
  (bytes[1] ?? 0) / 255,
  (bytes[2] ?? 0) / 255,
];

const VARIAVEIS = [
  "--template-palette-primary-main",
  "--template-palette-secondary-main",
  "--template-palette-falta-main",
  "--template-palette-justificada-main",
  "--template-palette-background-default",
  "--template-palette-background-paper",
  "--template-palette-text-primary",
  "--template-palette-text-secondary",
  "--template-palette-divider",
] as const;

for (const rota of ["/", "/bi", "/privacidade"]) {
  for (const tema of ["light", "dark"] as const) {
    test(`cores do tema em ${rota}, ${tema}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("theme", "system"));
      // As telas públicas não precisam de nenhuma API ou sessão para este ensaio.
      await page.route("**/api/**", (route) => route.abort());
      await page.goto(rota);
      await expect(page.locator("html")).toHaveAttribute("data-mui-color-scheme", tema);

      const cores = await page.evaluate((variaveis) => {
        const tela = document.createElement("canvas");
        tela.width = tela.height = 1;
        const desenho = tela.getContext("2d");
        if (!desenho) throw new Error("Não foi possível analisar as cores.");
        const sonda = document.createElement("span");
        document.body.append(sonda);
        const resolver = (valor: string): number[] => {
          desenho.clearRect(0, 0, 1, 1);
          desenho.fillStyle = valor;
          desenho.fillRect(0, 0, 1, 1);
          return Array.from(desenho.getImageData(0, 0, 1, 1).data);
        };
        const raiz = getComputedStyle(document.documentElement);
        const resultado = Object.fromEntries(
          variaveis.map((nome) => [nome, resolver(raiz.getPropertyValue(nome).trim())]),
        );
        sonda.remove();
        return resultado;
      }, VARIAVEIS);

      for (const [nome, canais] of Object.entries(cores)) {
        if (nome === "--template-palette-divider") continue;
        expect(canais[3], `${nome} opaco`).toBe(255);
      }
      const principal = cores["--template-palette-primary-main"] ?? [];
      const fundo = cores["--template-palette-background-default"] ?? [];
      const papel = cores["--template-palette-background-paper"] ?? [];
      const texto = cores["--template-palette-text-primary"] ?? [];
      const secundario = cores["--template-palette-text-secondary"] ?? [];
      const falta = cores["--template-palette-falta-main"] ?? [];
      const justificada = cores["--template-palette-justificada-main"] ?? [];

      expect(contraste(rgb(texto), rgb(fundo)), "texto sobre o fundo").toBeGreaterThanOrEqual(4.5);
      expect(
        contraste(rgb(secundario), rgb(papel)),
        "texto secundário no papel",
      ).toBeGreaterThanOrEqual(4.5);
      expect(contraste(rgb(principal), rgb(fundo)), "primário no fundo").toBeGreaterThanOrEqual(3);
      expect(fundo).not.toEqual(papel);
      expect(falta).not.toEqual(justificada);

      await page.screenshot({
        path: info.outputPath(
          `paleta-${rota === "/" ? "entrada" : rota.slice(1).replaceAll("/", "-")}-${tema}.png`,
        ),
        animations: "disabled",
      });
    });
  }
}
