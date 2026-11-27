// Provas específicas: normalização, validação do cadastro e contagem das marcas de frequência.
import { describe, expect, it } from "vitest";
import {
  comMarca,
  LIMITE_LOCAL_PROVA_ESPECIFICA,
  LIMITE_NOME_PROVA_ESPECIFICA,
  normalizarProvaEspecifica,
  problemaNaProvaEspecifica,
  resumirMarcas,
  type DetalheDaProva,
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

describe("marca de um participante", () => {
  const detalhe: DetalheDaProva = {
    prova: {
      id: "prova-1",
      nome: "Enem",
      local: "Escola Central",
      dia: "2026-11-08",
      total: 2,
      presentes: 0,
      ausentes: 0,
    },
    participantes: [
      { alunoId: "aluno-1", nome: "Ana", turmaId: "turma-1", presente: null },
      { alunoId: "aluno-2", nome: "Bruno", turmaId: "turma-1", presente: null },
    ],
  };

  it("marca só o aluno escolhido e recalcula os contadores", () => {
    const marcado = comMarca(detalhe, "aluno-1", true);
    expect(marcado.participantes).toEqual([
      { alunoId: "aluno-1", nome: "Ana", turmaId: "turma-1", presente: true },
      { alunoId: "aluno-2", nome: "Bruno", turmaId: "turma-1", presente: null },
    ]);
    expect(marcado.prova).toMatchObject({ total: 2, presentes: 1, ausentes: 0 });
  });

  it("limpa e troca a marca sem mexer no outro aluno", () => {
    const ausente = comMarca(detalhe, "aluno-1", false);
    const limpo = comMarca(ausente, "aluno-1", null);
    expect(limpo.participantes[0]?.presente).toBeNull();
    expect(limpo.participantes[1]?.presente).toBeNull();
    expect(limpo.prova).toMatchObject({ presentes: 0, ausentes: 0 });
  });
});
