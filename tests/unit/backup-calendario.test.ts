// Proteção do calendário na mesclagem de cópias antigas e atuais, sem apagar histórico.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => ({
  feriados: [] as { dia: Date; nome: string }[],
  chamadaSalva: false,
  parcialSalva: false,
  refazer: false,
}));
const transacao = vi.hoisted(() => ({
  feriado: {
    findMany: vi.fn(() => dados.feriados),
    create: vi.fn(({ data }: { data: { dia: Date; nome: string } }) => data),
  },
  justificativa: { findMany: vi.fn(() => []) },
  liberador: { findMany: vi.fn(() => []) },
  serie: { findMany: vi.fn(() => []) },
  turma: { findMany: vi.fn(() => []) },
  horario: { findMany: vi.fn(() => []) },
  aluno: { findMany: vi.fn(() => []) },
  usuario: { findMany: vi.fn(() => []) },
  frequencia: {
    findFirst: vi.fn(() => (dados.chamadaSalva ? { id: "chamada" } : null)),
    create: vi.fn(),
  },
  frequenciaParcial: {
    findFirst: vi.fn(() => (dados.parcialSalva ? { id: "parcial" } : null)),
    create: vi.fn(),
  },
}));
const trava = vi.hoisted(() => vi.fn((tarefa: () => Promise<unknown>) => tarefa()));
const conferirTrava = vi.hoisted(() => vi.fn());
vi.mock("@/infra/banco", () => ({ banco: vi.fn() }));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: async (operacao: (tx: typeof transacao) => Promise<unknown>) => {
    if (dados.refazer) await operacao(transacao);
    return operacao(transacao);
  },
}));
vi.mock("@/infra/trava-planilha-frequencia", () => ({
  comTravaPlanilhaFrequencia: trava,
  controleTravaPlanilhaFrequencia: () => ({ conferir: conferirTrava }),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/application/configuracoes", () => ({ lerConfiguracoes: vi.fn() }));
import { importarCopia, type CopiaFrequenciapp } from "@/application/backup";

const admin = { id: "d41d42a1-533d-482d-a78c-d2bf07170219" };
const turmaId = "fa751844-76b1-47e9-9cf7-387df59d2c5b";
const alunoId = "a4d984db-93f6-4204-a8b8-95bbd79c2c50";
const dia = "1990-05-01";

function copia(feriados?: { dia: string; nome: string }[]): CopiaFrequenciapp {
  return {
    formato: "frequenciapp",
    versao: 1,
    series: [],
    turmas: [],
    horarios: [],
    alunos: [],
    frequencias: [],
    saidas: [],
    justificativas: [],
    ...(feriados === undefined
      ? {}
      : {
          configuracoes: { frequenciaPorAula: false, saidaAntecipada: true, feriados },
        }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dados.feriados = [];
  dados.chamadaSalva = false;
  dados.parcialSalva = false;
  dados.refazer = false;
  conferirTrava.mockReset();
});

describe("calendário na restauração da cópia", () => {
  it("preserva o calendário quando a cópia antiga não traz feriados", async () => {
    dados.feriados = [{ dia: new Date(`${dia}T00:00:00Z`), nome: "QA Calendário atual" }];
    await expect(importarCopia(admin, copia())).resolves.toEqual({
      adicionadas: 0,
      identicas: 0,
      conflitos: 0,
    });
    expect(transacao.feriado.create).not.toHaveBeenCalled();
    expect(trava).not.toHaveBeenCalled();
    expect(dados.feriados).toHaveLength(1);
  });

  it("mescla feriados por data civil e mantém o nome vigente diante de divergência", async () => {
    dados.feriados = [{ dia: new Date(`${dia}T00:00:00Z`), nome: "QA Nome atual" }];
    const copiaCompleta = copia([
      { dia, nome: "QA Nome atual" },
      { dia: "1990-05-02", nome: "QA Novo feriado" },
    ]);
    await expect(importarCopia(admin, copiaCompleta)).resolves.toEqual({
      adicionadas: 1,
      identicas: 1,
      conflitos: 0,
    });
    expect(transacao.feriado.create).toHaveBeenCalledWith({
      data: {
        dia: new Date("1990-05-02T12:00:00Z"),
        nome: "QA Novo feriado",
        criadoPorId: admin.id,
      },
      select: { dia: true, nome: true },
    });
    expect(trava).toHaveBeenCalledOnce();
    await expect(
      importarCopia(admin, copia([{ dia, nome: "QA Nome divergente" }])),
    ).resolves.toEqual({
      adicionadas: 0,
      identicas: 0,
      conflitos: 1,
    });
    expect(dados.feriados[0]?.nome).toBe("QA Nome atual");
  });

  it.each(["chamada", "parcial"])("recusa o feriado quando existe %s salva", async (tipo) => {
    dados.chamadaSalva = tipo === "chamada";
    dados.parcialSalva = tipo === "parcial";
    await expect(importarCopia(admin, copia([{ dia, nome: "QA Conflito" }]))).resolves.toEqual({
      adicionadas: 0,
      identicas: 0,
      conflitos: 1,
    });
    expect(transacao.feriado.create).not.toHaveBeenCalled();
  });

  it("conta conflito ao restaurar chamadas em feriado atual", async () => {
    dados.feriados = [{ dia: new Date(`${dia}T00:00:00Z`), nome: "QA Feriado atual" }];
    const historico = copia();
    historico.frequencias = [{ dia, turmaId, revisao: 1, faltas: [] }];
    historico.frequenciasParciais = [
      {
        id: "d7a5ac4e-6a0e-4b0b-82ef-a5890c5d1764",
        alunoId,
        turmaId,
        dia,
        alunoNome: "QA Aluno",
        turmaNome: "QA Turma",
        tipo: "DIA_INTEIRO",
        aulas: [],
        registradoSeduc: false,
        revisao: 1,
      },
    ];
    await expect(importarCopia(admin, historico)).resolves.toEqual({
      adicionadas: 0,
      identicas: 0,
      conflitos: 2,
    });
    expect(transacao.frequencia.create).not.toHaveBeenCalled();
    expect(transacao.frequenciaParcial.create).not.toHaveBeenCalled();
    expect(dados.feriados).toHaveLength(1);
  });

  it("não cria feriado com histórico da própria cópia na mesma data", async () => {
    const historico = copia([{ dia, nome: "QA Conflito interno" }]);
    historico.frequencias = [{ dia, turmaId, revisao: 1, faltas: [] }];
    await expect(importarCopia(admin, historico)).resolves.toMatchObject({ conflitos: 2 });
    expect(transacao.feriado.create).not.toHaveBeenCalled();
  });

  it.each(
    [
      [{ dia: "1990-02-30", nome: "QA Data" }],
      [{ dia: "1899-05-01", nome: "QA Ano" }],
      [{ dia: "2200-05-01", nome: "QA Ano" }],
      [{ dia, nome: " " }],
      [{ dia, nome: "a".repeat(121) }],
      [
        { dia, nome: "QA Primeiro" },
        { dia, nome: "QA Repetido" },
      ],
    ].map((feriados) => ({ feriados })),
  )("recusa calendário inválido antes da mesclagem: %j", async ({ feriados }) => {
    await expect(importarCopia(admin, copia(feriados))).rejects.toThrow(
      "A cópia não está no formato do FrequenciApp.",
    );
    expect(transacao.feriado.findMany).not.toHaveBeenCalled();
    expect(trava).not.toHaveBeenCalled();
  });

  it("não duplica o resultado quando a transação serializável é refeita", async () => {
    dados.refazer = true;
    await expect(importarCopia(admin, copia([{ dia, nome: "QA Nova data" }]))).resolves.toEqual({
      adicionadas: 1,
      identicas: 0,
      conflitos: 0,
    });
  });

  it("interrompe a restauração antes de gravar quando perde a proteção da planilha", async () => {
    conferirTrava.mockImplementation(() => {
      throw new Error("Proteção de envio perdida.");
    });
    await expect(importarCopia(admin, copia([{ dia, nome: "QA Proteção" }]))).rejects.toThrow(
      "Proteção de envio perdida.",
    );
    expect(transacao.feriado.create).not.toHaveBeenCalled();
  });
});
