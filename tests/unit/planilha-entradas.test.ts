// Casos de uso da Sheets API com conexão falsa e sem dados de produção.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CABECALHO_ENTRADAS } from "@/domain/planilha-entradas";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";
const dubl = vi.hoisted(() => ({
  lerLinha: vi.fn(),
  chamar: vi.fn(),
  listar: vi.fn(),
  auditar: vi.fn(),
  limitar: vi.fn(),
}));
vi.mock("@/application/planilha-comum", () => ({
  lerLinha: dubl.lerLinha,
  chamarIntegracao: dubl.chamar,
}));
vi.mock("@/application/entradas", async (original) => ({
  ...(await original<object>()),
  listarEntradas: dubl.listar,
}));
vi.mock("@/infra/banco", () => ({ banco: () => ({}) }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/auditoria", () => ({ auditar: dubl.auditar }));
vi.mock("@/infra/auth/limite", () => ({ limiteDeTentativas: dubl.limitar }));
import {
  enviarEntradas,
  prepararAbaEntradas,
  simularEntradas,
} from "@/application/planilha-entradas";
const periodo = { de: "2026-06-15", ate: "2026-06-15" };
const usuario = { id: "usuario" };
let arquivo = "arquivo-qa";
let valores: string[][] = [];
let falhaEnvio = false;
beforeEach(() => {
  vi.clearAllMocks();
  arquivo = "arquivo-qa";
  valores = [CABECALHO_ENTRADAS];
  falhaEnvio = false;
  dubl.limitar.mockResolvedValue(true);
  dubl.lerLinha.mockImplementation(async () => ({
    ativa: true,

    googleRefreshToken: "falso",
    googlePlanilhaId: arquivo,
    esquema: { aba: "Saídas" },
  }));
  dubl.listar.mockResolvedValue([
    {
      id: "registro",
      alunoId: "aluno",
      nome: "QA Aluno",
      turmaId: "turma",
      turmaRotulo: "QA Ano A",
      dia: periodo.de,
      horario: "08:00",
      motivo: "Transporte",
      registradoPorNome: "QA Coordenação",
      criadoEm: "2026-06-15T12:00:00Z",
    },
  ]);
  dubl.chamar.mockImplementation(async (_linha, corpo) => {
    if (corpo.acao === "prepararEntradas")
      return { criada: false, organizada: true, realinhada: false, sheet1: "ausente" };
    if (corpo.acao === "estrutura") return { abas: [{ nome: "Entradas", mesclagens: [] }] };
    if (corpo.acao === "ler")
      return {
        valores,
        formula: [],
        linhaInicial: 1,
        colunaInicial: 1,
        linhasCriadas: [],
        colunasCriadas: [],
      };
    if (falhaEnvio) throw new Error("Rede");
    return { linhasCriadas: 1 };
  });
});
describe("envio de entradas", () => {
  it("a prévia não escreve e a preparação organiza a aba existente", async () => {
    await simularEntradas(usuario, periodo);
    expect(
      dubl.chamar.mock.calls.some((args) => ["aplicar", "criarAba"].includes(args[1].acao)),
    ).toBe(false);
    expect(await prepararAbaEntradas(usuario)).toEqual({
      criada: false,
      organizada: true,
      realinhada: false,
      sheet1: "ausente",
    });
    expect(dubl.chamar).toHaveBeenLastCalledWith(expect.anything(), {
      acao: "prepararEntradas",
      abaSaidas: "Saídas",
    });
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      {},
      usuario.id,
      "planilha.entradas.organizar",
      "aba:Entradas;realinhada:false;Sheet1:ausente",
    );
  });
  it("cria explicitamente só a aba ausente com cabeçalho próprio", async () => {
    dubl.chamar.mockResolvedValueOnce({ criada: true, organizada: true, sheet1: "removida" });
    expect(await prepararAbaEntradas(usuario)).toEqual({
      criada: true,
      organizada: true,
      sheet1: "removida",
    });
    expect(dubl.chamar).toHaveBeenLastCalledWith(expect.anything(), {
      acao: "prepararEntradas",
      abaSaidas: "Saídas",
    });
  });
  it("exige prévia e envia somente criação conservadora sem repetir requisição", async () => {
    await expect(enviarEntradas(usuario, periodo)).rejects.toThrow("prévia");
    const previa = await simularEntradas(usuario, periodo);
    expect(await enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash })).toEqual({
      resultado: "sucesso",
      linhasCriadas: 1,
    });
    expect(dubl.chamar).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        acao: "aplicar",
        aba: "Entradas",
        modoCompleto: false,
        operacoes: [expect.objectContaining({ tipo: "criarLinhas" })],
      }),
    );
  });
  it("recusa dados alterados ou arquivo trocado depois da prévia", async () => {
    const previa = await simularEntradas(usuario, periodo);
    arquivo = "outro-arquivo";
    await expect(
      enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("mudaram");
    arquivo = "arquivo-qa";
    valores.push(["Anotação"]);
    await expect(
      enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("mudaram");
  });
  it("exige autorização Google e impede uso da aba reservada para entradas", async () => {
    dubl.lerLinha.mockResolvedValue({
      ativa: true,
      googleRefreshToken: null,
      googlePlanilhaId: null,
    });
    await expect(simularEntradas(usuario, periodo)).rejects.toThrow("conexão Google");
    dubl.lerLinha.mockResolvedValue({
      ativa: true,

      googleRefreshToken: "falso",
      googlePlanilhaId: "qa",
      esquema: { aba: "Entradas" },
    });
    await expect(simularEntradas(usuario, periodo)).rejects.toThrow("reservada");
  });
  it("recusa períodos longos e falha de leitura sem começar envio", async () => {
    await expect(simularEntradas(usuario, { de: "2026-01-01", ate: "2026-06-15" })).rejects.toThrow(
      "três meses",
    );
    dubl.chamar.mockRejectedValue(new Error("Leitura"));
    await expect(enviarEntradas(usuario, { ...periodo, planoHash: "falso" })).rejects.toThrow(
      "Leitura",
    );
    expect(dubl.auditar).not.toHaveBeenCalled();
  });
  it("falha de escrita exige conferência sem alegar que nada mudou", async () => {
    const previa = await simularEntradas(usuario, periodo);
    falhaEnvio = true;
    await expect(
      enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("confirmar");
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      {},
      usuario.id,
      "planilha.entradas.parcial",
      expect.any(String),
    );
  });
  it("distingue recusa explícita de falta de confirmação e detecta envio incompleto", async () => {
    const previa = await simularEntradas(usuario, periodo);
    dubl.chamar
      .mockResolvedValueOnce({ abas: [{ nome: "Entradas", mesclagens: [] }] })
      .mockResolvedValueOnce({
        valores,
        formula: [],
        linhaInicial: 1,
        colunaInicial: 1,
        linhasCriadas: [],
        colunasCriadas: [],
      })
      .mockRejectedValueOnce(new ErroGoogle("A estrutura da planilha mudou.", true));
    await expect(
      enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("estrutura");
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      {},
      usuario.id,
      "planilha.entradas.falha",
      expect.any(String),
    );
    dubl.chamar
      .mockResolvedValueOnce({ abas: [{ nome: "Entradas", mesclagens: [] }] })
      .mockResolvedValueOnce({
        valores,
        formula: [],
        linhaInicial: 1,
        colunaInicial: 1,
        linhasCriadas: [],
        colunasCriadas: [],
      })
      .mockResolvedValueOnce({ linhasCriadas: 0 });
    await expect(
      enviarEntradas(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("confirmar");
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      {},
      usuario.id,
      "planilha.entradas.parcial",
      expect.any(String),
    );
  });
});
