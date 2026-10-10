// Regressão da mesclagem de presença parcial: compara datas civis do PostgreSQL
// sem transformar meia-noite e meio-dia UTC em conflito de identidade.
import { beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => {
  const serie = { id: "0960a6aa-9697-436b-83dc-86d97b8885b5", nome: "QA Cópia", ordem: 1 };
  const turma = { id: "78c8d624-f7f1-46c0-bfce-d320287816ac", serieId: serie.id, nome: "A" };
  const aluno = {
    id: "5e1f13d8-ae10-4c8a-8c56-974b905d7fc3",
    turmaId: turma.id,
    turmaOriginalId: turma.id,
    nome: "QA Aluno",
    ordem: 1,
    ativo: true,
    desistenteEm: null,
  };
  const parcial = {
    id: "b74edc09-6c9b-4658-b8ec-bcd8938d9951",
    alunoId: aluno.id,
    turmaId: turma.id,
    dia: new Date("2026-06-15T00:00:00Z"),
    alunoNome: "QA Aluno",
    turmaNome: "QA Cópia A",
    tipo: "AULAS",
    turno: null,
    aulas: [2, 3],
    observacao: null,
    registradoSeduc: true,
    registradoSeducEm: new Date("2026-06-15T18:00:00Z"),
    registradoSeducPorId: null,
    registradoSeducPorNome: "QA Coordenação",
    revisao: 2,
    criadoPorId: null,
    atualizadoPorId: null,
    criadoEm: new Date("2026-06-15T16:00:00Z"),
    atualizadoEm: new Date("2026-06-15T18:00:00Z"),
  };
  return { serie, turma, aluno, parcial };
});
const transacao = vi.hoisted(() => ({
  // Trava do calendário (LOCK TABLE) feita pela transação antes de ler.
  $executeRaw: vi.fn(async () => 0),
  feriado: { findMany: vi.fn(() => []) },
  justificativa: { findMany: vi.fn(() => []) },
  liberador: { findMany: vi.fn(() => []) },
  serie: { findMany: vi.fn(() => [dados.serie]) },
  turma: { findMany: vi.fn(() => [dados.turma]) },
  horario: { findMany: vi.fn(() => []) },
  aluno: { findMany: vi.fn(() => [dados.aluno]) },
  usuario: { findMany: vi.fn(() => []) },
  frequenciaParcial: { findMany: vi.fn(() => [dados.parcial]), create: vi.fn() },
}));
vi.mock("@/infra/banco", () => ({ banco: vi.fn(), objetoDoBanco: (nome: string) => nome }));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof transacao) => Promise<unknown>) => operacao(transacao),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/application/configuracoes", () => ({ lerConfiguracoes: vi.fn() }));
import { importarCopia } from "@/application/backup";

function copia() {
  return {
    formato: "frequenciapp",
    versao: 1,
    series: [dados.serie],
    turmas: [dados.turma],
    horarios: [],
    alunos: [dados.aluno],
    frequencias: [],
    saidas: [],
    justificativas: [],
    frequenciasParciais: [
      {
        ...dados.parcial,
        dia: "2026-06-15",
        registradoSeducEm: "2026-06-15T18:00:00.000Z",
        criadoEm: "2026-06-15T16:00:00.000Z",
        atualizadoEm: "2026-06-15T18:00:00.000Z",
      },
    ],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  dados.parcial.dia = new Date("2026-06-15T00:00:00Z");
  dados.parcial.tipo = "AULAS";
  dados.parcial.aulas = [2, 3];
});

describe("restauração idêntica da chamada parcial", () => {
  it("reconhece dia inteiro e preserva a confirmação na cópia", async () => {
    dados.parcial.tipo = "DIA_INTEIRO";
    dados.parcial.aulas = [];
    await expect(importarCopia({ id: dados.serie.id }, copia())).resolves.toEqual({
      adicionadas: 0,
      identicas: 4,
      conflitos: 0,
    });
    expect(transacao.frequenciaParcial.create).not.toHaveBeenCalled();
  });

  it.each([
    { turno: "MANHA", aulas: [] },
    { turno: null, aulas: [1] },
  ])("recusa dia inteiro combinado com turno ou aulas: %j", async (mudanca) => {
    const invalida = copia();
    const registro = invalida.frequenciasParciais[0];
    if (!registro) throw new Error("Registro sintético ausente.");
    Object.assign(registro, { tipo: "DIA_INTEIRO", ...mudanca });
    await expect(importarCopia({ id: dados.serie.id }, invalida)).rejects.toThrow(
      "A cópia não está no formato do FrequenciApp.",
    );
    expect(transacao.frequenciaParcial.findMany).not.toHaveBeenCalled();
    expect(transacao.frequenciaParcial.create).not.toHaveBeenCalled();
  });

  it("reconhece o mesmo dia civil retornado como meia-noite pelo banco", async () => {
    await expect(importarCopia({ id: dados.serie.id }, copia())).resolves.toEqual({
      adicionadas: 0,
      identicas: 4,
      conflitos: 0,
    });
    expect(transacao.frequenciaParcial.create).not.toHaveBeenCalled();
  });
  it("mantém o conflito quando o mesmo código pertence a outro dia civil", async () => {
    dados.parcial.dia = new Date("2026-06-14T00:00:00Z");
    await expect(importarCopia({ id: dados.serie.id }, copia())).resolves.toEqual({
      adicionadas: 0,
      identicas: 3,
      conflitos: 1,
    });
    expect(transacao.frequenciaParcial.create).not.toHaveBeenCalled();
  });
});
