// Confere exportação real e compatibilidade da referência histórica no contrato JSON v1.
import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ saidas: vi.fn(), criar: vi.fn() }));
const f = vi.hoisted(() => {
  const serie = { id: "11111111-1111-4111-8111-111111111111", nome: "QA Série", ordem: 1 };
  const turma = { id: "22222222-2222-4222-8222-222222222222", nome: "B atual", serieId: serie.id };
  const aluno = {
    id: "33333333-3333-4333-8333-333333333333",
    nome: "QA Aluno",
    turmaId: turma.id,
    turmaOriginalId: turma.id,
    ordem: 1,
    ativo: true,
    desistenteEm: null,
  };
  const referencia = {
    turmaHistoricaId: "44444444-4444-4444-8444-444444444444",
    turmaHistoricaNome: "QA A congelada",
    origemReferencia: "MATRICULA_VIGENTE",
    aulasReferencia: {
      versao: 1,
      aulas: [
        { id: "55555555-5555-4555-8555-555555555555", ordem: 1, inicio: "07:00", fim: "08:00" },
      ],
    },
  };
  const saida = {
    id: "66666666-6666-4666-8666-666666666666",
    alunoId: aluno.id,
    dia: new Date("2026-06-15T12:00:00Z"),
    momento: "aula_1",
    horario: "08:00",
    justificativa: null,
    texto: "QA motivo",
    observacao: null,
    liberadoPorId: null,
    liberadoPorCodigo: null,
    assinaturaSeduc: null,
    registradoSeducEm: null,
    registradoSeducPorNome: null,
    revisaoSeduc: 0,
    ...referencia,
  };
  return { serie, turma, aluno, referencia, saida };
});
const repo = vi.hoisted(() => ({
  serie: { findMany: async () => [f.serie] },
  turma: { findMany: async () => [f.turma] },
  aluno: { findMany: async () => [f.aluno] },
  horario: { findMany: async () => [] },
  frequencia: { findMany: async () => [] },
  frequenciaParcial: { findMany: async () => [] },
  entradaAtrasada: { findMany: async () => [] },
  justificativa: { findMany: async () => [] },
  liberador: { findMany: async () => [] },
  beneficioFrequencia: { findMany: async () => [] },
  ordemAlmoco: { findMany: async () => [] },
  usuario: { findMany: async () => [] },
  feriado: { findMany: async () => [] },
  saidaAntecipada: { findMany: d.saidas, findUnique: async () => null, create: d.criar },
}));
vi.mock("@/infra/banco", () => ({ banco: () => repo }));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof repo) => unknown) => operacao(repo),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: async () => undefined }));
vi.mock("@/application/configuracoes", () => ({
  lerConfiguracoes: async () => ({ frequenciaPorAula: false, saidaAntecipada: true }),
}));
vi.mock("@/application/calendario-letivo", () => ({
  travarCalendario: async () => undefined,
  esquemaCriarFeriado: {},
}));
import { exportarCopia, importarCopia } from "@/application/backup";
beforeEach(() => {
  vi.resetAllMocks();
  d.saidas.mockResolvedValue([f.saida]);
});
it("exporta captura conhecida congelada e a importa sem depender da turma atual", async () => {
  const copia = await exportarCopia({ id: "qa" });
  expect(copia.versao).toBe(1);
  expect(copia.saidas[0]).toMatchObject({ ...f.referencia, dia: "2026-06-15" });
  await expect(importarCopia({ id: "qa" }, copia)).resolves.toMatchObject({ conflitos: 0 });
  expect(d.criar).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining(f.referencia) }),
  );
});
it("exporta legado desconhecido sem fabricar turma nem aulas", async () => {
  d.saidas.mockResolvedValue([
    {
      ...f.saida,
      turmaHistoricaId: null,
      turmaHistoricaNome: null,
      aulasReferencia: null,
      origemReferencia: "DESCONHECIDA",
    },
  ]);
  const copia = await exportarCopia({ id: "qa" });
  expect(copia.saidas[0]).toMatchObject({
    turmaHistoricaId: null,
    turmaHistoricaNome: null,
    aulasReferencia: null,
    origemReferencia: "DESCONHECIDA",
  });
  await expect(importarCopia({ id: "qa" }, copia)).resolves.toMatchObject({ conflitos: 0 });
  expect(d.criar).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ turmaHistoricaId: null, origemReferencia: "DESCONHECIDA" }),
    }),
  );
  expect(d.criar.mock.calls[0]?.[0].data).not.toHaveProperty("aulasReferencia");
});
it("importa cópia v1 antiga sem campos de referência", async () => {
  const { turmaHistoricaId, turmaHistoricaNome, aulasReferencia, origemReferencia, ...antiga } =
    f.saida;
  void turmaHistoricaId;
  void turmaHistoricaNome;
  void aulasReferencia;
  void origemReferencia;
  await expect(
    importarCopia(
      { id: "qa" },
      {
        formato: "frequenciapp",
        versao: 1,
        series: [f.serie],
        turmas: [f.turma],
        alunos: [f.aluno],
        horarios: [],
        frequencias: [],
        justificativas: [],
        saidas: [{ ...antiga, dia: "2026-06-15" }],
      },
    ),
  ).resolves.toMatchObject({ conflitos: 0 });
  expect(d.criar).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ turmaHistoricaId: null, origemReferencia: "DESCONHECIDA" }),
    }),
  );
});
it.each([
  ["JSON escalar", { aulasReferencia: "invalido" }],
  ["campo extra", { aulasReferencia: { ...f.referencia.aulasReferencia, extra: true } }],
  [
    "intervalo invertido",
    {
      aulasReferencia: {
        versao: 1,
        aulas: [{ ...f.referencia.aulasReferencia.aulas[0], inicio: "09:00", fim: "08:00" }],
      },
    },
  ],
  ["conhecida sem turma", { turmaHistoricaId: null, turmaHistoricaNome: null }],
  ["desconhecida com aulas", { origemReferencia: "DESCONHECIDA" }],
  ["origem inválida", { origemReferencia: "INVENTADA" }],
] as const)(
  "recusa explicitamente exportação de histórico inválido: %s",
  async (_nome, mudanca) => {
    d.saidas.mockResolvedValue([{ ...f.saida, ...mudanca }]);
    await expect(exportarCopia({ id: "qa" })).rejects.toMatchObject({
      status: 409,
      message:
        "A referência da saída não permite gerar uma cópia válida. Confira o registro antes de exportar.",
    });
  },
);
