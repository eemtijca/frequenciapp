// Contrato da chamada retroativa: composição comprovada dispensa confirmação,
// composição incerta exige motivo e deixa um registro de auditoria na transação.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({
  encontrar: vi.fn(),
  criar: vi.fn(),
  atualizar: vi.fn(),
  composicao: vi.fn(),
  situacoes: vi.fn(),
  ativos: vi.fn(),
  confirmacao: vi.fn(),
  curar: vi.fn(),
  integracao: vi.fn(),
  intencao: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  frequencia: {
    findUnique: d.encontrar,
    create: d.criar,
    updateMany: d.atualizar,
  },
  aluno: { findMany: d.ativos },
  alunoDaChamada: { createMany: vi.fn(), updateMany: vi.fn() },
  aulaDaChamada: { createMany: d.curar },
  falta: { deleteMany: vi.fn(), createMany: vi.fn() },
  confirmacaoHistorica: { create: d.confirmacao },
  integracaoPlanilha: { findUnique: d.integracao },
  intencaoEnvioEscolar: { create: d.intencao },
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    turma: {
      findUnique: async () => ({
        id: turmaId,
        criadoEm: new Date("2026-01-01T12:00:00Z"),
        horarios: [
          {
            id: aulaId,
            ordem: 1,
            inicio: "07:00",
            fim: "08:00",
            diasSemana: [1, 2, 3, 4, 5],
            ativo: true,
            disciplinas: null,
          },
        ],
      }),
    },
    justificativa: { findMany: async () => [] },
  }),
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/application/calendario-letivo", () => ({ exigirDiaLetivo: async () => undefined }));
vi.mock("@/application/justificativas-antecipadas", () => ({
  listarJustificativasAntecipadas: async () => [],
}));
import { salvarFrequencia } from "@/application/frequencias";
const turmaId = "00000000-0000-4000-8000-000000000001";
const outraTurmaId = "00000000-0000-4000-8000-000000000002";
const alunoId = "00000000-0000-4000-8000-000000000003";
const aulaId = "00000000-0000-4000-8000-000000000004";
const identidade = {
  id: turmaId,
  nome: "QA",
  email: "qa@escola.exemplo",
  ativo: true,
  papel: "ADMIN" as const,
};
const dia = "2026-06-15";
const alunoComposicao = {
  id: alunoId,
  turmaId,
  turmaOriginalId: turmaId,
  ativo: true,
  criadoEm: new Date("2026-05-01T12:00:00Z"),
  desistenteEm: null,
};
function linha(alteracoes: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    turmaId,
    dia: new Date(`${dia}T12:00:00Z`),
    revisao: 1,
    atualizadoEm: new Date("2026-06-16T12:00:00Z"),
    criadoPor: { nome: "QA" },
    atualizadoPor: { nome: "QA" },
    alunos: [{ alunoId }],
    faltas: [],
    aulas: [{ horarioId: aulaId }],
    ...alteracoes,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T12:00:00Z"));
  d.encontrar.mockResolvedValue(null);
  d.atualizar.mockResolvedValue({ count: 1 });
  d.composicao.mockResolvedValue([alunoComposicao]);
  d.situacoes.mockResolvedValue([]);
  d.ativos.mockImplementation(
    async ({ where }: { where: { OR?: unknown; id?: unknown; turmaId?: string } }) => {
      if (where.OR) return d.composicao();
      if (where.id) return d.situacoes();
      return [{ id: alunoId }];
    },
  );
  d.criar.mockImplementation(async () => linha());
  d.confirmacao.mockResolvedValue({ id: "confirmacao" });
  d.integracao.mockResolvedValue(null);
  d.intencao.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("permite a chamada passada quando a composição atual comprova a data", async () => {
  const resultado = await salvarFrequencia(identidade, { dia, turmaId, revisao: 0, faltas: [] });
  expect(resultado.situacao).toBe("salvo");
  expect(d.criar).toHaveBeenCalledTimes(1);
  expect(d.confirmacao).not.toHaveBeenCalled();
});
it("recusa com 409 quando o cadastro é posterior à data", async () => {
  d.composicao.mockResolvedValue([
    { ...alunoComposicao, criadoEm: new Date("2026-06-16T12:00:00Z") },
  ]);
  await expect(
    salvarFrequencia(identidade, { dia, turmaId, revisao: 0, faltas: [] }),
  ).rejects.toMatchObject({ status: 409, codigo: "CONFIRMACAO_HISTORICA_NECESSARIA" });
  expect(d.criar).not.toHaveBeenCalled();
  expect(d.confirmacao).not.toHaveBeenCalled();
});
it("recusa quando o aluno está em outro vínculo sem desistência na data", async () => {
  d.composicao.mockResolvedValue([{ ...alunoComposicao, turmaId: outraTurmaId }]);
  await expect(
    salvarFrequencia(identidade, { dia, turmaId, revisao: 0, faltas: [] }),
  ).rejects.toMatchObject({ status: 409, codigo: "CONFIRMACAO_HISTORICA_NECESSARIA" });
});
it("grava a confirmação com motivo e a lista usada na mesma transação", async () => {
  d.composicao.mockResolvedValue([{ ...alunoComposicao, turmaId: outraTurmaId }]);
  await salvarFrequencia(identidade, {
    dia,
    turmaId,
    revisao: 0,
    faltas: [],
    confirmarHistorico: true,
    motivo: "  Chamada lançada no diário de papel  ",
  });
  expect(d.confirmacao).toHaveBeenCalledTimes(1);
  const dados = d.confirmacao.mock.calls[0]?.[0] as {
    data: {
      tipo: string;
      dia: Date;
      turmaId: string;
      autorId: string;
      autorNome: string;
      motivo: string;
      alunosSnapshot: string[];
    };
  };
  expect(dados.data).toMatchObject({
    tipo: "CHAMADA_RETROATIVA",
    turmaId,
    autorId: turmaId,
    autorNome: "QA",
    motivo: "Chamada lançada no diário de papel",
    alunosSnapshot: [alunoId],
  });
  expect(dados.data.dia.toISOString()).toBe(`${dia}T12:00:00.000Z`);
});
it.each([
  ["sem motivo", { confirmarHistorico: true }],
  ["com motivo vazio", { confirmarHistorico: true, motivo: "   " }],
  ["com motivo sem confirmação", { motivo: "Chamada do diário" }],
])("recusa confirmação %s", async (_nome, alteracoes) => {
  await expect(
    salvarFrequencia(identidade, { dia, turmaId, revisao: 0, faltas: [], ...alteracoes }),
  ).rejects.toMatchObject({ status: 400 });
  expect(d.criar).not.toHaveBeenCalled();
  expect(d.confirmacao).not.toHaveBeenCalled();
});
it("edita chamada existente sem consultar a composição atual", async () => {
  d.encontrar.mockResolvedValue(linha({ revisao: 1, alunos: [], aulas: [] }));
  const resultado = await salvarFrequencia(identidade, {
    dia,
    turmaId,
    revisao: 1,
    faltas: [],
  });
  expect(resultado.situacao).toBe("salvo");
  expect(d.composicao).not.toHaveBeenCalled();
  expect(d.curar).not.toHaveBeenCalled();
});
it("repetir a confirmação não duplica chamada nem auditoria", async () => {
  let existente: ReturnType<typeof linha> | null = null;
  d.composicao.mockResolvedValue([{ ...alunoComposicao, turmaId: outraTurmaId }]);
  d.criar.mockImplementation(async () => {
    existente = linha();
    return existente;
  });
  d.encontrar.mockImplementation(async () => existente);
  const pedido = {
    dia,
    turmaId,
    revisao: 0,
    faltas: [],
    confirmarHistorico: true,
    motivo: "Chamada lançada no diário de papel",
  };
  expect((await salvarFrequencia(identidade, pedido)).situacao).toBe("salvo");
  expect((await salvarFrequencia(identidade, pedido)).situacao).toBe("conflito");
  expect(d.criar).toHaveBeenCalledTimes(1);
  expect(d.confirmacao).toHaveBeenCalledTimes(1);
});
