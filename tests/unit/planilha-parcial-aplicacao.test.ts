// Prévia e envio parcial com arquivo separado e confirmação de alterações.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";
const dubl = vi.hoisted(() => ({
  linha: vi.fn(),
  chamar: vi.fn(),
  listar: vi.fn(),
  auditar: vi.fn(),
  limitar: vi.fn(),
  conflito: vi.fn(),
  principal: vi.fn(),
  atualizar: vi.fn(),
  escrever: vi.fn(),
  renovar: vi.fn(),
}));
vi.mock("@/application/planilha-comum", () => ({
  lerLinha: dubl.linha,
  chamarIntegracao: dubl.chamar,
  emSequencia: async (tarefa: () => Promise<unknown>) => tarefa(),
}));
vi.mock("@/application/frequencia-personalizada", () => ({
  listarFrequenciasPersonalizadas: dubl.listar,
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    integracaoPlanilha: {
      findFirst: dubl.conflito,
      findUnique: dubl.principal,
      update: dubl.atualizar,
    },
  }),
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: async (tarefa: (tx: unknown) => Promise<unknown>) =>
    tarefa({ integracaoPlanilha: { findUnique: dubl.principal, update: dubl.atualizar } }),
}));
vi.mock("@/infra/auditoria", () => ({ auditar: dubl.auditar }));
vi.mock("@/infra/auth/limite", () => ({ limiteDeTentativas: dubl.limitar }));
vi.mock("@/infra/google-oauth", () => ({ renovarAcesso: dubl.renovar }));
vi.mock("@/infra/trava-planilha-parcial", () => ({
  comTravaPlanilhaParcial: async (
    tarefa: (controle: { signal: AbortSignal; conferir: () => void }) => Promise<unknown>,
  ) => tarefa({ signal: new AbortController().signal, conferir: () => undefined }),
}));
vi.mock("@/infra/google-planilhas-parcial", () => ({ aplicarParciaisGoogle: dubl.escrever }));
import {
  enviarParciais,
  prepararAbaParcial,
  simularParciais,
} from "@/application/planilha-parcial";
const periodo = { de: "2026-06-15", ate: "2026-06-15" };
const usuario = { id: "usuario" };
let arquivo = "arquivo-parcial";
let valores: string[][] = [];
let registros: {
  id: string;
  alunoId: string;
  dia: string;
  alunoNome: string;
  turmaNome: string;
  tipo: string;
  turno: string;
  aulas: number[];
  observacao: null;
  registradoSeduc: boolean;
  registradoSeducEm: null;
  revisao: number;
}[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  arquivo = "arquivo-parcial";
  valores = [[...CABECALHO_PARCIAL]];
  registros = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      alunoId: "00000000-0000-4000-8000-000000000002",
      dia: periodo.de,
      alunoNome: "QA Aluno",
      turmaNome: "QA Ano A",
      tipo: "TURNO",
      turno: "MANHA",
      aulas: [],
      observacao: null,
      registradoSeduc: false,
      registradoSeducEm: null,
      revisao: 1,
    },
  ];
  dubl.limitar.mockResolvedValue(true);
  dubl.conflito.mockResolvedValue(null);
  dubl.principal.mockImplementation(async () => ({
    googlePlanilhaId: arquivo,
    googleRefreshToken: "token",
  }));
  dubl.linha.mockImplementation(async () => ({
    ativa: true,
    googleRefreshToken: "token",
    googlePlanilhaId: arquivo,
    esquema: { aba: "Chamada Parcial" },
  }));
  dubl.listar.mockImplementation(async () => registros);
  dubl.chamar.mockImplementation(async (_linha, corpo) => {
    if (corpo.acao === "estrutura") return { abas: [{ nome: "Chamada Parcial", mesclagens: [] }] };
    if (corpo.acao === "ler")
      return {
        valores,
        formula: [],
        linhaInicial: 1,
        colunaInicial: 1,
        linhasCriadas: [2],
        colunasCriadas: [],
      };
    return {};
  });
  dubl.renovar.mockResolvedValue("acesso");
  dubl.escrever.mockResolvedValue({ linhasCriadas: 1, linhasAtualizadas: 0 });
});
describe("casos de uso da planilha parcial", () => {
  it("a preparação exige confirmação e preserva a aba já existente", async () => {
    await expect(prepararAbaParcial(usuario, {})).rejects.toMatchObject({ status: 400 });
    expect((await prepararAbaParcial(usuario, { confirmacao: true })).criada).toBe(false);
    expect(dubl.chamar.mock.calls.some((args) => args[1].acao === "criarAba")).toBe(false);
  });
  it("cria a aba ausente somente após confirmação e recusa cabeçalho diferente", async () => {
    dubl.chamar.mockResolvedValueOnce({ abas: [] }).mockResolvedValueOnce({});
    expect((await prepararAbaParcial(usuario, { confirmacao: true })).criada).toBe(true);
    expect(dubl.chamar).toHaveBeenCalledWith(expect.anything(), {
      acao: "criarAba",
      nome: "Chamada Parcial",
      cabecalho: CABECALHO_PARCIAL,
    });
    valores = [["Anotação existente"]];
    await expect(prepararAbaParcial(usuario, { confirmacao: true })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("exige prévia e não escreve durante simulação", async () => {
    await expect(enviarParciais(usuario, periodo)).rejects.toMatchObject({ status: 400 });
    const previa = await simularParciais(usuario, periodo);
    expect(previa.novas).toBe(1);
    expect(dubl.escrever).not.toHaveBeenCalled();
    expect(await enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash })).toEqual({
      resultado: "sucesso",
      linhasCriadas: 1,
      linhasAtualizadas: 0,
    });
    expect(dubl.escrever).toHaveBeenCalledTimes(1);
  });
  it("invalida prévia após troca de arquivo, leitura ou confirmação Seduc", async () => {
    const previa = await simularParciais(usuario, periodo);
    arquivo = "outro-arquivo";
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toMatchObject({ status: 409 });
    arquivo = "arquivo-parcial";
    valores.push(["Anotação"]);
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toMatchObject({ status: 409 });
    valores.pop();
    const registro = registros[0];
    if (registro) registro.registradoSeduc = true;
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toMatchObject({ status: 409 });
    expect(dubl.escrever).not.toHaveBeenCalled();
  });
  it("recusa usar o arquivo da frequência ou das saídas", async () => {
    dubl.conflito.mockResolvedValue({ id: "principal" });
    await expect(simularParciais(usuario, periodo)).rejects.toMatchObject({ status: 409 });
    expect(dubl.chamar).not.toHaveBeenCalled();
  });
  it("exige confirmação da atualização de registros já enviados", async () => {
    const inicial = await simularParciais(usuario, periodo);
    valores.push(inicial.criar[0]?.celulas.map((celula) => celula.valor) ?? []);
    const registro = registros[0];
    if (registro) {
      registro.registradoSeduc = true;
      registro.revisao++;
    }
    expect((await simularParciais(usuario, periodo)).bloqueado).toBe(true);
    const previa = await simularParciais(usuario, { ...periodo, atualizarExistentes: true });
    expect(previa.atualizacoes).toBe(1);
    dubl.escrever.mockResolvedValue({ linhasCriadas: 0, linhasAtualizadas: 1 });
    expect(
      await enviarParciais(usuario, {
        ...periodo,
        atualizarExistentes: true,
        planoHash: previa.planoHash,
      }),
    ).toEqual({ resultado: "sucesso", linhasCriadas: 0, linhasAtualizadas: 1 });
  });
  it("não repete envio após resposta perdida e distingue recusa explícita", async () => {
    const previa = await simularParciais(usuario, periodo);
    dubl.escrever.mockRejectedValue(new Error("Resposta perdida"));
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toMatchObject({ status: 502 });
    expect(dubl.escrever).toHaveBeenCalledTimes(1);
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      expect.anything(),
      usuario.id,
      "planilha.parcial.parcial",
      expect.any(String),
    );
    dubl.escrever.mockRejectedValue(new ErroGoogle("Recusa", true));
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toThrow("Recusa");
    expect(dubl.auditar).toHaveBeenLastCalledWith(
      expect.anything(),
      usuario.id,
      "planilha.parcial.falha",
      expect.any(String),
    );
  });
  it("recusa períodos longos sem leituras externas e detecta lote incompleto", async () => {
    await expect(
      simularParciais(usuario, { de: "2026-01-01", ate: "2026-06-15" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(dubl.chamar).not.toHaveBeenCalled();
    const previa = await simularParciais(usuario, periodo);
    dubl.escrever.mockResolvedValue({ linhasCriadas: 0, linhasAtualizadas: 0 });
    await expect(
      enviarParciais(usuario, { ...periodo, planoHash: previa.planoHash }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
