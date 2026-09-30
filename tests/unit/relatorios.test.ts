// Indicadores e relatórios: marcas do dia, distribuição, cobertura,
// resumo por aluno e saídas.
import { describe, expect, it } from "vitest";
import {
  coberturaDoDia,
  desistenciasNoDia,
  distribuicaoDoDia,
  distribuicaoPorOrigem,
  indexarPorDia,
  marcasDoDia,
  relatorioSaidas,
  resumoDoDia,
  resumoPorAluno,
} from "@/domain/relatorios";
import type { Aluno, Frequencia, SaidaAntecipada, Serie, Turma } from "@/domain/frequencia";

function serie(parcial: Partial<Serie> = {}): Serie {
  return {
    id: parcial.id ?? "serie-1",
    nome: parcial.nome ?? "1ª série",
    ordem: parcial.ordem ?? 1,
  };
}

function turma(parcial: Partial<Turma> = {}): Turma {
  const nome = parcial.nome ?? "A";
  const serieNome = parcial.serieNome ?? "1ª série";
  return {
    id: parcial.id ?? "turma-a",
    serieId: parcial.serieId ?? "serie-1",
    nome,
    rotulo: parcial.rotulo ?? `${serieNome} ${nome}`,
    serieNome,
    horarios: parcial.horarios ?? [],
  };
}

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "aluno-a",
    nome: parcial.nome ?? "Aluno A",
    turmaId: parcial.turmaId ?? "turma-a",
    turmaOriginalId: parcial.turmaOriginalId ?? parcial.turmaId ?? "turma-a",
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
  };
}

function saida(parcial: Partial<SaidaAntecipada> = {}): SaidaAntecipada {
  return {
    id: parcial.id ?? "saida-1",
    alunoId: parcial.alunoId ?? "aluno-a",
    dia: parcial.dia ?? "2026-09-10",
    momento: parcial.momento ?? "aula_2",
    justificativa: parcial.justificativa ?? "D",
    observacao: parcial.observacao ?? null,
    texto: parcial.texto ?? null,
    liberadoPorId: parcial.liberadoPorId ?? null,
    liberadoPorCodigo: parcial.liberadoPorCodigo ?? null,
    liberadoPorNome: parcial.liberadoPorNome ?? null,
    criadoEm: parcial.criadoEm ?? "2026-09-10T14:00:00Z",
  };
}

describe("marcasDoDia e resumoDoDia", () => {
  const alunos = [
    aluno({ id: "aluno-a" }),
    aluno({ id: "aluno-b", turmaId: "turma-b", nome: "Aluno B" }),
    aluno({ id: "aluno-c", nome: "Aluno C" }),
  ];
  const doDia = [
    frequencia({
      turmaId: "turma-a",
      faltas: [{ alunoId: "aluno-c", horarios: ["aula-1"], justificativa: "D" }],
    }),
    frequencia({ turmaId: "turma-b", faltas: [{ alunoId: "aluno-b", horarios: ["aula-1"] }] }),
  ];

  it("deriva P, F e FJ por aluno", () => {
    const marcas = marcasDoDia(alunos, "2026-09-10", doDia);
    expect(marcas.get("aluno-a")).toBe("P");
    expect(marcas.get("aluno-b")).toBe("F");
    expect(marcas.get("aluno-c")).toBe("FJ");
  });

  it("resume o dia com ausências, saídas e infrequência", () => {
    const marcas = marcasDoDia(alunos, "2026-09-10", doDia);
    const resumo = resumoDoDia(marcas, alunos.length, [saida({ alunoId: "aluno-b" })]);
    expect(resumo.presentes).toBe(1);
    expect(resumo.faltas).toBe(1);
    expect(resumo.justificadas).toBe(1);
    expect(resumo.ausencias).toBe(2);
    expect(resumo.saidas).toBe(1);
    expect(resumo.infrequencia).toBeCloseTo(2 / 3);
  });
});

describe("distribuicaoDoDia", () => {
  it("distribui as faltas por série e por turma", () => {
    const alunos = [
      aluno({ id: "aluno-a" }),
      aluno({ id: "aluno-b", turmaId: "turma-b", turmaOriginalId: "turma-b" }),
      aluno({ id: "aluno-c" }),
    ];
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-c", horarios: ["aula-1"], justificativa: "T" }],
      }),
      frequencia({ turmaId: "turma-b", faltas: [{ alunoId: "aluno-b", horarios: ["aula-1"] }] }),
    ];
    const marcas = marcasDoDia(alunos, "2026-09-10", doDia);
    const series = [serie()];
    const turmas = [turma(), turma({ id: "turma-b", nome: "B" })];
    const distribuicao = distribuicaoDoDia(series, turmas, alunos, marcas);
    expect(distribuicao).toHaveLength(1);
    const primeira = distribuicao[0];
    expect((primeira?.faltas ?? 0) + (primeira?.justificadas ?? 0)).toBe(2);
    expect(primeira?.percentual).toBe(1);
    expect(primeira?.turmas).toHaveLength(2);
    expect(primeira?.turmas[0]?.percentual).toBeCloseTo(0.5);
    expect(primeira?.turmas[1]?.percentual).toBeCloseTo(0.5);
  });
});

describe("distribuicaoDoDia na turma reorganizada", () => {
  it("conta a falta na turma atual, não na de origem", () => {
    const alunos = [aluno({ id: "aluno-m", turmaId: "turma-b", turmaOriginalId: "turma-a" })];
    const doDia = [
      frequencia({
        turmaId: "turma-b",
        alunos: ["aluno-m"],
        faltas: [{ alunoId: "aluno-m", horarios: ["aula-1"] }],
      }),
    ];
    const marcas = marcasDoDia(alunos, "2026-09-10", doDia);
    const turmas = [turma(), turma({ id: "turma-b", nome: "B" })];
    const [primeira] = distribuicaoDoDia([serie()], turmas, alunos, marcas);
    expect(primeira?.turmas.map((item) => [item.turmaId, item.faltas])).toEqual([
      ["turma-a", 0],
      ["turma-b", 1],
    ]);
  });
});

describe("coberturaDoDia", () => {
  it("conta registrados e turmas pendentes", () => {
    const alunos = [
      aluno({ id: "aluno-a" }),
      aluno({ id: "aluno-b", turmaId: "turma-b", turmaOriginalId: "turma-b" }),
    ];
    const turmas = [turma(), turma({ id: "turma-b", nome: "B" })];
    const cobertura = coberturaDoDia(turmas, alunos, [frequencia({ turmaId: "turma-a" })]);
    expect(cobertura.esperados).toBe(2);
    expect(cobertura.registrados).toBe(1);
    expect(cobertura.turmasPendentes.map((item) => item.id)).toEqual(["turma-b"]);
  });
});

describe("desistenciasNoDia", () => {
  it("conta a situação pela turma atual sem alterar o dia anterior", () => {
    const series = [serie()];
    const turmas = [turma(), turma({ id: "turma-b", nome: "B" })];
    const alunos = [
      aluno({
        id: "a",
        turmaId: "turma-b",
        turmaOriginalId: "turma-a",
        desistenteEm: "2026-09-11",
      }),
      aluno({ id: "b", turmaId: "turma-a", desistenteEm: "2026-09-12" }),
    ];
    expect(desistenciasNoDia(series, turmas, alunos, "2026-09-10").total).toBe(0);
    const atual = desistenciasNoDia(series, turmas, alunos, "2026-09-11");
    expect(atual.total).toBe(1);
    expect(atual.series[0]?.turmas.map((item) => item.quantidade)).toEqual([0, 1]);
  });
});

describe("resumoPorAluno", () => {
  it("conta dias com registro, F, FJ e saídas no período", () => {
    const dias = ["2026-09-10", "2026-09-11"];
    const frequencias = [
      frequencia({
        dia: "2026-09-10",
        faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"], justificativa: "D" }],
      }),
      frequencia({ dia: "2026-09-11" }),
    ];
    const resumo = resumoPorAluno(aluno(), dias, indexarPorDia(frequencias), [
      saida({ alunoId: "aluno-a" }),
    ]);
    expect(resumo.diasComRegistro).toBe(2);
    expect(resumo.justificadas).toBe(1);
    expect(resumo.faltas).toBe(0);
    expect(resumo.saidas).toBe(1);
  });
});

describe("relatorioSaidas", () => {
  it("agrupa por aluno e filtra duas ou mais", () => {
    const saidas = [
      saida({ id: "s1", alunoId: "aluno-a", dia: "2026-09-10" }),
      saida({ id: "s2", alunoId: "aluno-a", dia: "2026-09-11" }),
      saida({ id: "s3", alunoId: "aluno-b", dia: "2026-09-10" }),
    ];
    expect(relatorioSaidas(saidas)).toHaveLength(2);
    const repetidas = relatorioSaidas(saidas, "repetidas");
    expect(repetidas).toHaveLength(1);
    expect(repetidas[0]?.alunoId).toBe("aluno-a");
    expect(repetidas[0]?.saidas).toHaveLength(2);
  });
});

describe("distribuicaoPorOrigem", () => {
  const series = [serie()];
  const turmas = [turma(), turma({ id: "turma-b", nome: "B" })];
  // Um aluno de A foi remanejado para B; um de B ficou onde estava.
  const alunos = [
    aluno({ id: "aluno-a" }),
    aluno({ id: "aluno-m", turmaId: "turma-b", turmaOriginalId: "turma-a" }),
    aluno({ id: "aluno-b", turmaId: "turma-b", turmaOriginalId: "turma-b" }),
    aluno({ id: "aluno-i", ativo: false, turmaId: "turma-b", turmaOriginalId: "turma-a" }),
  ];
  const doDia = [
    frequencia({ turmaId: "turma-b", faltas: [{ alunoId: "aluno-m", horarios: ["aula-1"] }] }),
    frequencia({ turmaId: "turma-a", faltas: [] }),
  ];
  const marcas = marcasDoDia(alunos, "2026-09-10", doDia);

  it("agrupa pela turma original, contando a falta do remanejado na origem", () => {
    const porOrigem = distribuicaoPorOrigem(series[0] as Serie, turmas, alunos, marcas);
    expect(porOrigem.map((item) => [item.rotulo, item.esperados, item.faltas])).toEqual([
      ["1ª série A", 2, 1],
      ["1ª série B", 1, 0],
    ]);
  });

  it("soma o mesmo total de faltas que a distribuição pela turma atual", () => {
    const porOrigem = distribuicaoPorOrigem(series[0] as Serie, turmas, alunos, marcas);
    const porAtual = distribuicaoDoDia(series, turmas, alunos, marcas)[0];
    const total = (lista: { faltas: number; justificadas: number }[]) =>
      lista.reduce((soma, item) => soma + item.faltas + item.justificadas, 0);
    expect(total(porOrigem)).toBe(total(porAtual?.turmas ?? []));
  });
});
