// Disciplinas por dia: validação, atualização parcial e preservação das aulas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { disciplinasDoHorario, mesclarDisciplinas } from "@/domain/horarios-semanais";

const dados = vi.hoisted(() => ({
  horario: {
    id: "70ac446c-c81f-4d03-a46a-088c4c365e01",
    turmaId: "6671a90b-3f09-498f-80e5-77f2e515ae99",
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3],
    disciplinas: { "1": "Português", "2": "Matemática" } as Record<string, string>,
    ativo: true,
  },
}));
const transacao = vi.hoisted(() => ({
  horario: {
    findUnique: vi.fn(() => dados.horario),
    findFirst: vi.fn(() => null),
    update: vi.fn(({ data }: { data: Partial<typeof dados.horario> }) => {
      dados.horario = { ...dados.horario, ...data };
      return dados.horario;
    }),
  },
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    turma: { findUnique: vi.fn(() => ({ nome: "A", serie: { nome: "1ª série" } })) },
  }),
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof transacao) => Promise<unknown>) => operacao(transacao),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
import {
  atualizarHorario,
  esquemaAtualizarHorario,
  esquemaCriarHorario,
} from "@/application/horarios";

beforeEach(() => {
  vi.clearAllMocks();
  dados.horario.diasSemana = [1, 2, 3];
  dados.horario.disciplinas = { "1": "Português", "2": "Matemática" };
  dados.horario.inicio = "07:00";
  dados.horario.fim = "07:50";
  dados.horario.ativo = true;
});

describe("mapa das disciplinas", () => {
  it("lê arquivos antigos e mapas vazios sem exigir nomes", () => {
    for (const valor of [undefined, null, [], "Português", {}])
      expect(disciplinasDoHorario(valor)).toEqual({});
    expect(disciplinasDoHorario({ "1": " Português ", "2": " ", "8": "Física" })).toEqual({
      "1": "Português",
    });
  });

  it("mescla somente as chaves informadas e limpa o nome vazio", () => {
    const original = { "1": "Português", "2": "Matemática" };
    expect(mesclarDisciplinas(original, { "1": " História ", "3": "Ciências" }, [1, 2, 3])).toEqual(
      {
        "1": "História",
        "2": "Matemática",
        "3": "Ciências",
      },
    );
    expect(mesclarDisciplinas(original, { "1": " " }, [1, 2, 3])).toEqual({ "2": "Matemática" });
    expect(original).toEqual({ "1": "Português", "2": "Matemática" });
  });

  it("mantém os dias omitidos e remove nomes de dias desmarcados", () => {
    expect(mesclarDisciplinas({ "1": "Português", "2": "Matemática" }, undefined, [2, 3])).toEqual({
      "2": "Matemática",
    });
  });
});

describe("validação dos horários semanais", () => {
  const entrada = {
    turmaId: "6671a90b-3f09-498f-80e5-77f2e515ae99",
    ordem: 1,
    inicio: "07:00",
    fim: "07:50",
    diasSemana: [1, 2, 3],
  };

  it("aceita horários antigos, nomes por dia e campos vazios", () => {
    expect(esquemaCriarHorario.safeParse(entrada).success).toBe(true);
    const horario = esquemaCriarHorario.parse({
      ...entrada,
      disciplinas: { "1": " Português ", "2": "" },
    });
    expect(horario.disciplinas).toEqual({ "1": "Português", "2": "" });
    expect(esquemaAtualizarHorario.safeParse({ disciplinas: { "1": "Matemática" } }).success).toBe(
      true,
    );
  });

  it.each([
    null,
    [],
    "Português",
    { "0": "Português" },
    { "8": "Português" },
    { "01": "Português" },
    { segunda: "Português" },
    { professor: "QA Nome" },
    { "1": 123 },
    { "1": { nome: "Português" } },
    { "1": "a".repeat(81) },
  ])("rejeita mapa ou disciplina inválida: %j", (disciplinas) => {
    expect(esquemaCriarHorario.safeParse({ ...entrada, disciplinas }).success).toBe(false);
    expect(esquemaAtualizarHorario.safeParse({ disciplinas }).success).toBe(false);
  });

  it("rejeita disciplina em dia que a aula não ocorre", () => {
    expect(
      esquemaCriarHorario.safeParse({ ...entrada, disciplinas: { "6": "Artes" } }).success,
    ).toBe(false);
  });

  it("aplica o limite ao nome sem espaços externos", () => {
    expect(
      esquemaCriarHorario.safeParse({ ...entrada, disciplinas: { "1": ` ${"a".repeat(80)} ` } })
        .success,
    ).toBe(true);
  });
});

describe("alteração da disciplina na transação", () => {
  const admin = { id: "88bc0f9f-f6e2-497d-b67a-471030e34e67" };

  it("preserva nomes quando altera somente a janela da aula", async () => {
    dados.horario.ativo = false;
    const horario = await atualizarHorario(admin, dados.horario.id, { inicio: "07:10" });
    expect(horario.disciplinas).toEqual({ "1": "Português", "2": "Matemática" });
    expect(horario.ativo).toBe(false);
    expect(transacao.horario.update).toHaveBeenCalledWith({
      where: { id: dados.horario.id },
      data: { inicio: "07:10" },
    });
  });

  it("grava os nomes sem recriar a aula ou modificar sua janela", async () => {
    const antes = { ...dados.horario };
    const horario = await atualizarHorario(admin, dados.horario.id, {
      disciplinas: { "1": "História", "3": "Biologia" },
    });
    expect(horario).toEqual({
      ...antes,
      disciplinas: { "1": "História", "2": "Matemática", "3": "Biologia" },
    });
  });

  it("limpa um campo e preserva os outros", async () => {
    const horario = await atualizarHorario(admin, dados.horario.id, { disciplinas: { "1": "" } });
    expect(horario.disciplinas).toEqual({ "2": "Matemática" });
  });

  it("retira nomes só dos dias removidos", async () => {
    const horario = await atualizarHorario(admin, dados.horario.id, { diasSemana: [2, 3] });
    expect(horario.disciplinas).toEqual({ "2": "Matemática" });
  });

  it.each([
    { disciplinas: { "6": "Artes" } },
    { diasSemana: [2, 3], disciplinas: { "1": "Artes" } },
  ])("confere a disciplina com os dias vigentes antes de gravar: %j", async (entrada) => {
    await expect(atualizarHorario(admin, dados.horario.id, entrada)).rejects.toThrow(
      "A disciplina deve corresponder a um dia selecionado.",
    );
    expect(transacao.horario.update).not.toHaveBeenCalled();
  });
});
