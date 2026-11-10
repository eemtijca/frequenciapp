// A lista de conferência usa o retrato de aulas da chamada e marca a estimativa
// quando o registro antigo não tem retrato, sem trocar as descrições detalhadas.
import { beforeEach, expect, it, vi } from "vitest";
import { rotuloFrequenciaPersonalizada } from "@/domain/frequencia-personalizada";
const d = vi.hoisted(() => ({ chamadas: vi.fn() }));
const tx = vi.hoisted(() => ({
  frequencia: { findMany: d.chamadas },
  frequenciaParcial: { findMany: async () => [] },
  justificativa: { findMany: async () => [] },
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/application/saidas-parciais", async (original) => ({
  ...(await original<typeof import("@/application/saidas-parciais")>()),
  consultarSaidasParciais: async () => [],
}));
import { listarFrequenciasPersonalizadas } from "@/application/frequencia-personalizada";
const alunoId = "00000000-0000-4000-8000-000000000001";
const turmaId = "00000000-0000-4000-8000-000000000002";
const aulas = [1, 2, 3].map((n) => ({
  id: `a${n}`,
  ordem: n,
  inicio: "07:00",
  fim: "08:00",
  ativo: true,
  diasSemana: [1, 2, 3, 4, 5],
  disciplinas: null,
}));
function chamada(retrato: { horarioId: string }[]) {
  return {
    id: "chamada",
    turmaId,
    dia: new Date("2026-06-15T12:00:00Z"),
    revisao: 1,
    criadoEm: new Date(100),
    atualizadoEm: new Date(100),
    turma: { serie: { nome: "QA" }, nome: "A", horarios: aulas },
    aulas: retrato,
    faltas: [{ alunoId, horarioId: "a2", justificativa: null }],
    alunos: [
      {
        alunoId,
        aluno: { nome: "QA Aluno", desistenteEm: null },
        registradoSeducEm: null,
        revisaoSeduc: 0,
      },
    ],
  };
}
beforeEach(() => {
  d.chamadas.mockReset();
});
it("preserva a descrição detalhada pela ordem do retrato", async () => {
  d.chamadas.mockResolvedValue([chamada([{ horarioId: "a1" }, { horarioId: "a2" }])]);
  const registro = (await listarFrequenciasPersonalizadas({ dia: "2026-06-15" }))[0];
  if (!registro) throw new Error("Registro sintético ausente.");
  expect(registro).toMatchObject({ marca: "S", descricao: "Falta na 2ª aula da Chamada" });
  expect(rotuloFrequenciaPersonalizada(registro)).toBe("Falta na 2ª aula da Chamada");
});
it("marca como estimativa o legado sem retrato, sem trocar a descrição detalhada", async () => {
  d.chamadas.mockResolvedValue([chamada([])]);
  const registro = (await listarFrequenciasPersonalizadas({ dia: "2026-06-15" }))[0];
  if (!registro) throw new Error("Registro sintético ausente.");
  expect(registro).toMatchObject({
    marca: "S",
    descricao: "Falta na 2ª aula da Chamada",
    estimado: true,
  });
  expect(rotuloFrequenciaPersonalizada(registro)).toBe(
    "Falta na 2ª aula da Chamada (estimativa pela grade atual)",
  );
});
