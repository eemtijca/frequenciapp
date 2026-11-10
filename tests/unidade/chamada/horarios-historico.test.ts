// Recusa a exclusão de aula referenciada por faltas ou pelo retrato da chamada,
// aceita a aula sem histórico e propaga a falha da FK sob concorrência.
import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ excluir: vi.fn(), aula: vi.fn(), auditar: vi.fn() }));
const tx = vi.hoisted(() => ({
  horario: { findUnique: d.aula, delete: d.excluir },
  turma: { findUnique: async () => ({ nome: "A", serie: { nome: "QA" } }) },
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({ turma: { findUnique: async () => ({ nome: "A", serie: { nome: "QA" } }) } }),
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/auditoria", () => ({ auditar: d.auditar }));
import { removerHorario } from "@/application/horarios";
beforeEach(() => {
  d.aula.mockReset();
  d.excluir.mockReset();
  d.auditar.mockReset();
});
it("recusa exclusão de aula sem faltas com retrato histórico", async () => {
  d.aula.mockResolvedValue({
    id: "a",
    turmaId: "t",
    ordem: 1,
    _count: { faltas: 0, aulasChamada: 1 },
  });
  await expect(removerHorario({ id: "qa" }, "a")).rejects.toMatchObject({
    status: 409,
    message: expect.stringContaining("chamadas salvas"),
  });
  expect(d.excluir).not.toHaveBeenCalled();
});
it("recusa exclusão de aula com faltas, mesmo sem retrato", async () => {
  d.aula.mockResolvedValue({
    id: "a",
    turmaId: "t",
    ordem: 1,
    _count: { faltas: 1, aulasChamada: 0 },
  });
  await expect(removerHorario({ id: "qa" }, "a")).rejects.toMatchObject({
    status: 409,
    message: expect.stringContaining("faltas"),
  });
  expect(d.excluir).not.toHaveBeenCalled();
});
it("exclui aula sem faltas e sem retrato, com auditoria", async () => {
  d.aula.mockResolvedValue({
    id: "a",
    turmaId: "t",
    ordem: 1,
    _count: { faltas: 0, aulasChamada: 0 },
  });
  d.excluir.mockResolvedValue({ id: "a" });
  await removerHorario({ id: "qa" }, "a");
  expect(d.excluir).toHaveBeenCalledWith({ where: { id: "a" } });
  expect(d.auditar).toHaveBeenCalledWith(tx, "qa", "horario.excluir", "aula 1 de QA A");
});
it("propaga a recusa da FK quando a referência aparece durante a exclusão", async () => {
  d.aula.mockResolvedValue({
    id: "a",
    turmaId: "t",
    ordem: 1,
    _count: { faltas: 0, aulasChamada: 0 },
  });
  d.excluir.mockRejectedValue({
    code: "P2003",
    meta: { field_name: "aulas_chamada_horario_id_fkey" },
  });
  await expect(removerHorario({ id: "qa" }, "a")).rejects.toMatchObject({ code: "P2003" });
  expect(d.auditar).not.toHaveBeenCalled();
});
