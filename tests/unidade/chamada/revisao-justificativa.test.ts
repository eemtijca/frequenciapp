// A remoção preserva marcas e retorna o contexto confiável de revisão sem salvar correções.
import { expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ apagar: vi.fn(), alterarMarcas: vi.fn(), confirmar: vi.fn() }));
const tx = vi.hoisted(() => ({
  frequenciaParcial: {
    findUnique: async () => ({
      id: "p",
      alunoId: "a",
      turmaId: "atual",
      dia: new Date("2026-06-15T12:00:00Z"),
      tipo: "JUSTIFICADA",
      revisao: 2,
    }),
    delete: d.apagar,
  },
  frequencia: { findFirst: async () => ({ turmaId: "historica" }), update: d.alterarMarcas },
  falta: { deleteMany: d.alterarMarcas, createMany: d.alterarMarcas },
  alunoDaChamada: { updateMany: d.confirmar },
  saidaAntecipada: { updateMany: vi.fn() },
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/auditoria", () => ({ auditar: async () => undefined }));
import { removerFrequenciaParcial } from "@/application/frequencia-parcial";
it("encaminha revisão à base histórica e preserva marcas de edição posterior", async () => {
  expect(
    await removerFrequenciaParcial(
      { id: "qa", nome: "QA", email: "qa@escola.exemplo", ativo: true, papel: "ADMIN" },
      "p",
      { revisao: 2 },
    ),
  ).toEqual({ revisarChamada: { dia: "2026-06-15", turmaId: "historica" } });
  expect(d.alterarMarcas).not.toHaveBeenCalled();
  expect(d.confirmar).toHaveBeenCalled();
});
