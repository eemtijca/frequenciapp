// Disciplinas nas cópias JSON: inclusão, mesclagem segura e compatibilidade antiga.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => {
  const serie = { id: "667e579b-0e3b-44b7-9c27-ae5d0cdfb805", nome: "QA Horários", ordem: 1 };
  const turma = { id: "b4dd7409-5ab3-4270-9948-3478ec5b418e", serieId: serie.id, nome: "A" };
  const horario = {
    id: "602a8c26-bbca-44f1-8486-a8a5588ef407",
    turmaId: turma.id,
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2],
    ativo: true,
    disciplinas: { "1": "Português", "2": "Matemática" } as Record<string, string>,
  };
  return { serie, turma, horario, horarios: [horario] };
});
const repositorio = vi.hoisted(() => ({
  feriado: { findMany: vi.fn(() => []) },
  serie: { findMany: vi.fn(() => [dados.serie]) },
  turma: { findMany: vi.fn(() => [dados.turma]) },
  horario: {
    findMany: vi.fn(() => dados.horarios),
    createMany: vi.fn(({ data }: { data: typeof dados.horarios }) => {
      dados.horarios.push(...data);
    }),
  },
  aluno: { findMany: vi.fn(() => []) },
  usuario: { findMany: vi.fn(() => []) },
  frequencia: { findMany: vi.fn(() => []) },
  frequenciaParcial: { findMany: vi.fn(() => []) },
  saidaAntecipada: { findMany: vi.fn(() => []) },
  entradaAtrasada: { findMany: vi.fn(() => []) },
  justificativa: { findMany: vi.fn(() => []) },
  liberador: { findMany: vi.fn(() => []) },
}));
vi.mock("@/infra/banco", () => ({ banco: () => repositorio }));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof repositorio) => Promise<unknown>) => operacao(repositorio),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/application/configuracoes", () => ({
  lerConfiguracoes: () => ({ frequenciaPorAula: false, saidaAntecipada: true }),
}));
import { exportarCopia, importarCopia, type CopiaFrequenciapp } from "@/application/backup";

const admin = { id: "b234e2ee-6824-4a82-9d3b-7bf050e495ad" };

function copia(disciplinas?: Record<string, string>): CopiaFrequenciapp {
  const { disciplinas: omitidas, ...horario } = dados.horario;
  void omitidas;
  return {
    formato: "frequenciapp",
    versao: 1,
    series: [dados.serie],
    turmas: [dados.turma],
    horarios: [{ ...horario, ...(disciplinas === undefined ? {} : { disciplinas }) }],
    alunos: [],
    frequencias: [],
    saidas: [],
    justificativas: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dados.horario.disciplinas = { "1": "Português", "2": "Matemática" };
  dados.horarios = [dados.horario];
});

describe("horários nas cópias de segurança", () => {
  it("exporta nomes por dia junto dos mesmos identificadores e horários", async () => {
    const exportada = await exportarCopia(admin);
    expect(exportada.horarios).toEqual([dados.horario]);
    expect(exportada.versao).toBe(1);
  });

  it("reconhece cópia antiga sem nomes e preserva as disciplinas vigentes", async () => {
    await expect(importarCopia(admin, copia())).resolves.toEqual({
      adicionadas: 0,
      identicas: 3,
      conflitos: 0,
    });
    expect(dados.horario.disciplinas).toEqual({ "1": "Português", "2": "Matemática" });
    expect(repositorio.horario.createMany).not.toHaveBeenCalled();
  });

  it("ignora a ordem das chaves e normaliza espaços ao comparar", async () => {
    await expect(
      importarCopia(admin, copia({ "2": " Matemática ", "1": "Português" })),
    ).resolves.toEqual({
      adicionadas: 0,
      identicas: 3,
      conflitos: 0,
    });
  });

  it.each<Record<string, string>>([{ "1": "História", "2": "Matemática" }, {}])(
    "registra divergência sem substituir ou limpar disciplinas: %j",
    async (disciplinas) => {
      await expect(importarCopia(admin, copia(disciplinas))).resolves.toEqual({
        adicionadas: 0,
        identicas: 2,
        conflitos: 1,
      });
      expect(dados.horario.disciplinas).toEqual({ "1": "Português", "2": "Matemática" });
    },
  );

  it.each([undefined, { "1": "Português", "2": "Matemática" }])(
    "restaura aula ausente com nomes atuais ou mapa vazio legado: %j",
    async (disciplinas) => {
      dados.horarios = [];
      await expect(importarCopia(admin, copia(disciplinas))).resolves.toEqual({
        adicionadas: 1,
        identicas: 2,
        conflitos: 0,
      });
      expect(repositorio.horario.createMany).toHaveBeenCalledWith({
        data: [{ ...dados.horario, disciplinas: disciplinas ?? {} }],
      });
    },
  );

  it.each<Record<string, string>>([
    { "8": "Português" },
    { professor: "QA Nome" },
    { "1": "a".repeat(81) },
    { "3": "Artes" },
  ])("recusa disciplinas inválidas antes de mesclar: %j", async (disciplinas) => {
    await expect(importarCopia(admin, copia(disciplinas))).rejects.toThrow(
      "A cópia não está no formato do FrequenciApp.",
    );
    expect(repositorio.horario.findMany).not.toHaveBeenCalled();
    expect(repositorio.horario.createMany).not.toHaveBeenCalled();
  });
});
