import { describe, expect, it } from "vitest";
import { fixtureBi } from "../../ponta-a-ponta/helpers/fixture-bi";

describe("período da fixture do PWA BI", () => {
  it("usa o dia escolar histórico selecionado para a frequência e o filtro", () => {
    const { dia, personalizacao } = fixtureBi("2024-02-29");
    expect(dia).toBe("2024-02-29");
    expect(personalizacao.preferencias.filtros).toMatchObject({ inicio: dia, fim: dia });
  });
});
