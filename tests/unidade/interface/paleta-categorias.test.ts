// Confere o contraste das categorias da rosca sobre as superfícies dos dois esquemas.
import { describe, expect, it } from "vitest";
import { CORES_CATEGORIAS, colorSchemes } from "@/theme/paleta";
import { contraste, hexParaRgb, hslParaRgb, lerHsl } from "../../helpers/cor";

function rgb(cor: string) {
  return cor.startsWith("#") ? hexParaRgb(cor) : hslParaRgb(...lerHsl(cor));
}

describe.each([
  { esquema: "light", modo: "claro" },
  { esquema: "dark", modo: "escuro" },
] as const)("cores categóricas no tema $modo", ({ esquema, modo }) => {
  it("mantém contraste de pelo menos 3:1 contra papel e fundo", () => {
    const fundo = colorSchemes[esquema].palette?.background;
    for (const superficie of [fundo?.paper, fundo?.default]) {
      if (typeof superficie !== "string") throw new Error("Cor da superfície ausente");
      for (const categoria of CORES_CATEGORIAS) {
        expect(
          contraste(rgb(categoria[modo]), rgb(superficie)),
          `${categoria[modo]} sobre ${superficie}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
