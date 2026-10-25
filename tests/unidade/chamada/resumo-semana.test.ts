// Resumo da semana encerrada: segunda a sábado anteriores quando o dia é domingo.
import { describe, expect, it } from "vitest";
import type { Aluno, Frequencia, Horario, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { resumirSemanaDaTurma, semanaEncerrada } from "@/domain/resumo-semana";

const SEMANA = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "ana",
    nome: parcial.nome ?? "Ana",
    turmaId: parcial.turmaId ?? "turma-a",
    turmaOriginalId: parcial.turmaOriginalId ?? parcial.turmaId ?? "turma-a",
    ordem: parcial.ordem ?? 1,
    ativo: parcial.ativo ?? true,
    desistenteEm: parcial.desistenteEm ?? null,
  };
}

function horario(diasSemana: number[]): Horario {
  return {
    id: "aula-1",
    turmaId: "turma-a",
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana,
    ativo: true,
  };
}

function turma(diasSemana: number[] = [1, 2, 3, 4, 5]): Turma {
  return {
    id: "turma-a",
    serieId: "serie-1",
    nome: "A",
    rotulo: "1º ano A",
    serieNome: "1º ano",
    horarios: [horario(diasSemana)],
  };
}

function frequencia(dia: string, faltas: Frequencia["faltas"], alunos: string[]): Frequencia {
  return {
    dia,
    turmaId: "turma-a",
    revisao: 1,
    atualizadoEm: `${dia}T15:00:00Z`,
    atualizadoPorNome: null,
    faltas,
    alunos,
    aulas: ["aula-1"],
  };
}

function saida(
  parcial: Partial<SaidaAntecipada> & Pick<SaidaAntecipada, "id" | "alunoId" | "dia">,
): SaidaAntecipada {
  return {
    momento: "aula_1",
    horario: "07:30",
    justificativa: null,
    observacao: null,
    texto: null,
    liberadoPorId: null,
    liberadoPorCodigo: null,
    liberadoPorNome: null,
    criadoEm: `${parcial.dia}T15:00:00Z`,
    ...parcial,
  };
}

describe("semana encerrada", () => {
  it("devolve segunda a sábado anteriores quando o dia é domingo", () => {
    expect(semanaEncerrada("2026-10-25")).toEqual(SEMANA);
  });

  it("atravessa a virada do ano", () => {
    expect(semanaEncerrada("2023-01-01")).toEqual([
      "2022-12-26",
      "2022-12-27",
      "2022-12-28",
      "2022-12-29",
      "2022-12-30",
      "2022-12-31",
    ]);
  });

  it("não resume sábado nem segunda", () => {
    expect(semanaEncerrada("2026-10-24")).toBeNull();
    expect(semanaEncerrada("2026-10-19")).toBeNull();
  });
});

describe("resumo da turma", () => {
  const ana = aluno({ id: "ana", nome: "Ana" });
  const bruno = aluno({ id: "bruno", nome: "Bruno", ordem: 2 });
  const diana = aluno({ id: "diana", nome: "Diana", ordem: 3 });
  const carla = aluno({ id: "carla", nome: "Carla", ordem: 4, desistenteEm: "2026-10-19" });
  const deFora = aluno({ id: "fora", nome: "Fora", turmaId: "turma-b" });
  const alunos = [ana, bruno, diana, carla, deFora];
  const lista = ["ana", "bruno", "diana"];

  it("conta faltas, justificadas, pendências, ranking e saídas da turma", () => {
    const resumo = resumirSemanaDaTurma(
      turma(),
      alunos,
      SEMANA,
      [
        frequencia(
          "2026-10-20",
          [
            { alunoId: "ana", horarios: ["aula-1"] },
            { alunoId: "bruno", horarios: ["aula-1"], justificativa: "D" },
          ],
          lista,
        ),
        frequencia("2026-10-22", [{ alunoId: "ana", horarios: ["aula-1"] }], lista),
        {
          ...frequencia("2026-10-19", [], ["fora"]),
          turmaId: "turma-b",
        },
      ],
      [
        saida({ id: "saida-ana", alunoId: "ana", dia: "2026-10-20" }),
        saida({ id: "saida-fora", alunoId: "fora", dia: "2026-10-20" }),
      ],
      [{ dia: "2026-10-21", nome: "Dia do professor" }],
    );

    expect(resumo.chamadasSalvas).toEqual(["2026-10-20", "2026-10-22"]);
    expect(resumo.pendencias).toEqual(["2026-10-19", "2026-10-23"]);
    expect(resumo.totais).toEqual({ faltas: 2, justificadas: 1, presentes: 3 });
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-20")).toMatchObject({
      salva: true,
      previsto: true,
      faltas: 1,
      justificadas: 1,
      presentes: 1,
      saidas: 1,
    });
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-21")).toMatchObject({
      feriado: "Dia do professor",
      previsto: false,
      salva: false,
    });
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-24")).toMatchObject({
      previsto: false,
      salva: false,
      feriado: null,
    });
    expect(resumo.alunos.map((item) => [item.nome, item.faltas, item.justificadas])).toEqual([
      ["Ana", 2, 0],
      ["Bruno", 0, 1],
    ]);
    expect(resumo.saidas.map((item) => item.alunoId)).toEqual(["ana"]);
    expect(resumo.saidas[0]?.momento).toBe("1ª aula");
  });

  it("trata o sábado pela grade e pela chamada já salva", () => {
    const semGrade = resumirSemanaDaTurma(
      turma(),
      [ana],
      SEMANA,
      [frequencia("2026-10-24", [{ alunoId: "ana", horarios: ["aula-1"] }], ["ana"])],
      [],
      [],
    );
    expect(semGrade.dias.find((dia) => dia.dia === "2026-10-24")).toMatchObject({
      previsto: false,
      salva: true,
      faltas: 1,
    });
    expect(semGrade.pendencias).not.toContain("2026-10-24");
    expect(semGrade.chamadasSalvas).toContain("2026-10-24");

    const comGrade = resumirSemanaDaTurma(turma([1, 2, 3, 4, 5, 6]), [ana], SEMANA, [], [], []);
    expect(comGrade.dias.find((dia) => dia.dia === "2026-10-24")).toMatchObject({
      previsto: true,
      salva: false,
    });
    expect(comGrade.pendencias).toContain("2026-10-24");
  });

  it("não gera pendência em turma sem aluno ativo", () => {
    const resumo = resumirSemanaDaTurma(turma(), [aluno({ ativo: false })], SEMANA, [], [], []);
    expect(resumo.pendencias).toEqual([]);
    expect(resumo.dias.every((dia) => !dia.previsto)).toBe(true);
  });
});
