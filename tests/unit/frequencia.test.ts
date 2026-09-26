// Domínio da frequência: datas, horas, aulas, marca do aluno e grade.
import { describe, expect, it } from "vitest";
import {
  celulasDoMes,
  diaDaSemanaIso,
  diaLocal,
  diaSeguinte,
  diasDoMes,
  diasDoPeriodo,
  diasEntre,
  ehDiaValido,
  ehHoraValida,
  ehJustificativaValida,
  ehMesValido,
  ehMomentoValido,
  horaNoFuso,
  horariosDoDia,
  marcaDoAluno,
  mesSeguinte,
  montarGrade,
  nomeDoMes,
  normalizar,
  partesNoFuso,
  rotuloAula,
  rotuloDataCurta,
  rotuloDeTurma,
  rotuloDiaSemana,
  rotuloJustificativa,
  rotuloMes,
  rotuloMomento,
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

describe("ehDiaValido", () => {
  it("aceita dias reais do calendário", () => {
    expect(ehDiaValido("2026-09-25")).toBe(true);
    expect(ehDiaValido("2000-02-29")).toBe(true);
  });
  it("recusa formatos e datas impossíveis", () => {
    expect(ehDiaValido("2026-9-25")).toBe(false);
    expect(ehDiaValido("2026-02-30")).toBe(false);
    expect(ehDiaValido("25/09/2026")).toBe(false);
    expect(ehDiaValido("")).toBe(false);
    expect(ehDiaValido("2026-13-01")).toBe(false);
  });
});

describe("ehMesValido", () => {
  it("aceita meses reais", () => {
    expect(ehMesValido("2026-09")).toBe(true);
    expect(ehMesValido("2026-12")).toBe(true);
  });
  it("recusa meses impossíveis e formatos soltos", () => {
    expect(ehMesValido("2026-13")).toBe(false);
    expect(ehMesValido("2026-00")).toBe(false);
    expect(ehMesValido("2026-9")).toBe(false);
    expect(ehMesValido("202609")).toBe(false);
  });
});

describe("ehHoraValida", () => {
  it("aceita horários reais do dia", () => {
    expect(ehHoraValida("00:00")).toBe(true);
    expect(ehHoraValida("07:05")).toBe(true);
    expect(ehHoraValida("23:59")).toBe(true);
  });
  it("recusa formatos e horas impossíveis", () => {
    expect(ehHoraValida("24:00")).toBe(false);
    expect(ehHoraValida("7:00")).toBe(false);
    expect(ehHoraValida("07:60")).toBe(false);
    expect(ehHoraValida("")).toBe(false);
  });
});

describe("rotuloDeTurma", () => {
  it("compõe série e turma com espaços controlados", () => {
    expect(rotuloDeTurma("1º ano", "A")).toBe("1º ano A");
    expect(rotuloDeTurma(" 2º ano ", " B ")).toBe("2º ano B");
  });
  it("mantém a turma quando a série vem vazia", () => {
    expect(rotuloDeTurma("", "C")).toBe("C");
  });
});

describe("rotuloAula", () => {
  it("compõe ordem e janela de horário", () => {
    expect(rotuloAula(horario({ ordem: 2, inicio: "07:50", fim: "08:40" }))).toBe(
      "2ª aula · 07:50 às 08:40",
    );
  });
});

describe("diaLocal", () => {
  it("resolve o dia no fuso pedido", () => {
    const instante = new Date("2026-09-25T02:30:00Z");
    expect(diaLocal(instante, "America/Fortaleza")).toBe("2026-09-24");
    expect(diaLocal(instante, "Asia/Tokyo")).toBe("2026-09-25");
  });
});

describe("diaDaSemanaIso", () => {
  it("resolve o dia da semana com segunda 1 e domingo 7", () => {
    expect(diaDaSemanaIso("2026-09-25")).toBe(5);
    expect(diaDaSemanaIso("2026-09-26")).toBe(6);
    expect(diaDaSemanaIso("2026-09-27")).toBe(7);
    expect(diaDaSemanaIso("2026-09-28")).toBe(1);
  });
});

describe("diaSeguinte", () => {
  it("anda em dias dentro do mês", () => {
    expect(diaSeguinte("2026-09-25", 1)).toBe("2026-09-26");
    expect(diaSeguinte("2026-09-25", -1)).toBe("2026-09-24");
  });
  it("vira mês e ano corretamente", () => {
    expect(diaSeguinte("2026-09-30", 1)).toBe("2026-10-01");
    expect(diaSeguinte("2026-01-01", -1)).toBe("2025-12-31");
    expect(diaSeguinte("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("mesSeguinte", () => {
  it("anda em meses dentro do ano", () => {
    expect(mesSeguinte("2026-09", 1)).toBe("2026-10");
    expect(mesSeguinte("2026-09", -1)).toBe("2026-08");
  });
  it("vira o ano nos dois sentidos", () => {
    expect(mesSeguinte("2026-12", 1)).toBe("2027-01");
    expect(mesSeguinte("2026-01", -1)).toBe("2025-12");
  });
});

describe("rotuloDiaSemana", () => {
  it("devolve o dia por extenso", () => {
    expect(rotuloDiaSemana("2026-09-25")).toBe("sexta-feira");
    expect(rotuloDiaSemana("2026-09-27")).toBe("domingo");
  });
});

describe("rotuloDataCurta", () => {
  it("monta DD/MM", () => {
    expect(rotuloDataCurta("2026-09-05")).toBe("05/09");
  });
});

describe("horaNoFuso", () => {
  it("converte o mesmo instante em fusos diferentes", () => {
    const instante = "2026-09-25T13:30:00Z";
    expect(horaNoFuso(instante, "America/Fortaleza")).toBe("10:30");
    expect(horaNoFuso(instante, "Asia/Tokyo")).toBe("22:30");
  });
  it("devolve vazio para instante inválido", () => {
    expect(horaNoFuso("não é data", "America/Fortaleza")).toBe("");
  });
});

describe("partesNoFuso", () => {
  it("resolve o dia da semana e os minutos no fuso pedido", () => {
    const instante = new Date("2026-09-25T02:30:00Z");
    const fortaleza = partesNoFuso(instante, "America/Fortaleza");
    expect(fortaleza.diaSemana).toBe(4);
    expect(fortaleza.minutos).toBe(23 * 60 + 30);
    const tokyo = partesNoFuso(instante, "Asia/Tokyo");
    expect(tokyo.diaSemana).toBe(5);
    expect(tokyo.minutos).toBe(11 * 60 + 30);
  });
});

describe("horariosDoDia", () => {
  const grade = [
    horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
    horario({ id: "aula-1", ordem: 1 }),
    horario({ id: "aula-3", ordem: 3, diasSemana: [6, 7] }),
    horario({ id: "aula-4", ordem: 4, ativo: false }),
  ];
  it("filtra pelo dia da semana e pela situação, ordenando por ordem", () => {
    const aulas = horariosDoDia(grade, "2026-09-25");
    expect(aulas.map((aula) => aula.id)).toEqual(["aula-1", "aula-2"]);
  });
  it("devolve vazio quando nenhuma aula acontece no dia", () => {
    expect(horariosDoDia([horario({ diasSemana: [6, 7] })], "2026-09-25")).toEqual([]);
  });
});

describe("diasDoMes", () => {
  it("lista todos os dias do mês", () => {
    const dias = diasDoMes("2026-02");
    expect(dias.length).toBe(28);
    expect(dias[0]).toBe("2026-02-01");
    expect(dias[27]).toBe("2026-02-28");
  });
  it("sabe fevereiro de ano bissexto", () => {
    expect(diasDoMes("2028-02").length).toBe(29);
  });
  it("sabe meses de 31 dias", () => {
    expect(diasDoMes("2026-01").length).toBe(31);
  });
});

describe("nomeDoMes e rotuloMes", () => {
  it("nomeia o mês capitalizado", () => {
    expect(nomeDoMes("2026-01")).toBe("Janeiro");
    expect(nomeDoMes("2026-09")).toBe("Setembro");
    expect(nomeDoMes("2026-12")).toBe("Dezembro");
  });
  it("junta o mês por extenso ao ano", () => {
    expect(rotuloMes("2026-09")).toBe("Setembro de 2026");
    expect(rotuloMes("2027-03")).toBe("Março de 2027");
  });
  it("devolve vazio para mês inválido", () => {
    expect(nomeDoMes("2026-13")).toBe("");
    expect(rotuloMes("2026-00")).toBe("");
  });
});

describe("celulasDoMes", () => {
  it("alinha o dia 1 na semana que começa no domingo", () => {
    const celulas = celulasDoMes("2026-09");
    expect(celulas.length).toBe(35);
    // 2026-09-01 é uma terça-feira: domingo e segunda ficam vazios.
    expect(celulas.slice(0, 2)).toEqual([null, null]);
    expect(celulas[2]).toBe("2026-09-01");
    expect(celulas[31]).toBe("2026-09-30");
    expect(celulas.slice(32).every((celula) => celula === null)).toBe(true);
  });
  it("preenche o mês que começa no domingo sem vazios à esquerda", () => {
    // 2026-02-01 é um domingo e o mês fecha em quatro semanas.
    const celulas = celulasDoMes("2026-02");
    expect(celulas.length).toBe(28);
    expect(celulas[0]).toBe("2026-02-01");
    expect(celulas[27]).toBe("2026-02-28");
    expect(celulas.filter(Boolean).length).toBe(28);
  });
});

describe("marcaDoAluno", () => {
  it("marca falta quando o aluno falta na única aula do dia", () => {
    const doDia = [frequencia({ faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }] })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("F");
  });
  it("marca presente quando a turma dele teve frequência", () => {
    const doDia = [frequencia({ turmaId: "turma-a", faltas: [] })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("P");
  });
  it("devolve vazio quando a turma não teve frequência", () => {
    const doDia = [frequencia({ turmaId: "turma-b" })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe(null);
  });
  it("marca parcial quando falta em parte das aulas", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
      }),
    ];
    const grade = [
      horario({ id: "aula-1", ordem: 1 }),
      horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, grade)).toBe("S");
  });
  it("marca falta quando falta em todas as aulas", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-1", "aula-2"] }],
      }),
    ];
    const grade = [
      horario({ id: "aula-1", ordem: 1 }),
      horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, grade)).toBe("F");
  });
  it("mantém falta registrada em aula que saiu da grade", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-9"] }],
      }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("F");
  });
  it("falta prevalece mesmo com outra frequência presente no dia", () => {
    const doDia = [
      frequencia({ turmaId: "turma-a", faltas: [] }),
      frequencia({
        turmaId: "turma-b",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-9"] }],
      }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("F");
  });
});

describe("montarGrade", () => {
  it("agrupa marcas, faltas e frequências por aluno", () => {
    const alunos = [aluno(), aluno({ id: "aluno-2", nome: "Aluno Dois", ordem: 2 })];
    const frequencias = [
      frequencia({
        dia: "2026-09-10",
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
      }),
      frequencia({
        dia: "2026-09-11",
        turmaId: "turma-a",
        faltas: [
          { alunoId: "aluno-1", horarios: ["aula-1", "aula-2"] },
          { alunoId: "aluno-2", horarios: ["aula-1"] },
        ],
      }),
    ];
    const grade = montarGrade(alunos, frequencias, diasDoMes("2026-09"));
    expect(grade.dias.length).toBe(30);
    const primeiro = grade.linhas[0];
    expect(primeiro?.aluno.id).toBe("aluno-1");
    expect(primeiro?.faltas).toBe(2);
    expect(primeiro?.frequencias).toBe(2);
    const segundo = grade.linhas[1];
    expect(segundo?.marcas["2026-09-10"]).toBe("P");
    expect(segundo?.marcas["2026-09-11"]).toBe("F");
  });
  it("ordena linhas por ordem e desempata por nome", () => {
    const alunos = [
      aluno({ id: "a", nome: "Zeca", ordem: 2 }),
      aluno({ id: "b", nome: "Ana", ordem: 2 }),
      aluno({ id: "c", nome: "Bia", ordem: 1 }),
    ];
    const grade = montarGrade(alunos, [], diasDoMes("2026-09"));
    expect(grade.linhas.map((linha) => linha.aluno.id)).toEqual(["c", "b", "a"]);
  });
  it("conta dias parciais quando a falta cobre parte das aulas", () => {
    const frequencias = [
      frequencia({
        dia: "2026-09-10",
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"] }],
      }),
    ];
    const grade = montarGrade([aluno()], frequencias, diasDoMes("2026-09"), [
      horario({ id: "aula-1", ordem: 1 }),
      horario({ id: "aula-2", ordem: 2, inicio: "07:50", fim: "08:40" }),
    ]);
    expect(grade.linhas[0]?.parciais).toBe(1);
    expect(grade.linhas[0]?.faltas).toBe(0);
    expect(grade.linhas[0]?.marcas["2026-09-10"]).toBe("S");
  });
});

describe("normalizar", () => {
  it("remove acentos, ordinais e caixa para busca", () => {
    expect(normalizar("3º Ano")).toBe("3o ano");
    expect(normalizar("ÇÃ")).toBe("ca");
    expect(normalizar("Ana Pa´ula")).toContain("ana");
  });
});

describe("justificativas", () => {
  it("reconhece os códigos do catálogo", () => {
    expect(ehJustificativaValida("D")).toBe(true);
    expect(ehJustificativaValida("Dat")).toBe(true);
    expect(ehJustificativaValida("LM")).toBe(true);
    expect(ehJustificativaValida("X")).toBe(false);
    expect(ehJustificativaValida("")).toBe(false);
  });
  it("resolve os rótulos", () => {
    expect(rotuloJustificativa("CM")).toBe("Consulta Médica");
    expect(rotuloJustificativa("Lt")).toBe("Luto");
    expect(rotuloJustificativa("Z")).toBe("");
    expect(rotuloJustificativa(null)).toBe("");
  });
});

describe("momentos de saída", () => {
  it("reconhece aulas, intervalos e almoço", () => {
    expect(ehMomentoValido("aula_1")).toBe(true);
    expect(ehMomentoValido("aula_9")).toBe(true);
    expect(ehMomentoValido("intervalo_1")).toBe(true);
    expect(ehMomentoValido("almoco")).toBe(true);
    expect(ehMomentoValido("madrugada")).toBe(false);
  });
  it("resolve os rótulos", () => {
    expect(rotuloMomento("aula_3")).toBe("3ª aula");
    expect(rotuloMomento("intervalo_2")).toBe("2º intervalo");
    expect(rotuloMomento("almoco")).toBe("Almoço");
    expect(rotuloMomento("outro")).toBe("outro");
  });
});

describe("diasDoPeriodo", () => {
  it("resolve dia, semana de aula, mês e intervalo", () => {
    expect(diasDoPeriodo("dia", "2026-09-25")).toEqual(["2026-09-25"]);
    expect(diasDoPeriodo("semana", "2026-09-25")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(diasDoPeriodo("mes", "2026-09-10").length).toBe(30);
    expect(diasDoPeriodo("periodo", "2026-09-25", "2026-09-27")).toEqual([
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    expect(diasDoPeriodo("periodo", "2026-09-25", "2026-09-24")).toEqual(["2026-09-25"]);
  });
  it("limita intervalos longos ao teto de segurança", () => {
    expect(diasEntre("2020-01-01", "2030-12-31")).toHaveLength(366);
  });
});

describe("marcaDoAluno com justificativa", () => {
  it("marca FJ quando todas as faltas do dia têm justificativa", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-1"], justificativa: "D" }],
      }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("FJ");
  });
  it("marca F quando alguma falta do dia não tem justificativa", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-a",
        faltas: [
          { alunoId: "aluno-1", horarios: ["aula-1"], justificativa: "D" },
          { alunoId: "aluno-1", horarios: ["aula-2"] },
        ],
      }),
    ];
    const grade = [horario({ id: "aula-1" }), horario({ id: "aula-2", ordem: 2 })];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, grade)).toBe("F");
  });
  it("mantém FJ mesmo sem frequência da turma atual", () => {
    const doDia = [
      frequencia({
        turmaId: "turma-b",
        faltas: [{ alunoId: "aluno-1", horarios: ["aula-9"], justificativa: "T" }],
      }),
    ];
    expect(marcaDoAluno(aluno(), "2026-09-10", doDia, [horario({ id: "aula-1" })])).toBe("FJ");
  });
});
