// Modelo do relatório da Grade: totais, ocorrências, justificativas,
// referência de aulas e nome do PDF.
import { describe, expect, it } from "vitest";
import {
  montarGrade,
  type Aluno,
  type Frequencia,
  type Horario,
  type Turma,
} from "@/domain/frequencia";
import {
  montarOcorrenciasDoAluno,
  montarRelatorioGrade,
  nomeArquivoRelatorioPdf,
} from "@/domain/relatorio-grade";

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "aluno-a",
    nome: parcial.nome ?? "Aluno A",
    turmaId: parcial.turmaId ?? "turma-b",
    turmaOriginalId: parcial.turmaOriginalId ?? "turma-a",
    ordem: parcial.ordem ?? 1,
    ativo: parcial.ativo ?? true,
    desistenteEm: parcial.desistenteEm ?? null,
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

function turma(parcial: Partial<Turma> = {}): Turma {
  return {
    id: parcial.id ?? "turma-a",
    serieId: parcial.serieId ?? "serie-1",
    nome: parcial.nome ?? "A",
    rotulo: parcial.rotulo ?? "1º ano A",
    serieNome: parcial.serieNome ?? "1º ano",
    horarios: parcial.horarios ?? [horario()],
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

const dias = ["2026-09-10", "2026-09-11"];
const aulas = ["aula-1", "aula-2", "aula-3"];
const horarios = [
  horario({ id: "aula-1", ordem: 1 }),
  horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
  horario({ id: "aula-3", ordem: 3, inicio: "08:40", fim: "09:30" }),
];
const turmas = [turma(), turma({ id: "turma-b", nome: "B", rotulo: "1º ano B" })];
const alunos = [
  aluno({ id: "aluno-a", nome: "Aluno A" }),
  aluno({ id: "aluno-b", nome: "Aluno B", turmaId: "turma-a" }),
  aluno({
    id: "aluno-c",
    nome: "Aluno C",
    ordem: 3,
    desistenteEm: "2026-09-11",
  }),
];
const frequencias = [
  frequencia({
    dia: "2026-09-10",
    turmaId: "turma-a",
    alunos: ["aluno-a", "aluno-b", "aluno-c"],
    aulas,
    faltas: [
      {
        alunoId: "aluno-a",
        horarios: ["aula-1", "aula-2", "aula-3"],
        justificativa: "D",
      },
      {
        alunoId: "aluno-b",
        horarios: ["aula-1", "aula-2", "aula-3"],
      },
    ],
  }),
  frequencia({
    dia: "2026-09-11",
    turmaId: "turma-a",
    alunos: ["aluno-a", "aluno-b", "aluno-c"],
    aulas,
    faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }],
  }),
];

const grade = montarGrade(alunos, frequencias, dias, horarios);
const justificativas = [
  { codigo: "D", rotulo: "Doente" },
  { codigo: "C", rotulo: "Consulta" },
];

describe("montarRelatorioGrade", () => {
  it("reúne totais do período, histórico e ocorrências", () => {
    const relatorio = montarRelatorioGrade({
      turmaOriginalId: "turma-a",
      turmaOriginal: "1º ano A",
      turmas,
      dias,
      linhas: grade.linhas,
      frequencias,
      horarios,
      resumo: {
        primeiroDia: "2026-09-01",
        diasLetivos: 2,
        porAluno: [{ alunoId: "aluno-a", faltas: 5, faltasJustificadas: 2, diasComRegistro: 7 }],
      },
      justificativas,
      justificativasPorAlunoDia: new Map([["aluno-a:2026-09-11", ["C", "D"]]]),
    });

    expect(relatorio.turmaOriginal).toBe("1º ano A");
    expect(relatorio.de).toBe("2026-09-10");
    expect(relatorio.ate).toBe("2026-09-11");
    expect(relatorio.totais).toEqual({ alunos: 3, faltas: 1, justificadas: 1, parciais: 1 });

    const a = relatorio.alunos.find((item) => item.alunoId === "aluno-a");
    expect(a).toMatchObject({
      nome: "Aluno A",
      turmaAtual: "1º ano B",
      faltas: 0,
      justificadas: 1,
      parciais: 1,
      diasComRegistro: 2,
      totalHistorico: 7,
    });
    expect(a?.ocorrencias).toEqual([
      {
        dia: "2026-09-10",
        marca: "FJ",
        aulasPrevistas: 3,
        aulasFaltadas: 3,
        aulasFaltadasRotulos: [
          "1ª aula · 07:00 às 07:50",
          "2ª aula · 07:50 às 08:40",
          "3ª aula · 08:40 às 09:30",
        ],
        justificativas: ["Doente"],
        referenciaAulas: "retrato",
      },
      {
        dia: "2026-09-11",
        marca: "S",
        aulasPrevistas: 3,
        aulasFaltadas: 1,
        aulasFaltadasRotulos: ["1ª aula · 07:00 às 07:50"],
        justificativas: ["Consulta", "Doente"],
        referenciaAulas: "retrato",
      },
    ]);

    const b = relatorio.alunos.find((item) => item.alunoId === "aluno-b");
    expect(b).toMatchObject({ faltas: 1, justificadas: 0, parciais: 0, totalHistorico: 0 });

    const c = relatorio.alunos.find((item) => item.alunoId === "aluno-c");
    expect(c).toMatchObject({ desistente: true, faltas: 0, parciais: 0 });
  });

  it("trata aluno sem faltas e retrato sem referência", () => {
    const semFaltas = aluno({ id: "aluno-d", nome: "Aluno D", turmaId: "turma-a" });
    const gradeSemFaltas = montarGrade([semFaltas], [], dias, []);
    const relatorio = montarRelatorioGrade({
      turmaOriginalId: "turma-a",
      turmaOriginal: "1º ano A",
      turmas,
      dias,
      linhas: gradeSemFaltas.linhas,
      frequencias: [],
      horarios: [],
      resumo: null,
      justificativas,
    });
    expect(relatorio.alunos[0]?.ocorrencias).toEqual([]);
    expect(relatorio.alunos[0]?.totalHistorico).toBe(0);
  });

  it("monta ocorrências com referência de grade atual", () => {
    const linha = grade.linhas[0];
    if (!linha) throw new Error("Linha ausente");
    const ocorrencias = montarOcorrenciasDoAluno(
      linha.aluno,
      ["2026-09-12"],
      { "2026-09-12": "S" },
      new Map([
        [
          "2026-09-12",
          [
            frequencia({
              dia: "2026-09-12",
              turmaId: "turma-a",
              alunos: ["aluno-a"],
              faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }],
            }),
          ],
        ],
      ]),
      horarios,
      justificativas,
    );
    expect(ocorrencias[0]).toMatchObject({
      marca: "S",
      aulasPrevistas: 3,
      aulasFaltadas: 1,
      referenciaAulas: "grade_atual",
    });
  });
});

describe("nomeArquivoRelatorioPdf", () => {
  it("normaliza a turma e o período", () => {
    expect(nomeArquivoRelatorioPdf("1º ano A", dias)).toBe(
      "frequenciapp-relatorio-1o-ano-a-2026-09-10-a-2026-09-11.pdf",
    );
    expect(nomeArquivoRelatorioPdf("", [])).toBe(
      "frequenciapp-relatorio-turma-periodo-a-periodo.pdf",
    );
  });
});
