// Cópias dos benefícios preservam a carga diária e aceitam arquivos anteriores sem apagar regras atuais.
import { beforeEach, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => ({
  regras: [
    {
      nome: "QA Benefício",
      percentualMinimoFrequencia: 80,
      aulasPorDia: 9 as number | null,
      faltasJustificadasContam: false,
      ativo: true,
    },
  ],
}));
const repositorio = vi.hoisted(() => ({
  $executeRaw: vi.fn(async () => 0),
  feriado: { findMany: vi.fn(() => []) },
  serie: { findMany: vi.fn(() => []) },
  turma: { findMany: vi.fn(() => []) },
  horario: { findMany: vi.fn(() => []) },
  aluno: { findMany: vi.fn(() => []) },
  usuario: { findMany: vi.fn(() => []) },
  frequencia: { findMany: vi.fn(() => []) },
  frequenciaParcial: { findMany: vi.fn(() => []) },
  saidaAntecipada: { findMany: vi.fn(() => []) },
  entradaAtrasada: { findMany: vi.fn(() => []) },
  justificativa: { findMany: vi.fn(() => []) },
  liberador: { findMany: vi.fn(() => []) },
  beneficioFrequencia: {
    findMany: vi.fn(() => dados.regras),
    create: vi.fn(async ({ data }: { data: (typeof dados.regras)[number] }) => {
      dados.regras.push(data);
    }),
  },
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
import { exportarCopia, importarCopia } from "@/application/backup";

const admin = { id: "b234e2ee-6824-4a82-9d3b-7bf050e495ad" };

beforeEach(() => {
  vi.clearAllMocks();
  dados.regras = [
    {
      nome: "QA Benefício",
      percentualMinimoFrequencia: 80,
      aulasPorDia: 9,
      faltasJustificadasContam: false,
      ativo: true,
    },
  ];
});

it("exporta e restaura a quantidade de aulas por dia", async () => {
  const copia = await exportarCopia(admin);
  expect(copia.beneficiosFrequencia?.[0]?.aulasPorDia).toBe(9);
  dados.regras = [];
  expect(await importarCopia(admin, copia)).toEqual({ adicionadas: 1, identicas: 0, conflitos: 0 });
  expect(dados.regras[0]?.aulasPorDia).toBe(9);
});

it("uma cópia antiga sem carga diária preserva a configuração atual", async () => {
  const copia = await exportarCopia(admin);
  copia.beneficiosFrequencia = copia.beneficiosFrequencia?.map((regra) => {
    const { aulasPorDia: omitida, ...antiga } = regra;
    void omitida;
    return antiga;
  });
  expect(await importarCopia(admin, copia)).toEqual({ adicionadas: 0, identicas: 1, conflitos: 0 });
  expect(dados.regras[0]?.aulasPorDia).toBe(9);
});

it("registra conflito de carga diária sem substituir a regra existente", async () => {
  const copia = await exportarCopia(admin);
  copia.beneficiosFrequencia = copia.beneficiosFrequencia?.map((regra) => ({
    ...regra,
    aulasPorDia: null,
  }));
  expect(await importarCopia(admin, copia)).toEqual({ adicionadas: 0, identicas: 0, conflitos: 1 });
  expect(dados.regras[0]?.aulasPorDia).toBe(9);
});
