// Protege a automação de movimentações com tentativas duráveis e falhas sintéticas.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { CABECALHO_SAIDAS, detectarEsquemaSaida } from "@/domain/planilha-saidas";
import { CABECALHO_ENTRADAS } from "@/domain/planilha-entradas";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";

const dubl = vi.hoisted(() => ({
  linha: vi.fn(),
  chamar: vi.fn(),
  criar: vi.fn(),
  concluir: vi.fn(),
  pendente: vi.fn(),
  alunos: vi.fn(),
  turmas: vi.fn(),
  saidas: vi.fn(),
  entradas: vi.fn(),
  conferir: vi.fn(),
}));
vi.mock("@/application/planilha-comum", async (original) => ({
  ...(await original<object>()),
  lerLinha: dubl.linha,
  chamarIntegracao: dubl.chamar,
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    sincronizacaoPlanilha: { create: dubl.criar, update: dubl.concluir },
    $queryRaw: dubl.pendente,
  }),
  objetoDoBanco: () => Prisma.raw('"qa"."sincronizacoes_planilha"'),
}));
vi.mock("@/infra/trava-planilha-movimentacoes", () => ({
  comTravaPlanilhaMovimentacoes: <T>(tarefa: () => Promise<T>) => tarefa(),
  controleTravaPlanilhaMovimentacoes: () => ({ conferir: dubl.conferir }),
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn() }));
vi.mock("@/infra/auth/limite", () => ({ limiteDeTentativas: async () => true }));
vi.mock("@/application/alunos", () => ({ listarTodosAlunos: dubl.alunos }));
vi.mock("@/application/turmas", () => ({ listarTodasTurmas: dubl.turmas }));
vi.mock("@/application/saidas", () => ({ listarSaidas: dubl.saidas }));
vi.mock("@/application/entradas", async (original) => ({
  ...(await original<object>()),
  listarEntradas: dubl.entradas,
}));
vi.mock("@/application/justificativas", () => ({ listarJustificativas: async () => [] }));

import {
  aplicarEnvioSaidas,
  enviarSaidasAposRegistro,
  simularEnvioSaidas,
} from "@/application/planilha-saidas";
import { enviarEntradasAposRegistro } from "@/application/planilha-entradas";

const dia = "2026-10-07";
const usuario = { id: "qa-coordenacao" };
let arquivo: string;
let preenchida: boolean;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  dubl.conferir.mockReset();
  arquivo = "qa-arquivo";
  preenchida = false;
  const estrutura = detectarEsquemaSaida({
    nome: "Saídas",
    valores: [CABECALHO_SAIDAS],
    formulas: [],
    linhas: 1,
    colunas: 7,
  });
  dubl.linha.mockImplementation(async () => ({
    ativa: true,
    envioAutomatico: true,
    modo: "CONSERVADOR",
    modoCompletoAte: null,
    googlePlanilhaId: arquivo,
    googleRefreshToken: "qa-token",
    esquema: { aba: "Saídas", abas: [estrutura] },
  }));
  dubl.alunos.mockResolvedValue([{ id: "qa-aluno", nome: "QA Aluno", turmaId: "qa-turma" }]);
  dubl.turmas.mockResolvedValue([{ id: "qa-turma", rotulo: "QA Ano A" }]);
  dubl.saidas.mockResolvedValue([
    {
      id: "qa-saida",
      alunoId: "qa-aluno",
      dia,
      horario: "09:00",
      momento: "aula_1",
      liberadoPorNome: "QA Coordenação",
    },
  ]);
  dubl.entradas.mockResolvedValue([
    {
      id: "qa-entrada",
      nome: "QA Aluno",
      turmaRotulo: "QA Ano A",
      dia,
      horario: "08:00",
      motivo: "Transporte",
      registradoPorNome: "QA Coordenação",
    },
  ]);
  dubl.criar.mockResolvedValue({ id: "qa-tentativa" });
  dubl.concluir.mockResolvedValue(undefined);
  dubl.pendente.mockResolvedValue([]);
  dubl.chamar.mockImplementation(async (_linha, corpo) => {
    if (corpo.acao === "estrutura") return { abas: [{ nome: "Entradas", mesclagens: [] }] };
    if (corpo.acao === "ler")
      return {
        valores:
          corpo.aba === "Entradas"
            ? [CABECALHO_ENTRADAS]
            : [
                CABECALHO_SAIDAS,
                ...(preenchida
                  ? [
                      [
                        "07/10/2026",
                        "QA Aluno",
                        "QA Ano A",
                        "09:00 · 1ª aula",
                        "",
                        "",
                        "QA Coordenação",
                      ],
                    ]
                  : []),
              ],
        formula: [],
        linhaInicial: 1,
        colunaInicial: 1,
        linhasCriadas: [],
        colunasCriadas: [],
      };
    expect(dubl.criar).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resultado: "PARCIAL" }) }),
    );
    return { linhasCriadas: 1, preenchidas: 0, substituidas: 0, removidasLinhas: 0 };
  });
});

describe.each([
  { nome: "saídas", enviar: enviarSaidasAposRegistro },
  { nome: "entradas", enviar: enviarEntradasAposRegistro },
])("salvaguardas automáticas de $nome", ({ enviar }) => {
  it("persiste a tentativa antes de escrever e confirma somente ao terminar", async () => {
    expect(await enviar(usuario, dia)).toBe("enviado");
    expect(dubl.concluir).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resultado: "SUCESSO", linhasCriadas: 1 }),
      }),
    );
  });
  it("impede escrita quando não pode persistir a tentativa", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dubl.criar.mockRejectedValue(new Error("Banco indisponível"));
    expect(await enviar(usuario, dia)).toBe("falhou");
    expect(dubl.chamar.mock.calls.some((args) => args[1].acao === "aplicar")).toBe(false);
  });
  it("não repete automaticamente uma resposta perdida", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = dubl.chamar.getMockImplementation();
    dubl.chamar.mockImplementation(async (...args) => {
      if (args[1].acao === "aplicar") throw new ErroGoogle("Resposta perdida.", false);
      return original?.(...args);
    });
    expect(await enviar(usuario, dia)).toBe("sem_confirmacao");
    expect(dubl.concluir).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resultado: "PARCIAL" }) }),
    );
    dubl.pendente.mockResolvedValue([{ id: "qa-tentativa" }]);
    const chamadas = dubl.chamar.mock.calls.length;
    expect(await enviar(usuario, dia)).toBe("sem_confirmacao");
    expect(dubl.chamar).toHaveBeenCalledTimes(chamadas);
  });
  it("não anuncia sucesso se a quantidade confirmada for menor", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = dubl.chamar.getMockImplementation();
    dubl.chamar.mockImplementation(async (...args) =>
      args[1].acao === "aplicar" ? { linhasCriadas: 0 } : original?.(...args),
    );
    expect(await enviar(usuario, dia)).toBe("sem_confirmacao");
    expect(dubl.concluir).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resultado: "PARCIAL" }) }),
    );
  });
  it("não confirma se perder a proteção depois da escrita", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    dubl.conferir.mockImplementation(() => {
      throw new ErroGoogle("Proteção perdida.", false);
    });
    expect(await enviar(usuario, dia)).toBe("sem_confirmacao");
  });
});

it("a troca de arquivo invalida a prévia de saídas mesmo com conteúdo idêntico", async () => {
  const periodo = { de: dia, ate: dia };
  const previa = await simularEnvioSaidas(usuario, periodo);
  arquivo = "qa-outro-arquivo";
  await expect(
    aplicarEnvioSaidas(usuario, { ...periodo, planoHash: previa.planoHash }),
  ).rejects.toMatchObject({ status: 409 });
  expect(dubl.criar).not.toHaveBeenCalled();
});

it("a conferência manual de saídas registra sucesso mesmo sem escrita", async () => {
  preenchida = true;
  const periodo = { de: dia, ate: dia };
  const previa = await simularEnvioSaidas(usuario, periodo);
  expect(previa.resumo.criar).toBe(0);
  expect(
    await aplicarEnvioSaidas(usuario, { ...periodo, planoHash: previa.planoHash }),
  ).toMatchObject({ resultado: "sucesso" });
  expect(dubl.concluir).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ resultado: "SUCESSO", erro: null }),
    }),
  );
  expect(dubl.chamar.mock.calls.some((args) => args[1].acao === "aplicar")).toBe(false);
});
