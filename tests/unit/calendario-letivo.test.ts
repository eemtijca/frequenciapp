// Contrato do calendário anual: datas reais, faixa de anos e feriados sem recorrência implícita.
import { describe, expect, it, vi } from "vitest";
import { ehAnoLetivoValido, feriadoNaData } from "@/domain/calendario-letivo";

vi.mock("@/infra/banco", () => ({ banco: vi.fn() }));
import { anoDoCalendario, esquemaCriarFeriado } from "@/application/calendario-letivo";

describe("calendário letivo", () => {
  it("reconhece apenas o feriado cadastrado naquela data e ano", () => {
    const feriados = [{ dia: "2026-10-12", nome: "Feriado escolar" }];
    expect(feriadoNaData(feriados, "2026-10-12")).toEqual(feriados[0]);
    expect(feriadoNaData(feriados, "2027-10-12")).toBeNull();
    expect(feriadoNaData(feriados, "2026-10-13")).toBeNull();
    expect(feriados).toEqual([{ dia: "2026-10-12", nome: "Feriado escolar" }]);
  });

  it("aceita os limites de ano e permite listar todos os anos", () => {
    expect(ehAnoLetivoValido(1900)).toBe(true);
    expect(ehAnoLetivoValido(2199)).toBe(true);
    expect(anoDoCalendario("1900")).toBe(1900);
    expect(anoDoCalendario("2199")).toBe(2199);
    expect(anoDoCalendario(null)).toBeUndefined();
  });

  it.each(["", "1899", "2200", "2026.5", "2e03", "0x7ea", " 2026", "2026 "])(
    "recusa ano inválido na consulta: %s",
    (ano) => {
      expect(() => anoDoCalendario(ano)).toThrow("Informe um ano entre 1900 e 2199.");
    },
  );

  it("valida fevereiro bissexto e remove espaços do nome", () => {
    expect(esquemaCriarFeriado.parse({ dia: "2028-02-29", nome: "  Feriado escolar  " })).toEqual({
      dia: "2028-02-29",
      nome: "Feriado escolar",
    });
    expect(esquemaCriarFeriado.safeParse({ dia: "2026-02-29", nome: "Feriado" }).success).toBe(
      false,
    );
  });

  it.each([
    { dia: "1899-12-31", nome: "Feriado" },
    { dia: "2200-01-01", nome: "Feriado" },
    { dia: "2026-04-31", nome: "Feriado" },
    { dia: "2026-10-12", nome: "   " },
    { dia: "2026-10-12", nome: "A".repeat(121) },
    { dia: "2026-10-12", nome: "Feriado", recorrente: true },
    { dia: "2026-10-12", nome: "Feriado", turmaId: "turma" },
  ])("recusa data, nome ou campos fora do contrato: %j", (dados) => {
    expect(esquemaCriarFeriado.safeParse(dados).success).toBe(false);
  });
});
