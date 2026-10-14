// Períodos civis do BI nas viradas de dia, semana, mês e ano, incluindo ano bissexto.
import { describe, expect, it } from "vitest";
import { periodoRapidoBi } from "@/domain/bi-periodos";

describe("períodos rápidos do FrequenciBI", () => {
  it("usa o fuso da escola quando o dispositivo já mudou de dia e ano", () => {
    const agora = new Date("2027-01-01T01:30:00Z");
    expect(periodoRapidoBi("hoje", agora, "America/Fortaleza")).toEqual({
      inicio: "2026-12-31",
      fim: "2026-12-31",
    });
    expect(periodoRapidoBi("ano", agora, "America/Fortaleza")).toEqual({
      inicio: "2026-01-01",
      fim: "2026-12-31",
    });
    expect(periodoRapidoBi("hoje", agora, "Asia/Tokyo")).toEqual({
      inicio: "2027-01-01",
      fim: "2027-01-01",
    });
  });

  it.each([
    ["2026-12-28T12:00:00Z", "2026-12-28", "2027-01-03"],
    ["2027-01-03T12:00:00Z", "2026-12-28", "2027-01-03"],
    ["2027-01-04T12:00:00Z", "2027-01-04", "2027-01-10"],
  ])("mantém semanas de segunda a domingo em %s", (instante, inicio, fim) => {
    expect(periodoRapidoBi("semana", new Date(instante), "America/Fortaleza")).toEqual({
      inicio,
      fim,
    });
  });

  it.each([
    ["2024-02-15T12:00:00Z", "2024-02-01", "2024-02-29"],
    ["2026-02-15T12:00:00Z", "2026-02-01", "2026-02-28"],
    ["2027-01-01T01:30:00Z", "2026-12-01", "2026-12-31"],
  ])("calcula o mês completo e válido em %s", (instante, inicio, fim) => {
    expect(periodoRapidoBi("mes", new Date(instante), "America/Fortaleza")).toEqual({
      inicio,
      fim,
    });
  });
});
