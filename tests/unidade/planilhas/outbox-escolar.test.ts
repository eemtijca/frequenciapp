// Exercita os escritores escolares reais: o commit deve levar a intenção mesmo sem dispatcher.
import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({
  intencao: vi.fn(),
  entrada: vi.fn(),
  integracao: vi.fn(),
  aluno: vi.fn(),
  chamadas: vi.fn(),
  atualizarChamada: vi.fn(),
  faltas: vi.fn(),
  alunosDaChamada: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  liberador: { findFirst: async () => ({ rotulo: "QA" }) },
  aluno: { findUnique: d.aluno },
  entradaAtrasada: { create: d.entrada },
  frequencia: { findMany: d.chamadas, update: d.atualizarChamada },
  falta: { deleteMany: d.faltas, createMany: d.faltas },
  alunoDaChamada: { updateMany: d.alunosDaChamada },
  integracaoPlanilha: { findUnique: d.integracao },
  intencaoEnvioEscolar: { create: d.intencao },
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/auditoria", () => ({ auditar: async () => undefined }));
import { criarEntrada } from "@/application/entradas";
import { aplicarJustificativaEmChamadasSalvas } from "@/application/justificativas-antecipadas";
import type { Prisma } from "../../../generated/prisma/client";
const id = "00000000-0000-4000-8000-000000000001";
const dados = {
  alunoId: id,
  dia: "2026-06-15",
  horario: "08:15",
  momento: "aula_2",
  responsavelRegistroCodigo: "QA",
  motivo: "Transporte",
};
beforeEach(() => {
  vi.clearAllMocks();
  d.entrada.mockResolvedValue({ id });
  d.integracao.mockResolvedValue({
    ativa: true,
    envioAutomatico: true,
    modo: "CONSERVADOR",
    modoCompletoAte: null,
  });
  d.aluno.mockResolvedValue({
    ativo: true,
    turmaId: id,
    turma: { nome: "A", serie: { nome: "QA" } },
  });
});
it("confirma entrada junto com intenção recuperável sem despacho", async () => {
  await criarEntrada(
    { id, nome: "QA", email: "qa@escola.exemplo", ativo: true, papel: "ADMIN" },
    dados,
  );
  expect(d.intencao).toHaveBeenCalledWith({
    data: expect.objectContaining({
      tipo: "ENTRADAS",
      eventoId: id,
      revisaoEvento: 1,
      politica: "AUTOMATICO_CONSERVADOR_V1",
    }),
  });
});
it("justificativa que corrige a chamada grava a intenção no mesmo commit", async () => {
  const dia = new Date("2026-06-15T00:00:00Z");
  d.chamadas.mockResolvedValue([
    {
      id: "chamada-qa",
      dia,
      turmaId: id,
      revisao: 4,
      aulas: [{ horarioId: "aula-1" }],
      faltas: [],
      turma: { horarios: [] },
    },
  ]);
  d.atualizarChamada.mockResolvedValue({ id: "chamada-qa", revisao: 5 });
  await aplicarJustificativaEmChamadasSalvas(
    tx as unknown as Prisma.TransactionClient,
    id,
    [dia],
    "D",
    null,
    "autor-qa",
  );
  expect(d.intencao).toHaveBeenCalledWith({
    data: expect.objectContaining({
      tipo: "FREQUENCIA",
      eventoId: "chamada-qa",
      revisaoEvento: 5,
      dia,
      turmaId: id,
      autorId: "autor-qa",
    }),
  });
  expect(d.atualizarChamada.mock.invocationCallOrder[0]).toBeLessThan(
    d.intencao.mock.invocationCallOrder[0] ?? 0,
  );
});
