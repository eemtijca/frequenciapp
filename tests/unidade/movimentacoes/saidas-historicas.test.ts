// Confere o filtro histórico pela aplicação real, sem inferir a turma pela matrícula atual.
import { expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    saidaAntecipada: { findMany: d.listar },
    liberador: { findMany: async () => [] },
  }),
}));
import { consultarSaidasParciais } from "@/application/saidas-parciais";
import { listarSaidas } from "@/application/saidas";
it("não deriva aulas nem turma de saída legada pela matrícula atual", async () => {
  const tx = {
    saidaAntecipada: {
      findMany: async () => [
        {
          id: "s",
          alunoId: "a",
          dia: new Date("2026-06-15T12:00:00Z"),
          criadoEm: new Date(),
          horario: "10:00",
          origemReferencia: "DESCONHECIDA",
          aulasReferencia: null,
          turmaHistoricaId: null,
          turmaHistoricaNome: null,
          aluno: {
            nome: "QA",
            turma: {
              id: "B",
              nome: "B",
              serie: { nome: "QA" },
              horarios: [
                {
                  id: "h",
                  ordem: 1,
                  inicio: "07:00",
                  fim: "08:00",
                  ativo: true,
                  diasSemana: [1],
                  disciplinas: null,
                },
              ],
            },
          },
        },
      ],
    },
    frequencia: { findMany: async () => [] },
    feriado: { findMany: async () => [] },
  };
  const resultado = await consultarSaidasParciais(
    tx as unknown as Parameters<typeof consultarSaidasParciais>[0],
    { gte: new Date(), lte: new Date() },
  );
  expect(resultado[0]).toMatchObject({ turmaId: null, aulasConferiveis: false });
});
it("mantém saída em A depois da transferência para B", async () => {
  const linha = {
    id: "s",
    alunoId: "a",
    dia: new Date("2026-06-15T12:00:00Z"),
    criadoEm: new Date(),
    aluno: { turmaId: "B" },
    turmaHistoricaId: "A",
    turmaHistoricaNome: "QA A",
    aulasReferencia: null,
    origemReferencia: "DESCONHECIDA",
  };
  d.listar.mockImplementation(async ({ where }) => {
    if (where.aluno?.turmaId) return where.aluno.turmaId === linha.aluno.turmaId ? [linha] : [];
    return !where.turmaHistoricaId || where.turmaHistoricaId === linha.turmaHistoricaId
      ? [linha]
      : [];
  });
  expect(await listarSaidas({ turmaId: "A" })).toMatchObject([
    { turmaHistoricaId: "A", turmaHistoricaNome: "QA A" },
  ]);
  expect(await listarSaidas({ turmaId: "B" })).toEqual([]);
});
