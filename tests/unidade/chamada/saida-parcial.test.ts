// Contagem das aulas concluídas na saída, inclusive limites e horários históricos incompletos.
import { describe, expect, it } from "vitest";
import { aulasConcluidasNaSaida } from "@/domain/saida-parcial";

const aulas = [
  { id: "h1", ordem: 1, inicio: "07:00", fim: "07:50" },
  { id: "h2", ordem: 2, inicio: "07:50", fim: "08:40" },
  { id: "h3", ordem: 3, inicio: "13:00", fim: "13:50" },
];

describe("aulas concluídas antes da saída", () => {
  it.each([
    ["06:59", []],
    ["07:25", []],
    ["07:50", [1]],
    ["08:10", [1]],
    ["11:50", [1, 2]],
    ["12:30", [1, 2]],
    ["13:25", [1, 2]],
    ["13:50", [1, 2, 3]],
  ])("às %s considera somente as aulas encerradas", (horario, esperado) => {
    expect(aulasConcluidasNaSaida(horario, aulas)).toEqual(esperado);
  });
  it("preserva as faltas já registradas, mesmo antes do horário da saída", () => {
    expect(aulasConcluidasNaSaida("12:00", aulas, ["h1"])).toEqual([2]);
  });
  it("não inventa aulas quando o horário ou a grade estão incompletos", () => {
    expect(aulasConcluidasNaSaida(null, aulas)).toBeNull();
    expect(aulasConcluidasNaSaida("99:00", aulas)).toBeNull();
    expect(aulasConcluidasNaSaida("12:00", [])).toBeNull();
    expect(
      aulasConcluidasNaSaida("12:00", [
        { ...aulas[0], id: "h1", ordem: 1, inicio: "08:00", fim: "07:00" },
      ]),
    ).toBeNull();
  });
});
