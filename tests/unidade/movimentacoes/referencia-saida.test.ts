// O JSON histórico exige versão, identidade e horários válidos, sem aceitar inferências.
import { expect, it } from "vitest";
import { esquemaAulasReferencia, referenciaSaidaCoerente } from "@/application/referencia-saida";
const id = "00000000-0000-4000-8000-000000000001";
it("distingue referência vazia explícita de desconhecida", () => {
  expect(esquemaAulasReferencia.parse({ versao: 1, aulas: [] })).toEqual({ versao: 1, aulas: [] });
  expect(esquemaAulasReferencia.safeParse(null).success).toBe(false);
  expect(
    referenciaSaidaCoerente({
      origemReferencia: "DESCONHECIDA",
      aulasReferencia: { versao: 1, aulas: [] },
    }),
  ).toBe(false);
  expect(
    referenciaSaidaCoerente({
      origemReferencia: "MATRICULA_VIGENTE",
      turmaHistoricaId: id,
      turmaHistoricaNome: "QA",
      aulasReferencia: { versao: 1, aulas: [] },
    }),
  ).toBe(true);
});
it("aceita referência de chamada histórica somente com retrato completo", () => {
  expect(
    referenciaSaidaCoerente({
      origemReferencia: "CHAMADA_HISTORICA",
      turmaHistoricaId: id,
      turmaHistoricaNome: "QA Ano A",
      aulasReferencia: { versao: 1, aulas: [] },
    }),
  ).toBe(true);
  expect(
    referenciaSaidaCoerente({
      origemReferencia: "CHAMADA_HISTORICA",
      turmaHistoricaId: id,
      turmaHistoricaNome: "QA Ano A",
    }),
  ).toBe(false);
});
it.each(
  [
    [{ id, ordem: 1, inicio: "08:00", fim: "07:00" }],
    [
      { id, ordem: 1, inicio: "07:00", fim: "08:00" },
      { id, ordem: 2, inicio: "08:00", fim: "09:00" },
    ],
    [
      { id, ordem: 1, inicio: "07:00", fim: "08:00" },
      { id: "00000000-0000-4000-8000-000000000002", ordem: 1, inicio: "08:00", fim: "09:00" },
    ],
  ].map((aulas) => ({ aulas })),
)("recusa referência incoerente: %j", ({ aulas }) => {
  expect(esquemaAulasReferencia.safeParse({ versao: 1, aulas }).success).toBe(false);
});
