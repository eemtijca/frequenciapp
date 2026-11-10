// Classificação de faltas pelo retrato persistido, sem consultar a grade atual.
import { expect, it } from "vitest";
import { classificarFaltasPorAulas } from "@/domain/frequencia";
const retrato = new Set(["a1", "a2"]);
it("sem falta é presença", () => {
  expect(classificarFaltasPorAulas(new Map(), retrato)).toBe("P");
});
it("falta em uma das duas aulas do retrato é presença parcial", () => {
  expect(classificarFaltasPorAulas(new Map([["a1", false]]), retrato)).toBe("S");
  expect(classificarFaltasPorAulas(new Map([["a1", true]]), retrato)).toBe("S");
});
it("falta nas duas aulas do retrato é integral", () => {
  expect(
    classificarFaltasPorAulas(
      new Map([
        ["a1", false],
        ["a2", false],
      ]),
      retrato,
    ),
  ).toBe("F");
  expect(
    classificarFaltasPorAulas(
      new Map([
        ["a1", true],
        ["a2", true],
      ]),
      retrato,
    ),
  ).toBe("FJ");
});
it("falta fora do retrato não vira presença parcial", () => {
  expect(classificarFaltasPorAulas(new Map([["fora", false]]), retrato)).toBe("F");
  expect(classificarFaltasPorAulas(new Map([["fora", true]]), retrato)).toBe("FJ");
});
it("falta dentro e fora do retrato continua parcial", () => {
  expect(
    classificarFaltasPorAulas(
      new Map([
        ["a1", false],
        ["fora", false],
      ]),
      retrato,
    ),
  ).toBe("S");
});
