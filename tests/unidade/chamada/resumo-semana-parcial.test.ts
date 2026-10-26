// Resumo semanal da Chamada Parcial: registros efetivos, pendências e dias sem chamada.
import { describe, expect, it } from "vitest";
import type { Aluno, Horario, Turma } from "@/domain/frequencia";
import type { FrequenciaDaChamada, RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import { resumirSemanaParcial } from "@/domain/resumo-semana-parcial";

const DIAS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];

function aluno(id: string, nome: string, turmaId = "turma-a"): Aluno {
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

function horario(): Horario {
  return {
    id: "aula-1",
    turmaId: "turma-a",
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3, 4, 5, 6],
    ativo: true,
  };
}

function turma(): Turma {
  return {
    id: "turma-a",
    serieId: "serie-a",
    nome: "A",
    rotulo: "1º ano A",
    serieNome: "1º ano",
    horarios: [horario()],
  };
}

function chamada(alunoId: string, dia: string, nome: string): FrequenciaDaChamada {
  return {
    tipo: "CHAMADA",
    id: `chamada:${alunoId}:${dia}`,
    alunoId,
    dia,
    turmaId: "turma-a",
    alunoNome: nome,
    turmaNome: "1º ano A",
    marca: "P",
    descricao: "Dia inteiro",
    justificativas: [],
    registradoSeduc: false,
    registradoSeducEm: null,
    registradoSeducPorNome: null,
    revisao: 1,
    revisaoSeduc: 0,
    criadoEm: `${dia}T12:00:00Z`,
    atualizadoEm: `${dia}T12:00:00Z`,
  };
}

const BRUNO_PARCIAL: RegistroPersonalizado = {
  id: "parcial-bruno",
  alunoId: "bruno",
  dia: "2026-10-19",
  turmaId: "turma-a",
  alunoNome: "Bruno",
  turmaNome: "1º ano A",
  tipo: "AULAS",
  turno: null,
  aulas: [1],
  observacao: null,
  registradoSeduc: false,
  registradoSeducEm: null,
  registradoSeducPorNome: null,
  revisao: 1,
  criadoEm: "2026-10-19T12:00:00Z",
  atualizadoEm: "2026-10-19T12:00:00Z",
};

describe("resumo semanal da Chamada Parcial", () => {
  it("conta situação, tipos, pendências e dias sem chamada", () => {
    const resumo = resumirSemanaParcial(
      turma(),
      [aluno("ana", "Ana"), aluno("bruno", "Bruno")],
      DIAS,
      [chamada("ana", "2026-10-19", "Ana"), BRUNO_PARCIAL],
      [],
    );

    expect(resumo.totais).toEqual({
      ajustes: 1,
      pendentes: 1,
      registrados: 0,
      presencasParciais: 1,
      justificadas: 0,
      saidas: 0,
    });
    expect(resumo.pendenciasSeduc).toHaveLength(1);
    expect(resumo.pendenciasSeduc[0]).toMatchObject({
      alunoNome: "Bruno",
      dia: "2026-10-19",
    });
    expect(resumo.diasSemChamada).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
    expect(resumo.alunos).toEqual([
      expect.objectContaining({
        alunoId: "bruno",
        ajustes: 1,
        pendentes: 1,
        registrados: 0,
        presencasParciais: 1,
      }),
    ]);
    expect(resumo.dias.find((dia) => dia.dia === "2026-10-19")).toMatchObject({
      temChamada: true,
      ajustes: 1,
      pendentes: 1,
      semRegistro: 0,
    });
  });

  it("conta marca FJ e marca S da chamada nos tipos de registro", () => {
    const justificada = chamada("ana", "2026-10-19", "Ana");
    justificada.marca = "FJ";
    justificada.justificativas = ["D"];
    const parcial = chamada("bruno", "2026-10-19", "Bruno");
    parcial.marca = "S";
    const resumo = resumirSemanaParcial(
      turma(),
      [aluno("ana", "Ana"), aluno("bruno", "Bruno")],
      DIAS,
      [justificada, parcial],
      [],
    );
    expect(resumo.totais).toMatchObject({
      ajustes: 2,
      pendentes: 2,
      justificadas: 1,
      presencasParciais: 1,
      saidas: 0,
    });
    expect(resumo.alunos.find((item) => item.alunoId === "ana")).toMatchObject({
      justificadas: 1,
      presencasParciais: 0,
    });
    expect(resumo.alunos.find((item) => item.alunoId === "bruno")).toMatchObject({
      justificadas: 0,
      presencasParciais: 1,
    });
  });

  it("não considera dia sem aula como pendência de chamada", () => {
    const semGrade = { ...turma(), horarios: [] };
    const resumo = resumirSemanaParcial(semGrade, [aluno("ana", "Ana")], DIAS, [], []);
    expect(resumo.diasSemChamada).toEqual([]);
    expect(resumo.dias.every((dia) => !dia.previsto)).toBe(true);
    expect(resumo.dias.every((dia) => dia.semRegistro === 0)).toBe(true);
  });
});
