// Define quais ajustes de frequência precisam de conferência na Seduc, sem presumir registro integral.
import { expect, it } from "vitest";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import { exigeConferenciaSeduc, type FrequenciaDaChamada } from "@/domain/frequencia-personalizada";

const parcial: FrequenciaParcial = {
  id: "qa-registro",
  alunoId: "qa-aluno",
  alunoNome: "QA Aluno",
  turmaId: "qa-turma",
  turmaNome: "QA Turma",
  dia: "2026-10-22",
  tipo: "TURNO",
  turno: "MANHA",
  aulas: [],
  observacao: null,
  registradoSeduc: false,
  registradoSeducEm: null,
  registradoSeducPorNome: null,
  revisao: 1,
  criadoEm: "2026-10-22T12:00:00Z",
  atualizadoEm: "2026-10-22T12:00:00Z",
};

it.each([
  ["TURNO", true],
  ["AULAS", true],
  ["JUSTIFICADA", true],
  ["DIA_INTEIRO", false],
] as const)("conferência de personalização %s: %s", (tipo, esperado) => {
  expect(
    exigeConferenciaSeduc({
      ...parcial,
      tipo,
      turno: tipo === "TURNO" ? "MANHA" : null,
      aulas: tipo === "AULAS" ? [2, 4] : [],
      justificativa: tipo === "JUSTIFICADA" ? "O" : null,
    }),
  ).toBe(esperado);
});

it.each([
  ["P", [], false],
  ["F", [], false],
  ["FJ", [], true],
  ["S", [], true],
  ["S", ["QA Motivo"], true],
  ["F", ["QA Motivo"], true],
] as const)("conferência da marca %s com motivos %j: %s", (marca, motivos, esperado) => {
  const chamada: FrequenciaDaChamada = {
    ...parcial,
    tipo: "CHAMADA",
    marca,
    descricao: "QA Registro diário",
    justificativas: [...motivos],
    revisaoSeduc: 0,
  };
  expect(exigeConferenciaSeduc(chamada)).toBe(esperado);
});

it("não oferece conferência quando ainda não há frequência salva", () => {
  expect(exigeConferenciaSeduc(undefined)).toBe(false);
});
