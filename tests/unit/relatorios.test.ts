// Indicadores e relatórios: marcas do dia, distribuição, cobertura,
// resumo por aluno e saídas.
import { describe, expect, it } from "vitest";
import {
  alunosPorFaltas,
  coberturaDoDia,
  desistenciasNoDia,
  distribuicaoDoDia,
  distribuicaoDoPeriodo,
  distribuicaoPorOrigem,
  evolucaoDoPeriodo,
  infrequencia,
  indexarPorDia,
  marcasDoDia,
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
    horario: parcial.horario ?? null,
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

describe("distribuicaoDoPeriodo", () => {
  const series = [serie(), serie({ id: "serie-2", nome: "2ª série", ordem: 2 })];
  const turmas = [turma(), turma({ id: "turma-b", serieId: "serie-2", rotulo: "2ª série B" })];
  const alunos = [aluno(), aluno({ id: "aluno-b", turmaId: "turma-b" })];
  const chamadas = [
    frequencia({ dia: "2026-08-31", faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }] }),
    frequencia({ dia: "2026-09-01", faltas: [] }),
    frequencia({
      dia: "2026-09-01",
      turmaId: "turma-b",
      faltas: [{ alunoId: "aluno-b", horarios: ["aula-1"], justificativa: "D" }],
    }),
    frequencia({ dia: "2026-09-03", faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }] }),
  ];

  it("soma F e FJ entre meses com limites inclusivos, sem inventar presenças", () => {
    const resultado = distribuicaoDoPeriodo(
      series,
      turmas,
      alunos,
      chamadas,
      "2026-08-31",
      "2026-09-02",
    );
    expect(resultado[0]).toMatchObject({
      faltas: 1,
      justificadas: 0,
      registrados: 2,
      presentes: 1,
      percentual: 0.5,
    });
    expect(resultado[1]).toMatchObject({
      faltas: 0,
      justificadas: 1,
      registrados: 1,
      percentual: 0.5,
    });
    if (resultado[0]) expect(infrequencia(resultado[0])).toBe(0.5);
    expect(resultado[0]?.turmas[0]).toMatchObject({ faltas: 1, registrados: 2, percentual: 1 });
  });

  it("calcula a taxa sobre registros, em vez da média das taxas dos dias", () => {
    const resultado = distribuicaoDoPeriodo(
      [serie()],
      [turma()],
      [aluno(), aluno({ id: "aluno-c" })],
      [
        frequencia({
          dia: "2026-09-01",
          alunos: ["aluno-a"],
          faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }],
        }),
        frequencia({ dia: "2026-09-02", alunos: ["aluno-a", "aluno-c"], faltas: [] }),
      ],
      "2026-09-01",
      "2026-09-02",
    );
    expect(resultado[0]).toMatchObject({ faltas: 1, registrados: 3, presentes: 2 });
    if (resultado[0]) expect(infrequencia(resultado[0])).toBeCloseTo(1 / 3);
  });

  it("não conta aluno que ainda não estava na lista, nem desistência vigente ou inativo", () => {
    const resultado = distribuicaoDoPeriodo(
      [serie()],
      [turma()],
      [
        aluno({ desistenteEm: "2026-09-02" }),
        aluno({ id: "aluno-c" }),
        aluno({ id: "aluno-i", ativo: false }),
      ],
      [
        frequencia({
          dia: "2026-09-01",
          alunos: ["aluno-a", "aluno-i"],
          faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }],
        }),
        frequencia({
          dia: "2026-09-02",
          alunos: ["aluno-a", "aluno-c", "aluno-i"],
          faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }],
        }),
      ],
      "2026-09-01",
      "2026-09-02",
    );
    expect(resultado[0]).toMatchObject({ faltas: 1, registrados: 2, presentes: 1 });
  });

  it("preserva marcas da lista histórica após transferência e agrupa pela turma atual", () => {
    const resultado = distribuicaoDoPeriodo(
      series,
      turmas,
      [aluno({ turmaId: "turma-b", turmaOriginalId: "turma-a" })],
      [frequencia({ alunos: ["aluno-a"], faltas: [] })],
      "2026-09-10",
      "2026-09-10",
    );
    expect(resultado[0]).toMatchObject({ registrados: 0 });
    expect(resultado[1]).toMatchObject({ registrados: 1, presentes: 1 });
  });

  it("não trata ausência parcial em aula como falta integral", () => {
    const horarios = [1, 2].map((ordem) => ({
      id: `aula-${ordem}`,
      turmaId: "turma-a",
      ordem,
      inicio: "07:00",
      fim: "08:00",
      diasSemana: [1, 2, 3, 4, 5, 6, 7],
      ativo: true,
    }));
    const resultado = distribuicaoDoPeriodo(
      [serie()],
      [turma({ horarios })],
      [aluno()],
      [frequencia({ faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"] }] })],
      "2026-09-10",
      "2026-09-10",
    );
    expect(resultado[0]).toMatchObject({ registrados: 1, faltas: 0, justificadas: 0 });
  });

  it("distingue período sem chamada de chamadas sem falta", () => {
    const vazio = distribuicaoDoPeriodo(
      series,
      turmas,
      alunos,
      chamadas,
      "2026-09-02",
      "2026-09-02",
    );
    expect(vazio.every((item) => item.registrados === 0 && item.percentual === 0)).toBe(true);
    const comPresenca = distribuicaoDoPeriodo(
      [serie()],
      [turma()],
      [aluno()],
      [frequencia()],
      "2026-09-10",
      "2026-09-10",
    );
    expect(comPresenca[0]).toMatchObject({ registrados: 1, presentes: 1, faltas: 0 });
  });
});

describe("evolucaoDoPeriodo", () => {
  it("distingue dia sem chamada, presença registrada e falta justificada", () => {
    const dados = evolucaoDoPeriodo(
      [aluno(), aluno({ id: "aluno-novo" })],
      [turma()],
      [
        frequencia({ dia: "2026-09-02", alunos: ["aluno-a"] }),
        frequencia({
          dia: "2026-09-03",
          alunos: ["aluno-a"],
          faltas: [{ alunoId: "aluno-a", horarios: ["aula-1"], justificativa: "D" }],
        }),
      ],
      ["2026-09-01", "2026-09-02", "2026-09-03"],
    );
    expect(dados.map((dia) => [dia.registrados, dia.justificadas, dia.taxa])).toEqual([
      [0, 0, null],
      [1, 0, 0],
      [1, 1, 1],
    ]);
  });

  it("preserva presença histórica após transferência e respeita a data da desistência", () => {
    const dados = evolucaoDoPeriodo(
      [
        aluno({ turmaId: "turma-b", desistenteEm: "2026-09-02" }),
        aluno({ id: "inativo", ativo: false }),
      ],
      [turma(), turma({ id: "turma-b" })],
      ["2026-09-01", "2026-09-02"].map((dia) =>
        frequencia({ dia, alunos: ["aluno-a", "inativo"] }),
      ),
      ["2026-09-01", "2026-09-02"],
    );
    expect(dados.map((dia) => [dia.registrados, dia.taxa])).toEqual([
      [1, 0],
      [0, null],
    ]);
  });
});

describe("alunosPorFaltas", () => {
  it("soma F e FJ pela lista histórica e desempata por nome e identificador", () => {
    const alunos = [
      aluno({ id: "b", nome: "Bruno" }),
      aluno({ id: "d", nome: "Ana" }),
      aluno({ id: "c", nome: "Ana" }),
      aluno({ id: "a", nome: "Zeca", turmaId: "turma-b", turmaOriginalId: "turma-a" }),
    ];
    const chamadas = [
      frequencia({
        dia: "2026-09-01",
        alunos: alunos.map((item) => item.id),
        faltas: alunos.map((item) => ({ alunoId: item.id, horarios: ["aula-1"] })),
      }),
      frequencia({
        dia: "2026-09-02",
        alunos: ["a"],
        faltas: [{ alunoId: "a", horarios: ["aula-1"], justificativa: "D" }],
      }),
    ];
    const resultado = alunosPorFaltas(alunos, [turma(), turma({ id: "turma-b" })], chamadas, [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(resultado.map((item) => item.aluno.id)).toEqual(["a", "c", "d", "b"]);
    expect(resultado[0]).toMatchObject({
      totalFaltas: 2,
      faltas: 1,
      justificadas: 1,
      diasComRegistro: 2,
    });
    expect(resultado[1]).toMatchObject({ totalFaltas: 1, diasComRegistro: 1 });
  });

  it("exclui inativos, presenças e faltas parciais, respeitando a data da desistência", () => {
    const alunos = [
      aluno({ id: "a", desistenteEm: "2026-09-02" }),
      aluno({ id: "parcial" }),
      aluno({ id: "presente" }),
      aluno({ id: "inativo", ativo: false }),
      aluno({ id: "novo" }),
    ];
    const horarios = [1, 2].map((ordem) => ({
      id: `aula-${ordem}`,
      turmaId: "turma-a",
      ordem,
      inicio: "07:00",
      fim: "08:00",
      diasSemana: [1, 2, 3, 4, 5, 6, 7],
      ativo: true,
    }));
    const chamadas = ["2026-09-01", "2026-09-02"].map((dia) =>
      frequencia({
        dia,
        alunos: ["a", "parcial", "presente", "inativo"],
        faltas: [
          { alunoId: "a", horarios: ["aula-1", "aula-2"], justificativa: "D" },
          { alunoId: "parcial", horarios: ["aula-1"] },
          { alunoId: "inativo", horarios: ["aula-1", "aula-2"] },
        ],
      }),
    );
    const resultado = alunosPorFaltas(alunos, [turma({ horarios })], chamadas, [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      aluno: { id: "a" },
      totalFaltas: 1,
      justificadas: 1,
      diasComRegistro: 1,
    });
    expect(alunosPorFaltas(alunos, [turma({ horarios })], chamadas, ["2026-09-03"])).toEqual([]);
  });
});
