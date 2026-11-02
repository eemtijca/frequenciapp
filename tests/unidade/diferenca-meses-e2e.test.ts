import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diaDaSemanaIso,
  diaDeChamadaVizinho,
  diaLocal,
  diaSeguinte,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { feriadoNaData } from "@/domain/calendario-letivo";
import { diaCorrente, diaDeChamada, diferencaEmMeses } from "../ponta-a-ponta/helpers/dia";

describe("datas da navegação E2E pela semana", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ["2026-11-02T12:00:00Z", "2026-11-02", "2026-11-01", "2026-10-31"],
    ["2024-01-01T12:00:00Z", "2024-01-01", "2023-12-31", "2023-12-30"],
    ["2048-03-02T12:00:00Z", "2048-03-02", "2048-03-01", "2048-02-29"],
  ])("percorre segunda %s, domingo e sábado nas viradas", (instante, segunda, domingo, sabado) => {
    vi.useFakeTimers();
    vi.stubEnv("TZ_APP", "America/Fortaleza");
    vi.setSystemTime(new Date(instante));
    expect(diaDeChamada()).toBe(segunda);
    expect(diaDaSemanaIso(segunda)).toBe(1);
    expect(diaSeguinte(segunda, -1)).toBe(domingo);
    expect(diaDaSemanaIso(domingo)).toBe(7);
    expect(diaSeguinte(domingo, -1)).toBe(sabado);
    expect(diaDaSemanaIso(sabado)).toBe(6);
  });

  it("no domingo corrente usa o sábado como dia de chamada e calcula a sexta", () => {
    vi.useFakeTimers();
    vi.stubEnv("TZ_APP", "America/Fortaleza");
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    expect(diaCorrente()).toBe("2026-11-01");
    expect(diaDeChamada()).toBe("2026-10-31");
    expect(diaSeguinte(diaDeChamada(), -1)).toBe("2026-10-30");
  });

  it("usa a data civil da escola, mesmo quando UTC já mudou de dia", () => {
    vi.useFakeTimers();
    vi.stubEnv("TZ_APP", "America/Fortaleza");
    vi.setSystemTime(new Date("2026-11-02T02:30:00Z"));
    expect(diaCorrente()).toBe("2026-11-01");
    expect(diaDeChamada()).toBe("2026-10-31");
  });

  it("reconhece um sábado feriado sintético sem presumir dia letivo", () => {
    const feriados = [{ dia: "2026-10-31", nome: "Feriado sintético" }];
    const sabado = diaSeguinte("2026-11-01", -1);
    expect(feriadoNaData(feriados, sabado)?.nome).toBe("Feriado sintético");
    expect(feriadoNaData(feriados, diaSeguinte(sabado, -1))).toBeNull();
  });
});

describe("diferença entre meses para navegação E2E", () => {
  it("encontra o dia de chamada anterior em segunda, domingo e viradas", () => {
    const anterior = (hoje: string) => diaDeChamadaVizinho(ultimoDiaDeChamada(hoje), -1);
    expect(anterior("2026-11-02")).toBe("2026-10-31");
    expect(anterior("2026-11-01")).toBe("2026-10-30");
    expect(anterior("2027-01-01")).toBe("2026-12-31");
    expect(anterior("2048-03-02")).toBe("2048-02-29");
    expect(anterior("2026-11-03")).toBe("2026-11-02");
  });

  it("navega de novembro a setembro quando domingo dia 1 recua a chamada para outubro", () => {
    expect(ultimoDiaDeChamada("2026-11-01")).toBe("2026-10-31");
    expect(diferencaEmMeses("2026-11", "2026-09")).toBe(-2);
    expect(diferencaEmMeses("2026-11", "2026-10")).toBe(-1);
  });

  it("atravessa o ano nos dois sentidos", () => {
    expect(diferencaEmMeses("2027-01", "2026-12")).toBe(-1);
    expect(diferencaEmMeses("2026-12", "2027-02")).toBe(2);
  });

  it("não navega no mesmo mês e navega só uma vez no dia útil comum", () => {
    expect(ultimoDiaDeChamada("2026-11-03")).toBe("2026-11-03");
    expect(diferencaEmMeses("2026-11", "2026-11")).toBe(0);
    expect(diferencaEmMeses("2026-11", "2026-10")).toBe(-1);
  });

  it("respeita o sábado 29 de fevereiro no ano bissexto", () => {
    expect(ultimoDiaDeChamada("2048-03-01")).toBe("2048-02-29");
    expect(diferencaEmMeses("2048-03", "2048-02")).toBe(-1);
    expect(diferencaEmMeses("2048-03", "2048-01")).toBe(-2);
  });

  it("usa a data civil da escola quando o instante cruza a virada em UTC", () => {
    const instante = new Date("2027-01-01T02:30:00Z");
    const escola = diaLocal(instante, "America/Fortaleza");
    expect(escola).toBe("2026-12-31");
    expect(diaLocal(instante, "UTC")).toBe("2027-01-01");
    expect(diferencaEmMeses("2027-01", escola.slice(0, 7))).toBe(-1);
  });

  it("rejeita meses inválidos", () => {
    expect(() => diferencaEmMeses("2026-13", "2026-01")).toThrow("Mês inválido");
    expect(() => diferencaEmMeses("2026-01", "2026-2")).toThrow("Mês inválido");
    expect(() => diferencaEmMeses("0000-01", "2026-01")).toThrow("Mês inválido");
    expect(() => diferencaEmMeses("2026-01", "0000-01")).toThrow("Mês inválido");
  });
});
