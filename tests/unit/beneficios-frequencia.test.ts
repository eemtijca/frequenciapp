// Alerta de frequência dos benefícios: limite pelo percentual configurado, projeção das aulas do mês e regra por benefício.
import { describe, expect, it } from "vitest";
import { diaDaSemanaIso, diasDoMes, type Aluno, type Horario } from "@/domain/frequencia";
import {
  acimaDoLimiteDeFaltas,
  alertasDeFrequencia,
  limiteDeFaltas,
  type AlertaFrequenciaBeneficio,
  type EntradaAlertasFrequencia,
  type RegraFrequenciaBeneficio,
} from "@/domain/beneficios-frequencia";
import { frasesDoAlerta } from "@/components/frequencia/frases-aviso-beneficio";

describe("limite de faltas pelo percentual mínimo de frequência", () => {
  it.each([
    [0, 80, 0],
    [4, 80, 0],
    [5, 80, 1],
    [9, 80, 1],
    [10, 80, 2],
    [100, 80, 20],
    [101, 80, 20],
    [110, 80, 22],
    [124, 80, 24],
    [110, 75, 27],
    [110, 90, 11],
    [110, 100, 0],
    [110, 1, 108],
  ])("%i aulas com %i% de mínimo permitem %i faltas", (horas, percentual, limite) => {
    expect(limiteDeFaltas(horas, percentual)).toBe(limite);
  });

  it("aceita exatamente o percentual mínimo e reprova abaixo dele", () => {
    expect(acimaDoLimiteDeFaltas(20, 100, 80)).toBe(false);
    expect(acimaDoLimiteDeFaltas(21, 100, 80)).toBe(true);
    expect(acimaDoLimiteDeFaltas(24, 124, 80)).toBe(false);
    expect(acimaDoLimiteDeFaltas(25, 124, 80)).toBe(true);
    expect(acimaDoLimiteDeFaltas(25, 100, 75)).toBe(false);
    expect(acimaDoLimiteDeFaltas(26, 100, 75)).toBe(true);
    expect(acimaDoLimiteDeFaltas(0, 100, 100)).toBe(false);
    expect(acimaDoLimiteDeFaltas(1, 100, 100)).toBe(true);
  });

  it("sem horas letivas não há alerta", () => {
    expect(acimaDoLimiteDeFaltas(3, 0, 80)).toBe(false);
  });
});

function aulasDaSemana(turmaId: string, porDia: number): Horario[] {
  return Array.from({ length: porDia }, (_, indice) => ({
    id: `${turmaId}-aula-${indice + 1}`,
    turmaId,
    ordem: indice + 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3, 4, 5],
    ativo: true,
  }));
}

function aluno(id: string, extras: Partial<Aluno> = {}): Aluno {
  return {
    id,
    nome: id,
    turmaId: "t1",
    turmaOriginalId: "t1",
    ordem: 1,
    ativo: true,
    desistenteEm: null,
    ...extras,
  };
}

function regra(extras: Partial<RegraFrequenciaBeneficio> = {}): RegraFrequenciaBeneficio {
  return {
    id: "b1",
    nome: "Benefício A",
    percentualMinimoFrequencia: 80,
    aulasPorDia: null,
    faltasJustificadasContam: false,
    ativo: true,
    ...extras,
  };
}

// Outubro de 2026 tem 22 dias úteis: 22 dias com 5 aulas somam 110 aulas e, a 80%, o limite é 22 faltas.
function base(extras: Partial<EntradaAlertasFrequencia> = {}): EntradaAlertasFrequencia {
  return {
    mes: "2026-10",
    alunos: [aluno("a1")],
    turmas: [{ id: "t1", horarios: aulasDaSemana("t1", 5) }],
    feriados: [],
    chamadas: [],
    faltas: [],
    regras: [regra()],
    ...extras,
  };
}

function faltasDe(alunoId: string, total: number, justificadas = 0) {
  return Array.from({ length: total }, (_, indice) => ({
    alunoId,
    justificada: indice < justificadas,
  }));
}

describe("alertas de frequência no mês", () => {
  it("projeta nove aulas por dia útil quando a regra define a carga diária", () => {
    const [alerta] = alertasDeFrequencia(
      base({ regras: [regra({ aulasPorDia: 9 })], faltas: faltasDe("a1", 40) }),
    );
    expect(alerta).toMatchObject({
      horasLetivas: 198,
      limiteFaltas: 39,
      aulasPorDia: 9,
      diasLetivos: 22,
      aulasDeReferencia: 9,
    });
  });

  it("a carga diária preserva os retratos e não cria aulas para quem não estava na chamada", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        regras: [regra({ aulasPorDia: 9 })],
        chamadas: [
          { dia: "2026-10-01", turmaId: "t1", aulas: 7, alunoIds: ["a1"] },
          { dia: "2026-10-02", turmaId: "t1", aulas: 5, alunoIds: [] },
          { dia: "2026-10-03", turmaId: "t1", aulas: 4, alunoIds: ["a1"] },
        ],
        faltas: faltasDe("a1", 50),
      }),
    );
    expect(alerta).toMatchObject({
      horasLetivas: 191,
      limiteFaltas: 38,
      diasLetivos: 22,
      aulasDeReferencia: 9,
    });
  });

  it("a carga diária respeita feriados, desistência e dias sem aulas na grade", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        alunos: [aluno("a1", { desistenteEm: "2026-10-16" })],
        turmas: [
          {
            id: "t1",
            horarios: aulasDaSemana("t1", 5).map((horario) => ({
              ...horario,
              diasSemana: [1, 2, 4, 5],
            })),
          },
        ],
        regras: [regra({ aulasPorDia: 9 })],
        feriados: [{ dia: "2026-10-12", nome: "QA Feriado" }],
        faltas: faltasDe("a1", 30),
      }),
    );
    expect(alerta).toMatchObject({ horasLetivas: 72, limiteFaltas: 14 });
    expect(
      alertasDeFrequencia(
        base({ turmas: [], regras: [regra({ aulasPorDia: 9 })], faltas: faltasDe("a1", 30) }),
      ),
    ).toEqual([]);
  });

  it("cada benefício usa a carga diária configurada sem alterar as faltas gravadas", () => {
    const alertas = alertasDeFrequencia(
      base({
        regras: [regra(), regra({ id: "b2", aulasPorDia: 9 })],
        chamadas: [{ dia: "2026-10-01", turmaId: "t1", aulas: 0, alunoIds: ["a1"] }],
        faltas: faltasDe("a1", 40),
      }),
    );
    expect(alertas.map((alerta) => [alerta.horasLetivas, alerta.aulasFaltadas])).toEqual([
      [110, 40],
      [198, 40],
    ]);
  });

  it("não alerta até o limite e alerta na falta seguinte", () => {
    expect(alertasDeFrequencia(base({ faltas: faltasDe("a1", 22) }))).toEqual([]);
    expect(alertasDeFrequencia(base({ faltas: faltasDe("a1", 23) }))).toEqual([
      {
        beneficioId: "b1",
        beneficioNome: "Benefício A",
        percentualMinimoFrequencia: 80,
        aulasPorDia: null,
        faltasJustificadasContam: false,
        alunoId: "a1",
        aulasFaltadas: 23,
        aulasJustificadas: 0,
        horasLetivas: 110,
        limiteFaltas: 22,
        diasLetivos: 22,
        aulasDeReferencia: 5,
      },
    ]);
  });

  it("o percentual configurado muda o limite e o alerta na mesma proporção", () => {
    const faltas = faltasDe("a1", 25);
    const limite = (percentual: number) =>
      alertasDeFrequencia(
        base({ faltas, regras: [regra({ percentualMinimoFrequencia: percentual })] }),
      );
    expect(limite(80)).toHaveLength(1);
    expect(limite(80)[0]?.limiteFaltas).toBe(22);
    expect(limite(75)).toEqual([]);
    expect(limite(90)[0]?.limiteFaltas).toBe(11);
    expect(limite(100)[0]?.limiteFaltas).toBe(0);
  });

  it("cada benefício aplica a própria regra, e os inativos ficam de fora", () => {
    const regras = [
      regra({ id: "b1", nome: "Benefício A", percentualMinimoFrequencia: 80 }),
      regra({
        id: "b2",
        nome: "Benefício B",
        percentualMinimoFrequencia: 90,
        faltasJustificadasContam: true,
      }),
      regra({ id: "b3", nome: "Benefício C", percentualMinimoFrequencia: 90, ativo: false }),
    ];
    // 15 sem justificativa e 10 justificadas: A conta 15 (limite 22), B conta 25 (limite 11).
    const alertas = alertasDeFrequencia(base({ regras, faltas: faltasDe("a1", 25, 10) }));
    expect(alertas.map((alerta) => alerta.beneficioId)).toEqual(["b2"]);
    expect(alertas[0]).toMatchObject({
      beneficioNome: "Benefício B",
      aulasFaltadas: 25,
      aulasJustificadas: 10,
      limiteFaltas: 11,
    });
  });

  it("faltas justificadas só entram na conta quando o benefício manda", () => {
    const sem = regra({ faltasJustificadasContam: false });
    const com = regra({ faltasJustificadasContam: true });
    expect(alertasDeFrequencia(base({ regras: [sem], faltas: faltasDe("a1", 40, 40) }))).toEqual(
      [],
    );
    expect(alertasDeFrequencia(base({ regras: [sem], faltas: faltasDe("a1", 52, 30) }))).toEqual(
      [],
    );
    expect(
      alertasDeFrequencia(base({ regras: [com], faltas: faltasDe("a1", 40, 40) })),
    ).toHaveLength(1);
    expect(alertasDeFrequencia(base({ regras: [sem], faltas: faltasDe("a1", 26, 3) }))).toEqual([
      expect.objectContaining({ aulasFaltadas: 23, aulasJustificadas: 3 }),
    ]);
  });

  it("sem regra ativa não há alerta", () => {
    expect(alertasDeFrequencia(base({ regras: [], faltas: faltasDe("a1", 99) }))).toEqual([]);
    expect(
      alertasDeFrequencia(base({ regras: [regra({ ativo: false })], faltas: faltasDe("a1", 99) })),
    ).toEqual([]);
  });

  it("projeta a grade sem fins de semana nem feriados", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        feriados: [
          { dia: "2026-10-12", nome: "Nossa Senhora Aparecida" },
          { dia: "2026-10-15", nome: "Dia do Professor" },
        ],
        faltas: faltasDe("a1", 40),
      }),
    );
    expect(alerta?.horasLetivas).toBe(100);
    expect(alerta?.limiteFaltas).toBe(20);
  });

  it("usa o retrato das aulas nos dias com chamada salva", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        chamadas: [
          { dia: "2026-10-01", turmaId: "t1", aulas: 3, alunoIds: ["a1"] },
          // Sábado letivo salvo entra com as aulas registradas.
          { dia: "2026-10-03", turmaId: "t1", aulas: 4, alunoIds: ["a1"] },
        ],
        faltas: faltasDe("a1", 40),
      }),
    );
    // 110 - 5 (quinta, dia 1) + 3 + 4 do sábado.
    expect(alerta?.horasLetivas).toBe(112);
  });

  it("dia com chamada em que o aluno não constava não soma aulas", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        chamadas: [{ dia: "2026-10-01", turmaId: "t1", aulas: 5, alunoIds: [] }],
        faltas: faltasDe("a1", 40),
      }),
    );
    expect(alerta?.horasLetivas).toBe(105);
  });

  it("não reduz o limite por falta do retrato das aulas em uma chamada antiga", () => {
    expect(
      alertasDeFrequencia(
        base({
          chamadas: [{ dia: "2026-10-01", turmaId: "t1", aulas: 0, alunoIds: ["a1"] }],
          faltas: faltasDe("a1", 22),
        }),
      ),
    ).toEqual([]);
  });

  it("usa a grade quando todas as chamadas do mês estão sem retrato de aulas", () => {
    const chamadas = diasDoMes("2026-10")
      .filter((dia) => diaDaSemanaIso(dia) <= 5)
      .map((dia) => ({ dia, turmaId: "t1", aulas: 0, alunoIds: ["a1"] }));
    expect(alertasDeFrequencia(base({ chamadas, faltas: faltasDe("a1", 23) }))).toEqual([
      expect.objectContaining({ horasLetivas: 110, limiteFaltas: 22, aulasFaltadas: 23 }),
    ]);
  });

  it("recupera as aulas do sábado letivo salvo sem retrato", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        chamadas: [{ dia: "2026-10-03", turmaId: "t1", aulas: 0, alunoIds: ["a1"] }],
        faltas: faltasDe("a1", 30),
      }),
    );
    expect(alerta).toMatchObject({ horasLetivas: 115, limiteFaltas: 23 });
  });

  it("recupera a grade da turma da chamada antiga, mesmo depois de transferência", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        alunos: [aluno("a1", { turmaId: "t2" })],
        turmas: [
          { id: "t1", horarios: aulasDaSemana("t1", 5) },
          { id: "t2", horarios: aulasDaSemana("t2", 1) },
        ],
        chamadas: [{ dia: "2026-10-01", turmaId: "t1", aulas: 0, alunoIds: ["a1"] }],
        faltas: faltasDe("a1", 10),
      }),
    );
    expect(alerta).toMatchObject({ horasLetivas: 26, limiteFaltas: 5 });
  });

  it("para de projetar aulas depois da desistência", () => {
    const [alerta] = alertasDeFrequencia(
      base({
        alunos: [aluno("a1", { desistenteEm: "2026-10-16" })],
        faltas: faltasDe("a1", 40),
      }),
    );
    // Dias úteis de 1 a 15 de outubro: 11 dias.
    expect(alerta?.horasLetivas).toBe(55);
  });

  it("ignora aluno inativo e aluno sem faltas", () => {
    expect(
      alertasDeFrequencia(
        base({
          alunos: [aluno("a1", { ativo: false }), aluno("a2")],
          faltas: faltasDe("a1", 40),
        }),
      ),
    ).toEqual([]);
  });

  it("turma sem aulas na grade e sem chamada não gera alerta", () => {
    expect(
      alertasDeFrequencia(
        base({ turmas: [{ id: "t1", horarios: [] }], faltas: faltasDe("a1", 5) }),
      ),
    ).toEqual([]);
  });
});

function alertaDe(extras: Partial<AlertaFrequenciaBeneficio> = {}): AlertaFrequenciaBeneficio {
  return {
    beneficioId: "b1",
    beneficioNome: "Pé-de-Meia",
    percentualMinimoFrequencia: 80,
    faltasJustificadasContam: false,
    alunoId: "a1",
    aulasPorDia: 9,
    aulasFaltadas: 28,
    aulasJustificadas: 0,
    horasLetivas: 186,
    limiteFaltas: 37,
    diasLetivos: 22,
    aulasDeReferencia: 9,
    ...extras,
  };
}

describe("frases do alerta", () => {
  it("resume faltas e limite em aulas, com frequência estimada e mínimo em porcentagem", () => {
    const frases = frasesDoAlerta(alertaDe());
    expect(frases.faltas).toBe("Faltas: 28/186 aulas · Limite: 37.");
    expect(frases.margem).toBe("9 aulas até o limite.");
    expect(frases.frequencia).toBe("Frequência estimada: 84,9% · Mínimo: 80%.");
    expect(frases.justificadas).toBeNull();
  });

  it("diz quando o limite já foi passado e quando não resta aula", () => {
    expect(frasesDoAlerta(alertaDe({ aulasFaltadas: 40 })).margem).toBe("3 aulas acima do limite.");
    expect(frasesDoAlerta(alertaDe({ aulasFaltadas: 37 })).margem).toBe("No limite de faltas.");
    expect(frasesDoAlerta(alertaDe({ aulasFaltadas: 36 })).margem).toBe("1 aula até o limite.");
  });

  it("usa o total de aulas do mês com cargas variadas, sem converter em dias", () => {
    const frases = frasesDoAlerta(
      alertaDe({ aulasPorDia: null, aulasDeReferencia: null, horasLetivas: 124, limiteFaltas: 24 }),
    );
    expect(frases.faltas).toBe("Faltas: 28/124 aulas · Limite: 24.");
    expect(frases.frequencia).toBe("Frequência estimada: 77,4% · Mínimo: 80%.");
    expect(frases.margem).toBe("4 aulas acima do limite.");
  });

  it("separa a falta justificada desconsiderada da conta", () => {
    expect(frasesDoAlerta(alertaDe({ aulasJustificadas: 1 })).justificadas).toBe(
      "1 aula justificada desconsiderada.",
    );
    expect(
      frasesDoAlerta(alertaDe({ aulasJustificadas: 2, faltasJustificadasContam: true }))
        .justificadas,
    ).toBe("2 aulas justificadas incluídas.");
  });

  it("resume o mês preservando os retratos diferentes da carga de 9", () => {
    const alertas = alertasDeFrequencia(
      base({
        regras: [regra({ aulasPorDia: 9 })],
        chamadas: [
          { dia: "2026-10-01", turmaId: "t1", aulas: 7, alunoIds: ["a1"] },
          { dia: "2026-10-02", turmaId: "t1", aulas: 5, alunoIds: [] },
          { dia: "2026-10-03", turmaId: "t1", aulas: 4, alunoIds: ["a1"] },
        ],
        faltas: faltasDe("a1", 50),
      }),
    );
    const alerta = alertas[0];
    expect(alerta).toMatchObject({ horasLetivas: 191, diasLetivos: 22, aulasDeReferencia: 9 });
    if (!alerta) return;
    expect(frasesDoAlerta(alerta).faltas).toBe("Faltas: 50/191 aulas · Limite: 38.");
    expect(frasesDoAlerta(alerta).frequencia).toBe("Frequência estimada: 73,8% · Mínimo: 80%.");
  });
});
