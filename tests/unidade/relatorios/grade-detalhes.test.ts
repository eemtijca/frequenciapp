// Detalhe da classificação do dia: F, FJ, S, P, contagens de aulas e
// justificativas, preservando a marca histórica de marcaDoAluno.
import { describe, expect, it } from "vitest";
import {
  classificarDiaDoAluno,
  marcaDoAluno,
  type Aluno,
  type Frequencia,
  type Horario,
} from "@/domain/frequencia";

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "aluno-1",
    nome: parcial.nome ?? "Aluno Um",
    turmaId: parcial.turmaId ?? "turma-a",
    turmaOriginalId: parcial.turmaOriginalId ?? "turma-a",
    ordem: parcial.ordem ?? 1,
    ativo: parcial.ativo ?? true,
    desistenteEm: parcial.desistenteEm ?? null,
  };
}

function frequencia(parcial: Partial<Frequencia> = {}): Frequencia {
  return {
    dia: parcial.dia ?? "2026-09-10",
    turmaId: parcial.turmaId ?? "turma-a",
    revisao: parcial.revisao ?? 1,
    atualizadoEm: parcial.atualizadoEm ?? "2026-09-10T12:00:00Z",
    atualizadoPorNome: parcial.atualizadoPorNome ?? null,
    faltas: parcial.faltas ?? [],
    ...(parcial.alunos ? { alunos: parcial.alunos } : {}),
    ...(parcial.aulas ? { aulas: parcial.aulas } : {}),
  };
}

function horario(parcial: Partial<Horario> = {}): Horario {
  return {
    id: parcial.id ?? "aula-1",
    turmaId: parcial.turmaId ?? "turma-a",
    ordem: parcial.ordem ?? 1,
    inicio: parcial.inicio ?? "07:00",
    fim: parcial.fim ?? "07:50",
    diasSemana: parcial.diasSemana ?? [1, 2, 3, 4, 5],
    ativo: parcial.ativo ?? true,
  };
}

const dia = "2026-09-10";

function classificar(entrada: {
  faltas?: Frequencia["faltas"];
  alunos?: string[];
  aulas?: string[];
  horarios?: Horario[];
  estudante?: Partial<Aluno>;
  turmaId?: string;
}) {
  const estudante = aluno(entrada.estudante);
  const chamada = frequencia({
    turmaId: entrada.turmaId ?? "turma-a",
    faltas: entrada.faltas ?? [],
    ...(entrada.alunos ? { alunos: entrada.alunos } : {}),
    ...(entrada.aulas ? { aulas: entrada.aulas } : {}),
  });
  return classificarDiaDoAluno(
    estudante,
    dia,
    [chamada],
    entrada.horarios ?? [
      horario({ id: "aula-1" }),
      horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
      horario({ id: "aula-3", ordem: 3, inicio: "08:40", fim: "09:30" }),
    ],
  );
}

describe("classificarDiaDoAluno", () => {
  it("classifica presença em parte das aulas com retrato", () => {
    const detalhe = classificar({
      alunos: ["aluno-1"],
      aulas: ["aula-1", "aula-2", "aula-3"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
    });
    expect(detalhe).toMatchObject({
      marca: "S",
      aulasPrevistas: 3,
      aulasFaltadas: 1,
      aulasFaltadasIds: ["aula-1"],
      referenciaAulas: "retrato",
    });
    expect(
      marcaDoAluno(
        aluno(),
        dia,
        [
          frequencia({
            alunos: ["aluno-1"],
            aulas: ["aula-1", "aula-2", "aula-3"],
            faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
          }),
        ],
        [],
      ),
    ).toBe("S");
  });

  it("classifica falta integral, justificada e com justificativa parcial", () => {
    const integral = classificar({
      alunos: ["aluno-1"],
      aulas: ["aula-1", "aula-2", "aula-3"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-1", "aula-2", "aula-3"] }],
    });
    expect(integral).toMatchObject({
      marca: "F",
      aulasPrevistas: 3,
      aulasFaltadas: 3,
      referenciaAulas: "retrato",
    });

    const justificada = classificar({
      alunos: ["aluno-1"],
      aulas: ["aula-1", "aula-2"],
      faltas: [
        {
          alunoId: "aluno-1",
          horarios: ["aula-1", "aula-2"],
          justificativa: "D",
        },
      ],
    });
    expect(justificada).toMatchObject({
      marca: "FJ",
      justificativas: ["D"],
      aulasFaltadas: 2,
    });

    const mista = classificar({
      alunos: ["aluno-1"],
      aulas: ["aula-1", "aula-2"],
      faltas: [
        { alunoId: "aluno-1", horarios: ["aula-1"], justificativa: "D" },
        { alunoId: "aluno-1", horarios: ["aula-2"] },
      ],
    });
    expect(mista).toMatchObject({
      marca: "F",
      justificativas: ["D"],
      aulasFaltadas: 2,
    });
  });

  it("usa a grade atual quando não há retrato", () => {
    const detalhe = classificar({
      alunos: ["aluno-1"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
    });
    expect(detalhe).toMatchObject({
      marca: "S",
      aulasPrevistas: 3,
      aulasFaltadas: 1,
      referenciaAulas: "grade_atual",
    });
  });

  it("preserva falta fora do retrato sem inventar cobertura", () => {
    const detalhe = classificar({
      alunos: ["aluno-1"],
      aulas: ["aula-1", "aula-2"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-9"] }],
    });
    expect(detalhe).toMatchObject({
      marca: "F",
      aulasPrevistas: 2,
      aulasFaltadas: 1,
      aulasFaltadasIds: ["aula-9"],
      referenciaAulas: "retrato",
    });
  });

  it("devolve P quando há chamada sem faltas e null sem chamada", () => {
    const presente = classificar({ alunos: ["aluno-1"] });
    expect(presente).toMatchObject({
      marca: "P",
      aulasFaltadas: 0,
      aulasFaltadasIds: [],
    });
    const semChamada = classificarDiaDoAluno(aluno(), dia, [], []);
    expect(semChamada.marca).toBeNull();
    expect(semChamada.referenciaAulas).toBe("indisponivel");
  });

  it("não classifica aluno desistente no dia", () => {
    const detalhe = classificar({
      estudante: { desistenteEm: dia },
      alunos: ["aluno-1"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
    });
    expect(detalhe).toMatchObject({
      marca: null,
      aulasFaltadas: 0,
      referenciaAulas: "indisponivel",
    });
  });

  it("usa a lista histórica quando o aluno foi remanejado", () => {
    const detalhe = classificar({
      estudante: { turmaId: "turma-b" },
      turmaId: "turma-a",
      alunos: ["aluno-1"],
      aulas: ["aula-1"],
      faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
    });
    expect(detalhe).toMatchObject({
      marca: "F",
      referenciaAulas: "retrato",
    });
  });
});
