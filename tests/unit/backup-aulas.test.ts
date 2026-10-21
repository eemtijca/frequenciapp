// Cópias JSON: retrato das aulas na chamada e dedução em cópias antigas.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => {
  const serie = { id: "11111111-1111-4111-8111-111111111111", nome: "QA Aulas", ordem: 1 };
  const turma = { id: "22222222-2222-4222-8222-222222222222", serieId: serie.id, nome: "A" };
  const aula1 = {
    id: "33333333-3333-4333-8333-333333333333",
    turmaId: turma.id,
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2],
    ativo: true,
  };
  const aula2 = {
    ...aula1,
    id: "44444444-4444-4444-8444-444444444444",
    ordem: 2,
    inicio: "07:50",
    fim: "08:40",
  };
  const aluno = {
    id: "55555555-5555-4555-8555-555555555555",
    turmaId: turma.id,
    turmaOriginalId: turma.id,
    nome: "QA Aluno",
    ordem: 1,
    ativo: true,
    desistenteEm: null,
  };
  return { serie, turma, aula1, aula2, aulas: [aula1, aula2], aluno };
});
const repositorio = vi.hoisted(() => ({
  // Trava do calendário (LOCK TABLE) feita pela transação antes de ler.
  $executeRaw: vi.fn(async () => 0),
  feriado: { findMany: vi.fn(() => []), findFirst: vi.fn(() => null) },
  frequencia: {
    findFirst: vi.fn(() => null),
    findUnique: vi.fn(() => null),
    create: vi.fn(),
  },
  frequenciaParcial: { findFirst: vi.fn(() => null), findMany: vi.fn(() => []) },
  justificativa: { findMany: vi.fn(() => []) },
  liberador: { findMany: vi.fn(() => []) },
  beneficioFrequencia: { findMany: vi.fn(() => []) },
  ordemAlmoco: { findMany: vi.fn(() => []), createMany: vi.fn() },
  serie: { findMany: vi.fn(() => [dados.serie]) },
  turma: { findMany: vi.fn(() => [dados.turma]) },
  horario: { findMany: vi.fn(() => dados.aulas) },
  aluno: { findMany: vi.fn(() => [dados.aluno]) },
  usuario: { findMany: vi.fn(() => []) },
  saidaAntecipada: { findMany: vi.fn(() => []) },
  entradaAtrasada: { findMany: vi.fn(() => []) },
}));
vi.mock("@/infra/banco", () => ({
  banco: () => repositorio,
  objetoDoBanco: (nome: string) => nome,
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof repositorio) => Promise<unknown>) => operacao(repositorio),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/application/configuracoes", () => ({
  lerConfiguracoes: () => ({ frequenciaPorAula: false, saidaAntecipada: true }),
}));
import { importarCopia, type CopiaFrequenciapp } from "@/application/backup";

const admin = { id: "66666666-6666-4666-8666-666666666666" };
const dia = "1990-05-01";

function copia(ajustes: Partial<CopiaFrequenciapp["frequencias"][number]>): CopiaFrequenciapp {
  return {
    formato: "frequenciapp",
    versao: 1,
    series: [dados.serie],
    turmas: [dados.turma],
    horarios: dados.aulas.map((aula) => ({ ...aula })),
    alunos: [dados.aluno],
    frequencias: [
      {
        dia,
        turmaId: dados.turma.id,
        revisao: 1,
        faltas: [{ alunoId: dados.aluno.id, horarioId: dados.aula1.id }],
        alunos: [dados.aluno.id],
        ...ajustes,
      },
    ],
    saidas: [],
    justificativas: [],
  };
}

function retratoCriado(): string[] {
  const chamada = repositorio.frequencia.create.mock.calls[0]?.[0] as {
    data: { aulas: { create: { horarioId: string }[] } };
  };
  return chamada.data.aulas.create.map((item) => item.horarioId).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("retrato das aulas nas cópias de segurança", () => {
  it("importa o retrato gravado na cópia", async () => {
    await importarCopia(admin, copia({ aulas: [dados.aula2.id] }));
    expect(retratoCriado()).toEqual([dados.aula1.id, dados.aula2.id].sort());
  });

  it("deduz o retrato da grade do dia quando a cópia não traz aulas", async () => {
    await importarCopia(admin, copia({}));
    expect(retratoCriado()).toEqual([dados.aula1.id, dados.aula2.id].sort());
  });

  it("acrescenta ao retrato a aula com falta registrada", async () => {
    await importarCopia(admin, copia({ aulas: [dados.aula2.id] }));
    expect(retratoCriado()).toContain(dados.aula1.id);
  });

  it("recusa retrato com aula fora da cópia", async () => {
    const resultado = await importarCopia(
      admin,
      copia({ aulas: ["77777777-7777-4777-8777-777777777777"] }),
    );
    expect(resultado.conflitos).toBe(1);
    expect(repositorio.frequencia.create).not.toHaveBeenCalled();
  });
});
