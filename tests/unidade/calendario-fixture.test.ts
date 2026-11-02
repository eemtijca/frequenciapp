import { diaLocal, diaSeguinte, diasEntre } from "@/domain/frequencia";
import { describe, expect, it } from "vitest";
import {
  diasUteisDaFixture,
  diaHistoricoDaFixture,
  procurarDia,
} from "../helpers/calendario-fixture";

describe("seleção de datas da fixture", () => {
  it("mantém setembro de 2026 quando passado e usa mês anterior nos demais casos", () => {
    expect(diaHistoricoDaFixture("2026-11", [])).toBe("2026-09-30");
    expect(diaHistoricoDaFixture("2026-10", [])).toBe("2026-09-30");
    expect(diaHistoricoDaFixture("2027-01", ["2026-09-30"])).toBe("2026-09-29");
    expect(diaHistoricoDaFixture("2026-09", [])).toBe("2026-08-31");
    expect(diaHistoricoDaFixture("2026-01", [])).toBe("2025-12-31");
    expect(diaHistoricoDaFixture("2024-03", [])).toBe("2024-02-29");
    expect(() => diaHistoricoDaFixture("2024-03", diasEntre("2024-02-01", "2024-02-29"))).toThrow(
      /Nenhum dia útil/,
    );
  });
  it("recua do feriado de 1º de maio até um dia útil livre", () => {
    expect(procurarDia("2026-05-01", -1, [1, 2, 3, 4, 5], ["2026-05-01"], 10)).toBe("2026-04-30");
  });
  it("escolhe sábado com sexta e sábado anterior livres", () => {
    expect(procurarDia("2026-07-11", -1, [6], ["2026-07-10", "2026-06-27"], 60, [0, -1, -7])).toBe(
      "2026-06-20",
    );
  });
  it("exclui o primeiro dia útil feriado dos cabeçalhos da planilha", () => {
    const dias = diasUteisDaFixture("2026-05", ["2026-05-01", "2026-05-04"]);
    expect(dias[0]).toBe("2026-05-05");
    expect(dias).not.toContain("2026-05-01");
  });
  it("contorna domingo e feriado de ano novo", () => {
    expect(procurarDia("2027-01-01", 1, [1, 2, 3, 4, 5], ["2027-01-01"], 7)).toBe("2027-01-04");
    expect(procurarDia("2026-05-03", -1, [1, 2, 3, 4, 5], ["2026-05-01"], 7)).toBe("2026-04-30");
  });
  it("salta um sábado feriado e preserva o dia da semana", () => {
    expect(procurarDia("2026-07-11", -1, [6], ["2026-07-11"], 14)).toBe("2026-07-04");
  });
  it("atravessa fevereiro bissexto e a virada do ano civil", () => {
    expect(procurarDia("2024-03-01", -1, [1, 2, 3, 4, 5], ["2024-03-01"], 5)).toBe("2024-02-29");
    expect(procurarDia("2027-01-01", -1, [1, 2, 3, 4, 5], ["2027-01-01"], 5)).toBe("2026-12-31");
  });
  it("procura em períodos longos e falha ao atingir o limite inclusivo", () => {
    const bloqueados = diasEntre("2026-01-01", "2026-05-01");
    expect(procurarDia("2026-05-01", -1, [1, 2, 3, 4, 5], bloqueados, 130)).toBe("2025-12-31");
    expect(() => procurarDia("2026-05-01", -1, [1, 2, 3, 4, 5], bloqueados, 120)).toThrow(
      /Nenhuma data disponível/,
    );
    expect(procurarDia("2026-05-01", -1, [1, 2, 3, 4, 5], ["2026-05-01"], 1)).toBe("2026-04-30");
  });
  it("usa o dia no fuso da aplicação, não o dia UTC do processo", () => {
    const instante = new Date("2027-01-01T01:30:00Z");
    const fortaleza = diaLocal(instante, "America/Fortaleza");
    const toquio = diaLocal(instante, "Asia/Tokyo");
    expect(fortaleza).toBe("2026-12-31");
    expect(toquio).toBe("2027-01-01");
    expect(procurarDia(toquio, -1, [1, 2, 3, 4, 5], [toquio], 5)).toBe(fortaleza);
  });
  it("acha uma semana futura sem feriados e mantém o feriado sintético em quarta-feira", () => {
    const feriados = ["2027-01-01", "2027-01-06", "2027-01-11"];
    const futuro = procurarDia("2026-12-30", 1, [1], feriados, 325, [0, 1, 2, 3, 4, 5, 6]);
    expect(futuro).toBe("2027-01-18");
    expect(diaSeguinte(futuro, 2)).toBe("2027-01-20");
  });
  it("contempla mês que começa no domingo e fevereiro bissexto", () => {
    const maio = diasUteisDaFixture("2022-05", ["2022-05-02"]);
    expect(maio[0]).toBe("2022-05-03");
    expect(diasUteisDaFixture("2024-02", []).at(-1)).toBe("2024-02-29");
  });
  it("permite feriado alheio na janela, preservando livres o início e o novo feriado", () => {
    const feriados = ["2027-01-07"];
    const inicio = procurarDia("2027-01-04", 1, [1], feriados, 325, [0, 2]);
    expect(inicio).toBe("2027-01-04");
    expect(diaSeguinte(inicio, 2)).toBe("2027-01-06");
    expect(diasEntre(inicio, diaSeguinte(inicio, 6))).toContain("2027-01-07");
  });
});
