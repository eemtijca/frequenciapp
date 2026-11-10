// Resumo semanal de Saídas e Entradas por aba, dia, turma e aluno.
import { describe, expect, it } from "vitest";
import type { EntradaAtrasada } from "@/domain/entradas";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { resumirMovimentacoes } from "@/domain/resumo-semana-movimentacoes";

const DIAS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

function turma(id: string, rotulo: string): Turma {
  return { id, serieId: "serie", nome: rotulo, rotulo, serieNome: "1º ano", horarios: [] };
}

function aluno(id: string, nome: string, turmaId: string): Aluno {
  return {
    id,
    nome,
    turmaId,
    turmaOriginalId: turmaId,
    ordem: 1,
    ativo: true,
    desistenteEm: null,
  };
}

function saida(id: string, alunoId: string, dia: string): SaidaAntecipada {
  return {
    id,
    alunoId,
    dia,
    momento: "aula_1",
    horario: "07:30",
    justificativa: null,
    observacao: null,
    texto: null,
    liberadoPorId: null,
    liberadoPorCodigo: null,
    liberadoPorNome: null,
    criadoEm: `${dia}T12:00:00Z`,
  };
}

function entrada(id: string, alunoId: string, dia: string, turmaId: string): EntradaAtrasada {
  return {
    id,
    alunoId,
    nome: alunoId,
    turmaId,
    turmaRotulo: "1º ano B",
    dia,
    horario: "08:10",
    motivo: "Atraso",
    registradoPorNome: "Equipe",
    criadoEm: `${dia}T12:00:00Z`,
  };
}

describe("resumo semanal de movimentações", () => {
  it("agrupa saídas por dia, turma de origem e aluno", () => {
    const resumo = resumirMovimentacoes("saida", {
      saidas: [
        {
          ...saida("s1", "ana", "2026-10-19"),
          turmaHistoricaId: "turma-a",
          turmaHistoricaNome: "1º ano A",
        },
        {
          ...saida("s2", "ana", "2026-10-20"),
          turmaHistoricaId: "turma-a",
          turmaHistoricaNome: "1º ano A",
        },
        {
          ...saida("s3", "bruno", "2026-10-19"),
          turmaHistoricaId: "turma-b",
          turmaHistoricaNome: "1º ano B",
        },
      ],
      alunos: [aluno("ana", "Ana", "turma-a"), aluno("bruno", "Bruno", "turma-b")],
      turmas: [turma("turma-a", "1º ano A"), turma("turma-b", "1º ano B")],
      dias: DIAS,
    });
    expect(resumo.total).toBe(3);
    expect(resumo.totalAlunos).toBe(2);
    expect(resumo.totalTurmas).toBe(2);
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-19")?.total).toBe(2);
    expect(resumo.alunos[0]).toMatchObject({ nome: "Ana", total: 2 });
    expect(resumo.turmas.map((item) => [item.rotulo, item.total])).toEqual([
      ["1º ano A", 2],
      ["1º ano B", 1],
    ]);
  });

  it.each([
    [
      "transferência",
      "turma-b",
      { turmaHistoricaId: "turma-a", turmaHistoricaNome: "1º ano A" },
      "turma-a",
      "1º ano A",
      1,
    ],
    [
      "renomeação",
      "turma-a",
      { turmaHistoricaId: "turma-a", turmaHistoricaNome: "1º ano A" },
      "turma-a",
      "1º ano A",
      1,
    ],
    ["legado sem referência", "turma-b", {}, "desconhecida", "Turma histórica desconhecida", 0],
    [
      "referência nula",
      "turma-b",
      { turmaHistoricaId: null, turmaHistoricaNome: null, origemReferencia: "DESCONHECIDA" },
      "desconhecida",
      "Turma histórica desconhecida",
      0,
    ],
  ] as const)(
    "preserva atribuição histórica sem cadastro atual: %s",
    (_caso, atual, referencia, id, rotulo, conhecidas) => {
      const dados = {
        saidas: [
          { ...saida("s1", "ana", "2026-10-19"), ...referencia },
          saida("fora", "ana", "2026-10-18"),
          saida("ausente", "ausente", "2026-10-19"),
        ],
        alunos: [aluno("ana", "Ana", atual)],
        turmas: [turma("turma-a", "Turma A renomeada"), turma("turma-b", "Turma B atual")],
        dias: DIAS,
      };
      const antes = structuredClone(dados);
      const resumo = resumirMovimentacoes("saida", dados);
      expect(resumo.turmas).toEqual([{ turmaId: id, rotulo, total: 1 }]);
      expect(resumo.alunos).toEqual([{ alunoId: "ana", nome: "Ana", turma: rotulo, total: 1 }]);
      expect(resumo.totalTurmas).toBe(conhecidas);
      expect(resumo.totalAlunos).toBe(1);
      expect(resumo.total).toBe(1);
      expect(resumo.dias).toEqual(
        DIAS.map((dia) => ({ dia, total: dia === "2026-10-19" ? 1 : 0 })),
      );
      expect(dados).toEqual(antes);
    },
  );

  it("preserva múltiplas referências da semana sem atribuir tudo à primeira turma", () => {
    const dados = {
      saidas: [
        {
          ...saida("s1", "ana", "2026-10-19"),
          turmaHistoricaId: "turma-a",
          turmaHistoricaNome: "1º ano A",
        },
        {
          ...saida("s2", "ana", "2026-10-20"),
          turmaHistoricaId: "turma-b",
          turmaHistoricaNome: "1º ano B",
        },
        {
          ...saida("s3", "ana", "2026-10-21"),
          turmaHistoricaId: "turma-a",
          turmaHistoricaNome: "1º ano A renomeada",
        },
        saida("s4", "ana", "2026-10-22"),
        {
          ...saida("s5", "ana", "2026-10-23"),
          turmaHistoricaId: "turma-a",
          turmaHistoricaNome: "1º ano A",
        },
        {
          ...saida("s6", "bruno", "2026-10-24"),
          turmaHistoricaId: "turma-b",
          turmaHistoricaNome: "1º ano B",
        },
        {
          ...saida("s7", "carla", "2026-10-24"),
          turmaHistoricaId: "turma-b",
          turmaHistoricaNome: "1º ano B",
        },
      ],
      alunos: [
        aluno("carla", "Carla", "turma-atual"),
        aluno("ana", "Ana", "turma-atual"),
        aluno("bruno", "Bruno", "turma-atual"),
      ],
      turmas: [turma("turma-atual", "Cadastro atual")],
      dias: DIAS,
    };
    const antes = structuredClone(dados);
    const resumo = resumirMovimentacoes("saida", dados);
    expect.soft(resumo.turmas).toEqual([
      { turmaId: "turma-b", rotulo: "1º ano B", total: 3 },
      { turmaId: "turma-a", rotulo: "1º ano A", total: 2 },
      { turmaId: "turma-a", rotulo: "1º ano A renomeada", total: 1 },
      { turmaId: "desconhecida", rotulo: "Turma histórica desconhecida", total: 1 },
    ]);
    expect(resumo.alunos).toEqual([
      {
        alunoId: "ana",
        nome: "Ana",
        turma: "1º ano A · 1º ano B · 1º ano A renomeada · Turma histórica desconhecida",
        total: 5,
      },
      { alunoId: "bruno", nome: "Bruno", turma: "1º ano B", total: 1 },
      { alunoId: "carla", nome: "Carla", turma: "1º ano B", total: 1 },
    ]);
    expect(resumo.totalTurmas).toBe(2);
    expect(resumo.totalAlunos).toBe(3);
    expect(resumo.total).toBe(7);
    expect(resumo.dias.map((item) => item.total)).toEqual([1, 1, 1, 1, 1, 2]);
    expect(resumo.turmas.reduce((total, item) => total + item.total, 0)).toBe(resumo.total);
    expect(resumo.alunos.reduce((total, item) => total + item.total, 0)).toBe(resumo.total);
    expect(dados).toEqual(antes);
  });

  it("mantém o contrato de entradas com mais de uma turma gravada", () => {
    const entradas = [
      entrada("e1", "ana", "2026-10-19", "turma-b"),
      { ...entrada("e2", "ana", "2026-10-20", "turma-c"), turmaRotulo: "1º ano C" },
    ];
    const antes = structuredClone(entradas);
    const resumo = resumirMovimentacoes("entrada", { entradas, dias: DIAS });
    expect(resumo.turmas).toEqual([
      { turmaId: "turma-b", rotulo: "1º ano B", total: 1 },
      { turmaId: "turma-c", rotulo: "1º ano C", total: 1 },
    ]);
    expect(resumo.alunos).toEqual([{ alunoId: "ana", nome: "ana", turma: "1º ano B", total: 2 }]);
    expect(resumo.totalTurmas).toBe(2);
    expect(resumo.total).toBe(2);
    expect(entradas).toEqual(antes);
  });

  it("agrupa entradas pela turma gravada no registro", () => {
    const resumo = resumirMovimentacoes("entrada", {
      entradas: [
        entrada("e1", "ana", "2026-10-19", "turma-b"),
        entrada("e2", "ana", "2026-10-20", "turma-b"),
      ],
      dias: DIAS,
    });
    expect(resumo.total).toBe(2);
    expect(resumo.totalTurmas).toBe(1);
    expect(resumo.turmas[0]).toMatchObject({ rotulo: "1º ano B", total: 2 });
    expect(resumo.alunos[0]).toMatchObject({ nome: "ana", total: 2 });
  });
});
