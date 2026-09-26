// Catálogo de justificativas: ordenação, rótulos e validação por catálogo.
import { describe, expect, it } from "vitest";
import {
  ehJustificativaValida,
  JUSTIFICATIVAS_PADRAO,
  ordenarJustificativas,
  rotuloJustificativa,
  type Justificativa,
} from "@/domain/frequencia";

const catalogoCustom: Justificativa[] = [
  { codigo: "Z", rotulo: "Zelo" },
  { codigo: "A", rotulo: "Água" },
  { codigo: "D", rotulo: "Doente" },
  { codigo: "C", rotulo: "Consulta" },
];

describe("ordenarJustificativas", () => {
  it("ordena pelo rótulo em português, sem diferenciar caixa", () => {
    const ordenado = ordenarJustificativas(catalogoCustom).map((item) => item.rotulo);
    expect(ordenado).toEqual(["Água", "Consulta", "Doente", "Zelo"]);
  });
  it("não altera a lista original", () => {
    const copia = [...catalogoCustom];
    ordenarJustificativas(catalogoCustom);
    expect(catalogoCustom).toEqual(copia);
  });
});

describe("catálogo configurável", () => {
  it("resolve rótulo e validação no catálogo informado", () => {
    expect(rotuloJustificativa("A", catalogoCustom)).toBe("Água");
    expect(rotuloJustificativa("X", catalogoCustom)).toBe("");
    expect(ehJustificativaValida("Z", catalogoCustom)).toBe(true);
    expect(ehJustificativaValida("D", [])).toBe(false);
  });
  it("usa o catálogo padrão quando nenhum é informado", () => {
    expect(rotuloJustificativa("Dat")).toBe("Doente com atestado");
    expect(ehJustificativaValida("LM")).toBe(true);
    expect(JUSTIFICATIVAS_PADRAO).toHaveLength(12);
  });
});
