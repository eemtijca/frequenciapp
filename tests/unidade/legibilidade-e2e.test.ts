import { describe, expect, it } from "vitest";
import {
  expectativaDoSeletor,
  nomeDoDialogoDaChamada,
  primeiraNavegacao,
} from "../ponta-a-ponta/helpers/legibilidade";

describe("expectativas do seletor E2E", () => {
  it("espera o diálogo do resumo para o domingo", () => {
    expect(nomeDoDialogoDaChamada("2026-11-01")).toBe("Resumo da semana");
  });
  it("espera o diálogo da chamada para o sábado após sair do resumo", () => {
    expect(nomeDoDialogoDaChamada("2026-10-31")).toBe("Data da chamada");
  });
  it("no domingo sai do resumo para sábado antes de avançar para sexta e voltar", () => {
    expect(primeiraNavegacao("2026-11-01")).toEqual({
      inicial: "2026-11-01",
      aposSair: "2026-10-31",
      anterior: "2026-10-30",
    });
  });
  it("exige o nome correto do dia e Hoje apenas no dia corrente", () => {
    expect(expectativaDoSeletor("2026-11-02", "2026-11-02")).toEqual({
      aria: "Data da chamada: 02/11/2026, segunda-feira, Hoje",
      detalhe: "segunda",
      sigla: "seg.",
      rotulo: "02/11/2026",
    });
    expect(expectativaDoSeletor("2026-10-31", "2026-11-01").aria).toBe(
      "Data da chamada: 31/10/2026, sábado",
    );
  });
  it.each([
    ["2026-11-02", "segunda-feira", "segunda", "seg."],
    ["2026-11-03", "terça-feira", "terça", "ter."],
    ["2026-11-04", "quarta-feira", "quarta", "qua."],
    ["2026-11-05", "quinta-feira", "quinta", "qui."],
    ["2026-11-06", "sexta-feira", "sexta", "sex."],
    ["2026-11-07", "sábado", "sábado", "sáb."],
  ])("preserva o dia completo e a sigla de %s", (dia, nome, detalhe, sigla) => {
    const esperado = expectativaDoSeletor(dia, "2026-11-08");
    expect(esperado.aria).toBe(`Data da chamada: ${esperado.rotulo}, ${nome}`);
    expect(esperado.detalhe).toBe(detalhe);
    expect(esperado.sigla).toBe(sigla);
  });

  it("representa domingo somente como resumo sem selo ou dia da semana", () => {
    expect(expectativaDoSeletor("2026-11-01", "2026-11-01")).toEqual({
      aria: "Resumo da semana: 26/10 a 31/10",
      detalhe: "semana",
      sigla: null,
      rotulo: "26/10 a 31/10",
    });
  });
});
