// Regras do diagnóstico mensal: destino explícito, ausência de fallback e resumo honesto.
import { describe, expect, it } from "vitest";
import {
  resumirDiagnostico,
  vinculosDoMes,
  type TurmaDiagnosticoPlanilha,
} from "../../src/domain/planilha-diagnostico";

const antiga = { aba: "QA A", turmaOriginalId: "turma-a" };
const setembro = { ...antiga, aba: "QA A · Setembro", mes: "2026-09", destino: "setembro" };
const outubro = { ...antiga, aba: "QA A · Outubro", mes: "2026-10", destino: "outubro" };

describe("destinos do diagnóstico", () => {
  it("prioriza o mês selecionado e mantém o legado somente quando não há meses", () => {
    expect(vinculosDoMes([antiga, setembro, outubro], "turma-a", "2026-10")).toEqual([outubro]);
    expect(vinculosDoMes([antiga], "turma-a", "2026-10")).toEqual([antiga]);
  });

  it("não confunde outro mês com configuração pronta", () => {
    expect(vinculosDoMes([antiga, setembro], "turma-a", "2026-10")).toEqual([]);
    expect(vinculosDoMes([outubro], "turma-b", "2026-10")).toEqual([]);
  });

  it("mantém duplicidades visíveis para impedir escolha silenciosa de uma aba", () => {
    const duplicado = { ...outubro, aba: "QA A · Outubro duplicado" };
    expect(vinculosDoMes([outubro, duplicado], "turma-a", "2026-10")).toHaveLength(2);
  });

  it("separa estruturas prontas, ausências e falhas de conferência", () => {
    const turmas: TurmaDiagnosticoPlanilha[] = [
      "pronta",
      "sem_aba",
      "estrutura_alterada",
      "bloqueada",
      "indisponivel",
    ].map((situacao) => ({
      id: situacao,
      rotulo: situacao,
      tipo: "mensal",
      aba: "QA A",
      situacao: situacao as TurmaDiagnosticoPlanilha["situacao"],
      mensagem: null,
    }));
    expect(resumirDiagnostico(turmas)).toEqual({ total: 5, prontas: 1, semAba: 1, revisar: 3 });
    expect(resumirDiagnostico([])).toEqual({ total: 0, prontas: 0, semAba: 0, revisar: 0 });
  });
});
