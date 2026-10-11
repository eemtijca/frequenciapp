// Cópia de horários: validação, conflitos e gravação conjunta com a auditoria.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client";

interface Aula {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  disciplinas: unknown;
  ativo: boolean;
}

interface Turma {
  id: string;
  nome: string;
  serie: { nome: string };
}

interface Auditoria {
  usuarioId: string;
  acao: string;
  alvo: string;
}

const dados = vi.hoisted(() => ({
  origemId: "8acfe783-ecbe-445c-8a01-f65c6a8f1611",
  destinoId: "406f23e2-ff96-43e2-a268-37704f55d3b0",
  turmas: [] as Turma[],
  aulas: [] as Aula[],
  auditorias: [] as Auditoria[],
}));

const transacao = vi.hoisted(() => ({
  turma: {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      dados.turmas.filter((turma) => where.id.in.includes(turma.id)),
    ),
  },
  horario: {
    findMany: vi.fn(async ({ where }: { where: { turmaId: string } }) =>
      dados.aulas
        .filter((aula) => aula.turmaId === where.turmaId)
        .sort((a, b) => a.ordem - b.ordem),
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { turmaId: string; ordem: { in: number[] } } }) =>
        dados.aulas.find(
          (aula) => aula.turmaId === where.turmaId && where.ordem.in.includes(aula.ordem),
        ) ?? null,
    ),
    createManyAndReturn: vi.fn(async ({ data }: { data: Omit<Aula, "id">[] }) => {
      const criadas = data.map((aula) => ({
        ...aula,
        id: `copia-${aula.ordem}`,
        diasSemana: [...aula.diasSemana],
      }));
      dados.aulas.push(...criadas);
      // O banco não garante a ordem dos registros retornados pela inserção em lote.
      return [...criadas].reverse();
    }),
  },
  auditoria: {
    create: vi.fn(async ({ data }: { data: Auditoria }) => {
      dados.auditorias.push(data);
      return data;
    }),
  },
}));

const executarTransacao = vi.hoisted(() =>
  vi.fn(async (operacao: (tx: typeof transacao) => Promise<unknown>) => {
    const aulasAntes = structuredClone(dados.aulas);
    const auditoriasAntes = structuredClone(dados.auditorias);
    try {
      return await operacao(transacao);
    } catch (erro) {
      dados.aulas = aulasAntes;
      dados.auditorias = auditoriasAntes;
      throw erro;
    }
  }),
);

vi.mock("@/infra/banco", () => ({
  banco: () => ({ $transaction: executarTransacao }),
}));

import { copiarHorarios } from "@/application/horarios";

const admin = { id: "35f917a7-8b72-4c06-b4b1-6b1d5ef0d4d9" };
const entrada = { turmaOrigemId: dados.origemId, turmaDestinoId: dados.destinoId };

function aula(origem: boolean, ordem: number, ativo = true): Aula {
  return {
    id: `QA-${origem ? "origem" : "destino"}-${ordem}`,
    turmaId: origem ? dados.origemId : dados.destinoId,
    ordem,
    inicio: ordem === 1 ? "07:00" : "07:50",
    fim: ordem === 1 ? "07:50" : "08:40",
    diasSemana: ordem === 1 ? [1, 3, 6] : [2, 4, 5],
    disciplinas:
      ordem === 1
        ? { "1": "Português", "3": "Matemática", "6": "Artes" }
        : { "2": "Física", "4": "Química", "5": "História" },
    ativo,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dados.turmas = [
    { id: dados.origemId, nome: "A", serie: { nome: "1ª série" } },
    { id: dados.destinoId, nome: "B", serie: { nome: "1ª série" } },
  ];
  dados.aulas = [aula(true, 2, false), aula(true, 1)];
  dados.auditorias = [];
});

describe("cópia atômica da grade", () => {
  it("preserva todas as aulas, inclusive as inativas, e devolve os novos ids em ordem", async () => {
    const origemAntes = structuredClone(dados.aulas);
    const resultado = await copiarHorarios(admin, entrada);

    expect(resultado).toEqual(
      [...origemAntes]
        .sort((a, b) => a.ordem - b.ordem)
        .map((item) => ({ ...item, id: `copia-${item.ordem}`, turmaId: dados.destinoId })),
    );
    expect(dados.aulas.filter((item) => item.turmaId === dados.origemId)).toEqual(origemAntes);
    expect(transacao.horario.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(transacao.auditoria.create).toHaveBeenCalledWith({
      data: {
        usuarioId: admin.id,
        acao: "horario.copiar",
        alvo: "1ª série A para 1ª série B: 2 aulas",
      },
    });
    expect(executarTransacao).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(transacao.horario.findMany).toHaveBeenCalledWith({
      where: { turmaId: dados.origemId },
      orderBy: { ordem: "asc" },
    });
  });

  it("mantém as aulas do destino com outras ordens", async () => {
    const existente = aula(false, 3);
    dados.aulas.push(existente);
    const resultado = await copiarHorarios(admin, entrada);
    expect(resultado.map((item) => item.ordem)).toEqual([1, 2]);
    expect(dados.aulas.filter((item) => item.turmaId === dados.destinoId)).toHaveLength(3);
    expect(dados.aulas.find((item) => item.id === existente.id)).toEqual(existente);
  });

  it.each([true, false])(
    "recusa a grade inteira se uma ordem estiver ocupada, ativa %s",
    async (ativo) => {
      dados.aulas.push(aula(false, 2, ativo));
      const antes = structuredClone(dados.aulas);
      await expect(copiarHorarios(admin, entrada)).rejects.toMatchObject({
        status: 409,
        message: "A turma de destino já tem a aula 2. Nenhuma aula foi copiada.",
      });
      expect(dados.aulas).toEqual(antes);
      expect(transacao.horario.createManyAndReturn).not.toHaveBeenCalled();
      expect(transacao.auditoria.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [dados.origemId, "Turma de origem não encontrada."],
    [dados.destinoId, "Turma de destino não encontrada."],
  ])("recusa turma ausente antes de inserir: %s", async (id, mensagem) => {
    dados.turmas = dados.turmas.filter((turma) => turma.id !== id);
    await expect(copiarHorarios(admin, entrada)).rejects.toMatchObject({
      status: 404,
      message: mensagem,
    });
    expect(transacao.horario.createManyAndReturn).not.toHaveBeenCalled();
    expect(transacao.auditoria.create).not.toHaveBeenCalled();
  });

  it("recusa origem vazia sem alterar as aulas já existentes no destino", async () => {
    dados.aulas = [aula(false, 3)];
    const antes = structuredClone(dados.aulas);
    await expect(copiarHorarios(admin, entrada)).rejects.toMatchObject({
      status: 400,
      message: "A turma de origem não tem aulas para copiar.",
    });
    expect(dados.aulas).toEqual(antes);
    expect(transacao.horario.createManyAndReturn).not.toHaveBeenCalled();
    expect(transacao.auditoria.create).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    "turma",
    {},
    { ...entrada, turmaOrigemId: "inválida" },
    { ...entrada, turmaDestinoId: "inválida" },
    { ...entrada, turmaDestinoId: dados.origemId },
    { ...entrada, turmaDestinoId: dados.origemId.toUpperCase() },
  ])("valida ambas as turmas antes de abrir a transação: %j", async (corpo) => {
    await expect(copiarHorarios(admin, corpo)).rejects.toMatchObject({ status: 400 });
    expect(executarTransacao).not.toHaveBeenCalled();
    expect(transacao.horario.createManyAndReturn).not.toHaveBeenCalled();
    expect(transacao.auditoria.create).not.toHaveBeenCalled();
  });

  it("preserva o JSON nulo de uma aula antiga", async () => {
    dados.aulas = [{ ...aula(true, 1), disciplinas: null }];
    await copiarHorarios(admin, entrada);
    expect(transacao.horario.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({ disciplinas: Prisma.JsonNull })],
    });
  });

  it("preserva os dias de uma grade antiga sem aplicar as regras do novo cadastro", async () => {
    dados.aulas = [
      { ...aula(true, 1), diasSemana: [1, 7], disciplinas: { "1": "Português", "7": "Artes" } },
    ];
    const resultado = await copiarHorarios(admin, entrada);
    expect(resultado[0]).toMatchObject({
      diasSemana: [1, 7],
      disciplinas: { "1": "Português", "7": "Artes" },
    });
  });

  it("devolve a falha de inserção à transação sem gravar auditoria", async () => {
    const antes = structuredClone(dados.aulas);
    transacao.horario.createManyAndReturn.mockImplementationOnce(async ({ data }) => {
      const primeira = data[0];
      if (primeira) dados.aulas.push({ ...primeira, id: "copia-incompleta" });
      throw new Error("Falha simulada na inserção.");
    });
    await expect(copiarHorarios(admin, entrada)).rejects.toThrow("Falha simulada na inserção.");
    expect(dados.aulas).toEqual(antes);
    expect(transacao.auditoria.create).not.toHaveBeenCalled();
  });

  it("devolve a falha da auditoria para desfazer a cópia inteira", async () => {
    const antes = structuredClone(dados.aulas);
    transacao.auditoria.create.mockRejectedValueOnce(new Error("Falha simulada na auditoria."));
    await expect(copiarHorarios(admin, entrada)).rejects.toThrow("Falha simulada na auditoria.");
    expect(transacao.horario.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(dados.aulas).toEqual(antes);
    expect(dados.auditorias).toEqual([]);
  });
});
