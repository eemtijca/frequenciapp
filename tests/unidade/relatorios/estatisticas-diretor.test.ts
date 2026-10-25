// Estatísticas do diretor de turma: denominador nos dias com chamada, semana
// com feriado, limite de risco e categorias que escondem F e FJ ou as saídas.
import { describe, expect, it } from "vitest";
import { diasEntre, montarGrade, type Aluno, type Frequencia } from "@/domain/frequencia";
import { estatisticasDaGrade, inicioDaSemana } from "@/domain/estatisticas-diretor";

function aluno(id: string, nome: string, turmaId = "turma-a"): Aluno {
  return { id, nome, turmaId, turmaOriginalId: "turma-a", ordem: 1, ativo: true };
}

function chamada(dia: string, faltas: Frequencia["faltas"] = []): Frequencia {
  return {
    dia,
    turmaId: "turma-a",
    revisao: 1,
    atualizadoEm: `${dia}T12:00:00Z`,
    atualizadoPorNome: null,
    faltas,
  };
}

// Setembro de 2026: segunda 07 é feriado (sem chamada); chamada de 08 a 11 e
// na segunda 14. O aluno C mudou para a turma B, que não fez chamada.
const alunos = [aluno("a", "Ana Clara"), aluno("b", "Bruno Lima"), aluno("c", "Caio Reis", "b")];
const frequencias = [
  chamada("2026-09-08", [{ alunoId: "a", horarios: ["aula-1"] }]),
  chamada("2026-09-09", [{ alunoId: "a", horarios: ["aula-1"], justificativa: "D" }]),
  chamada("2026-09-10"),
  chamada("2026-09-11"),
  chamada("2026-09-14"),
];
const grade = montarGrade(alunos, frequencias, diasEntre("2026-09-07", "2026-09-15"));

describe("inicioDaSemana", () => {
  it("devolve a segunda-feira da semana, inclusive no domingo", () => {
    expect(inicioDaSemana("2026-09-07")).toBe("2026-09-07");
    expect(inicioDaSemana("2026-09-11")).toBe("2026-09-07");
    expect(inicioDaSemana("2026-09-13")).toBe("2026-09-07");
  });
});

describe("estatisticasDaGrade", () => {
  const completas = estatisticasDaGrade(grade, {
    limiteRiscoPercentual: 25,
    categorias: ["faltas", "justificativas", "saidas"],
    saidasPorAluno: new Map([["b", 2]]),
  });

  it("usa os dias com chamada da turma atual como denominador", () => {
    const ana = completas.alunos.find((item) => item.alunoId === "a");
    expect(ana).toMatchObject({ ausencias: 2, diasComChamada: 5, faltas: 1, justificadas: 1 });
    expect(ana?.taxa).toBeCloseTo(0.4);
    const caio = completas.alunos.find((item) => item.alunoId === "c");
    expect(caio).toMatchObject({ ausencias: 0, diasComChamada: 0, taxa: 0, emRisco: false });
  });

  it("marca risco a partir do limite e ordena pela taxa", () => {
    expect(completas.alunos.map((item) => item.alunoId)).toEqual(["a", "b", "c"]);
    expect(completas.alunos.map((item) => item.emRisco)).toEqual([true, false, false]);
    const noLimite = estatisticasDaGrade(grade, {
      limiteRiscoPercentual: 40,
      categorias: ["faltas"],
    });
    expect(noLimite.alunos[0]?.emRisco).toBe(true);
    const acima = estatisticasDaGrade(grade, { limiteRiscoPercentual: 41, categorias: ["faltas"] });
    expect(acima.resumo.emRisco).toBe(0);
  });

  it("agrega por semana sem contar o feriado sem chamada", () => {
    expect(completas.semanas).toEqual([
      {
        inicio: "2026-09-07",
        ausencias: 2,
        faltas: 1,
        justificadas: 1,
        alunoDias: 8,
        taxa: 0.25,
      },
      { inicio: "2026-09-14", ausencias: 0, faltas: 0, justificadas: 0, alunoDias: 2, taxa: 0 },
    ]);
    expect(completas.resumo).toEqual({
      alunos: 3,
      emRisco: 1,
      ausencias: 2,
      alunoDias: 10,
      taxa: 0.2,
    });
  });

  it("conta saídas só quando liberadas", () => {
    expect(completas.alunos.map((item) => item.saidas)).toEqual([0, 2, 0]);
  });

  it("esconde a separação F e FJ e as saídas fora das categorias", () => {
    const restritas = estatisticasDaGrade(grade, {
      limiteRiscoPercentual: 25,
      categorias: ["faltas"],
      saidasPorAluno: new Map([["b", 2]]),
    });
    for (const item of restritas.alunos) {
      expect(item.faltas).toBeNull();
      expect(item.justificadas).toBeNull();
      expect(item.saidas).toBeNull();
    }
    expect(restritas.semanas[0]).toMatchObject({ ausencias: 2, faltas: null, justificadas: null });
    expect(restritas.categorias).toEqual(["faltas"]);
  });
});
