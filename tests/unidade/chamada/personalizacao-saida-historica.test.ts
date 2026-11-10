// Exercita a personalização real com assinatura conferida e rótulo histórico da saída.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({
  turma: vi.fn(),
  criar: vi.fn(),
  existente: vi.fn(),
  invalidar: vi.fn(),
}));
const fixture = vi.hoisted(() => {
  const alunoId = "00000000-0000-4000-8000-000000000001";
  const turmaId = "00000000-0000-4000-8000-000000000002";
  const saidaId = "00000000-0000-4000-8000-000000000003";
  const dia = new Date("2026-06-15T12:00:00Z");
  const aluno = {
    id: alunoId,
    nome: "QA Aluno",
    ativo: true,
    desistenteEm: null,
    turmaId: "B",
    turma: { id: "B", nome: "B", serie: { nome: "Atual" } },
  };
  const saida = {
    id: saidaId,
    alunoId,
    dia,
    criadoEm: dia,
    horario: "09:00",
    momento: "OUTRO",
    texto: null,
    observacao: null,
    justificativa: null,
    turmaHistoricaId: turmaId,
    turmaHistoricaNome: "QA A congelada",
    origemReferencia: "MATRICULA_VIGENTE",
    aulasReferencia: {
      versao: 1,
      aulas: [
        { id: "00000000-0000-4000-8000-000000000004", ordem: 1, inicio: "07:00", fim: "08:00" },
      ],
    },
    assinaturaSeduc: null,
    registradoSeducEm: null,
    revisaoSeduc: 1,
    aluno,
  };
  return { alunoId, turmaId, saidaId, dia, aluno, saida };
});
const tx = vi.hoisted(() => ({
  frequenciaParcial: { findUnique: d.existente, create: d.criar },
  aluno: { findUnique: async () => fixture.aluno },
  turma: { findUniqueOrThrow: d.turma },
  saidaAntecipada: {
    findUnique: async () => ({ dia: fixture.dia }),
    findMany: async () => [fixture.saida],
    updateMany: d.invalidar,
  },
  frequencia: { findMany: async () => [] },
  feriado: { findMany: async () => [] },
}));
vi.mock("@/infra/banco", () => ({ banco: () => tx }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/auditoria", () => ({ auditar: async () => undefined }));
vi.mock("@/application/calendario-letivo", () => ({ exigirDiaLetivo: async () => undefined }));
import { salvarFrequenciaParcial } from "@/application/frequencia-parcial";
import { consultarSaidasParciais } from "@/application/saidas-parciais";
import { banco } from "@/infra/banco";
const usuario = {
  id: "qa",
  nome: "QA",
  email: "qa@escola.exemplo",
  papel: "ADMIN",
  ativo: true,
} as const;
async function entrada() {
  const saidas = await consultarSaidasParciais(banco(), { gte: fixture.dia, lte: fixture.dia });
  const assinatura = saidas[0]?.assinatura;
  expect(assinatura).toMatch(/^[a-f0-9]{64}$/);
  return {
    alunoId: fixture.alunoId,
    turmaId: fixture.turmaId,
    dia: "2026-06-15",
    tipo: "DIA_INTEIRO",
    baseSaida: { id: fixture.saidaId, assinatura },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
  d.existente.mockResolvedValue(null);
  d.criar.mockImplementation(async ({ data }) => ({
    ...data,
    id: "parcial",
    revisao: 1,
    criadoEm: fixture.dia,
    atualizadoEm: fixture.dia,
  }));
});
afterEach(() => vi.useRealTimers());
it.each(["renomeada", "ausente"])("preserva rótulo histórico com cadastro %s", async (estado) => {
  if (estado === "ausente") d.turma.mockRejectedValue(new Error("QA_CADASTRO_AUSENTE"));
  else
    d.turma.mockResolvedValue({ id: fixture.turmaId, nome: "Renomeada", serie: { nome: "Atual" } });
  const resultado = await salvarFrequenciaParcial(usuario, await entrada());
  expect(resultado).toMatchObject({ turmaId: fixture.turmaId, turmaNome: "QA A congelada" });
  expect(d.turma).not.toHaveBeenCalled();
  expect(d.invalidar).toHaveBeenCalledTimes(1);
});
it("recusa assinatura divergente antes de criar personalização", async () => {
  const dados = await entrada();
  dados.baseSaida.assinatura = "0".repeat(64);
  await expect(salvarFrequenciaParcial(usuario, dados)).rejects.toMatchObject({ status: 409 });
  expect(d.criar).not.toHaveBeenCalled();
});
it("recusa revisão divergente do registro existente", async () => {
  d.existente.mockResolvedValue({ revisao: 2 });
  await expect(
    salvarFrequenciaParcial(usuario, { ...(await entrada()), revisao: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  expect(d.criar).not.toHaveBeenCalled();
});
