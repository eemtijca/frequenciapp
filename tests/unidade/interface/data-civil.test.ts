// Dia civil: ida e volta por componentes locais, meio-dia local e formatação
// em pt-BR, sem conversão UTC que desloca a data.
import { describe, expect, it } from "vitest";
import { deDiaCivil, formatarDiaCivil, formatarMesCivil, paraDiaCivil } from "@/lib/data-civil";

describe("dia civil", () => {
  it("converte datas locais em AAAA-MM-DD sem passar por UTC", () => {
    expect(paraDiaCivil(new Date(2026, 8, 1, 0, 0))).toBe("2026-09-01");
    expect(paraDiaCivil(new Date(2026, 8, 1, 23, 59, 59))).toBe("2026-09-01");
    expect(paraDiaCivil(new Date(2026, 0, 1, 0, 15))).toBe("2026-01-01");
  });

  it("devolve nulo para data ausente ou inválida", () => {
    expect(paraDiaCivil(null)).toBeNull();
    expect(paraDiaCivil(new Date(Number.NaN))).toBeNull();
  });

  it("converte o dia civil ao meio-dia local", () => {
    const data = deDiaCivil("2026-09-01");
    expect(data).not.toBeNull();
    expect(data?.getFullYear()).toBe(2026);
    expect(data?.getMonth()).toBe(8);
    expect(data?.getDate()).toBe(1);
    expect(data?.getHours()).toBe(12);
    expect(data?.getMinutes()).toBe(0);
  });

  it("faz a ida e a volta preservando o dia", () => {
    const original = new Date(2026, 2, 15, 23, 30);
    const civil = paraDiaCivil(original);
    expect(civil).toBe("2026-03-15");
    expect(paraDiaCivil(deDiaCivil(civil ?? ""))).toBe("2026-03-15");
  });

  it("aceita 29 de fevereiro em ano bissexto e recusa datas inexistentes", () => {
    expect(paraDiaCivil(deDiaCivil("2024-02-29"))).toBe("2024-02-29");
    expect(deDiaCivil("2026-02-29")).toBeNull();
    expect(deDiaCivil("2026-13-01")).toBeNull();
    expect(deDiaCivil("2026-04-31")).toBeNull();
    expect(deDiaCivil("2026-00-10")).toBeNull();
    expect(deDiaCivil("2026-9-1")).toBeNull();
    expect(deDiaCivil("")).toBeNull();
  });

  it("formata dia e mês civis em pt-BR", () => {
    expect(formatarDiaCivil("2026-09-01")).toBe("01/09/2026");
    expect(formatarDiaCivil("2026-02-29")).toBe("");
    expect(formatarMesCivil("2026-09")).toBe("09/2026");
    expect(formatarMesCivil("2026-13")).toBe("");
    expect(formatarMesCivil("2026-9")).toBe("");
  });
});
