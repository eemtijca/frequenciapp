// Regras da seleção de aulas e do período da chamada parcial, sem banco.
import { describe, expect, it, vi } from "vitest";
import { normalizarAulas, rotuloFrequenciaParcial } from "@/domain/frequencia-parcial";

vi.mock("@/infra/banco", () => ({ banco: vi.fn() }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
import { esquemaFiltrosParciais, esquemaRegistroParcial } from "@/application/frequencia-parcial";

const registro = {
  alunoId: "20b26d9d-172c-4d62-8619-1395c5b3b470",
  dia: "2026-06-15",
  tipo: "AULAS",
  aulas: [2, 4],
};

describe("frequência parcial", () => {
  it("mantém aulas avulsas e identifica intervalos sem preencher lacunas", () => {
    expect(normalizarAulas([4, 2, 4])).toEqual([2, 4]);
    expect(rotuloFrequenciaParcial({ tipo: "AULAS", turno: null, aulas: [4, 2] })).toBe(
      "Aulas 2, 4",
    );
    expect(rotuloFrequenciaParcial({ tipo: "AULAS", turno: null, aulas: [2, 3, 4] })).toBe(
      "2ª à 4ª aula",
    );
    expect(rotuloFrequenciaParcial({ tipo: "AULAS", turno: null, aulas: [2] })).toBe("2ª aula");
  });

  it("identifica cada turno sem presumir a quantidade de aulas", () => {
    expect(rotuloFrequenciaParcial({ tipo: "TURNO", turno: "MANHA", aulas: [] })).toBe("Manhã");
    expect(rotuloFrequenciaParcial({ tipo: "TURNO", turno: "TARDE", aulas: [] })).toBe("Tarde");
    expect(
      esquemaRegistroParcial.safeParse({ ...registro, tipo: "TURNO", turno: "MANHA", aulas: [] })
        .success,
    ).toBe(true);
    expect(esquemaRegistroParcial.safeParse(registro).success).toBe(true);
  });

  it.each([
    { aulas: [] },
    { aulas: [0] },
    { aulas: [31] },
    { aulas: [1.5] },
    { turno: "TARDE" },
    { tipo: "TURNO", turno: "MANHA" },
    { tipo: "TURNO", turno: null, aulas: [] },
    { dia: "2026-02-30" },
    { revisao: -1 },
    { observacao: "A".repeat(301) },
    { registradoSeduc: true },
  ])("recusa a seleção incoerente %j", (mudanca) => {
    expect(esquemaRegistroParcial.safeParse({ ...registro, ...mudanca }).success).toBe(false);
  });

  it("aceita o limite de aulas e remove espaços da observação", () => {
    const dados = esquemaRegistroParcial.parse({
      ...registro,
      aulas: [1, 30],
      observacao: "  Transporte  ",
    });
    expect(dados.observacao).toBe("Transporte");
    expect(dados.aulas).toEqual([1, 30]);
  });

  it("aceita um dia ou um período completo de até 92 dias", () => {
    expect(esquemaFiltrosParciais.safeParse({ dia: "2026-06-15" }).success).toBe(true);
    expect(esquemaFiltrosParciais.safeParse({ de: "2026-06-01", ate: "2026-08-31" }).success).toBe(
      true,
    );
    for (const filtros of [
      { de: "2026-06-01" },
      { ate: "2026-06-01" },
      { de: "2026-06-15", ate: "2026-06-14" },
      { de: "2026-06-01", ate: "2026-09-01" },
      { dia: "2026-06-15", de: "2026-06-01", ate: "2026-06-30" },
      { dia: "2026-02-30" },
    ])
      expect(esquemaFiltrosParciais.safeParse(filtros).success).toBe(false);
  });
});
