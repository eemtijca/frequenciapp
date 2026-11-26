// Provas específicas: normalização, validação do cadastro e contagem das marcas de frequência.
import { describe, expect, it } from "vitest";
import {
  LIMITE_LOCAL_PROVA_ESPECIFICA,
  LIMITE_NOME_PROVA_ESPECIFICA,
  normalizarProvaEspecifica,
  problemaNaProvaEspecifica,
  resumirMarcas,
} from "@/domain/provas-especificas";

const valida = { nome: "Enem", local: "Escola Estadual Central", dia: "2026-11-08" };

describe("normalização da prova específica", () => {
  it("apara o nome e o local e guarda o local vazio como nulo", () => {
    expect(
      normalizarProvaEspecifica({ nome: "  Enem  ", local: "  Sala 4 ", dia: "2026-11-08" }),
    ).toEqual({
      nome: "Enem",
      local: "Sala 4",
      dia: "2026-11-08",
    });
    expect(
      normalizarProvaEspecifica({ nome: "Enem", local: "   ", dia: "2026-11-08" }).local,
    ).toBeNull();
    expect(normalizarProvaEspecifica({ nome: "Enem", dia: "2026-11-08" }).local).toBeNull();
  });
});

describe("validação da prova específica", () => {
  it("aceita data passada e domingo, como o Enem", () => {
    expect(problemaNaProvaEspecifica(valida)).toBeNull();
    // 2026-11-08 é domingo; 2020-01-01 já passou.
    expect(problemaNaProvaEspecifica({ ...valida, dia: "2020-01-01" })).toBeNull();
    expect(problemaNaProvaEspecifica({ ...valida, local: null })).toBeNull();
  });

  it("recusa nome vazio, nome e local longos e data inexistente", () => {
    expect(problemaNaProvaEspecifica({ ...valida, nome: "" })).toBe("Informe o nome da prova.");
    expect(
      problemaNaProvaEspecifica({ ...valida, nome: "a".repeat(LIMITE_NOME_PROVA_ESPECIFICA + 1) }),
    ).toBe(`O nome deve ter no máximo ${LIMITE_NOME_PROVA_ESPECIFICA} caracteres.`);
    expect(
      problemaNaProvaEspecifica({
        ...valida,
        local: "a".repeat(LIMITE_LOCAL_PROVA_ESPECIFICA + 1),
      }),
    ).toBe(`O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`);
    expect(problemaNaProvaEspecifica({ ...valida, dia: "2026-02-30" })).toBe(
      "Data da prova inválida.",
    );
  });
});

describe("contagem das marcas", () => {
  it("separa presentes, ausentes e pendentes", () => {
    expect(resumirMarcas([true, true, false, null, null, null])).toEqual({
      total: 6,
      presentes: 2,
      ausentes: 1,
      pendentes: 3,
    });
  });

  it("devolve zeros para uma lista vazia", () => {
    expect(resumirMarcas([])).toEqual({ total: 0, presentes: 0, ausentes: 0, pendentes: 0 });
  });
});
