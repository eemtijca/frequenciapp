import { describe, expect, it } from "vitest";
import { diasElegiveis, mesDaFixture } from "../../ponta-a-ponta/helpers/fixture-fluidez";

describe("datas históricas das fixtures", () => {
  it.each(["2026", "2026-00", "2026-13", "2026-2", "2026-02-extra", "abcd-02"])(
    "rejeita mês inválido %s",
    (mes) => {
      expect(() => diasElegiveis(mes, [], 1)).toThrow("Mês inválido");
    },
  );

  it("não converte anos anteriores a 100 para o século XX", () => {
    expect(diasElegiveis("0099-02", [], 1)).toEqual(["0099-02-02"]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejeita quantidade inválida %s",
    (quantidade) => {
      expect(() => diasElegiveis("2026-02", [], quantidade)).toThrow("Quantidade inválida");
    },
  );

  it("retorna uma lista vazia quando não há dias solicitados", () => {
    expect(diasElegiveis("2026-02", [], 0)).toEqual([]);
  });

  it("escolhe dois dias que não sejam domingo nem feriado", () => {
    expect(diasElegiveis("2026-02", ["2026-02-02", "2026-02-04"], 2)).toEqual([
      "2026-02-03",
      "2026-02-05",
    ]);
  });

  it("falha quando não há dias suficientes, sem inventar datas", () => {
    expect(() => diasElegiveis("2026-02", [], 25)).toThrow(
      "Não há 25 dias escolares disponíveis em 2026-02.",
    );
  });

  it("inclui o dia bissexto quando os anteriores estão indisponíveis", () => {
    const feriados = Array.from(
      { length: 28 },
      (_, i) => `2024-02-${String(i + 1).padStart(2, "0")}`,
    );
    expect(diasElegiveis("2024-02", feriados, 1)).toEqual(["2024-02-29"]);
  });

  it.each([
    ["2027-01-01T01:30:00Z", "America/Fortaleza", "2026-10"],
    ["2026-12-31T23:30:00Z", "Pacific/Kiritimati", "2026-11"],
    ["2027-01-01T00:30:00Z", "Etc/GMT+12", "2026-10"],
    ["2027-01-01T00:30:00Z", "-14:00", "2026-10"],
    ["2026-12-31T23:30:00Z", "+14:00", "2026-11"],
  ])("usa um mês histórico seguro em %s (%s)", (instante, fuso, esperado) => {
    expect(mesDaFixture(new Date(instante), fuso)).toBe(esperado);
  });
});
