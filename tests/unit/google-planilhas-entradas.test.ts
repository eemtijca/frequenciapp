// A preparação preserva abas manuais e exige as duas abas úteis antes de remover Sheet1.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CABECALHO_ENTRADAS } from "@/domain/planilha-entradas";
const dubl = vi.hoisted(() => ({
  documento: vi.fn(),
  leitura: vi.fn(),
  usado: vi.fn(),
  vazia: vi.fn(),
  criar: vi.fn(),
  organizar: vi.fn(),
  enviar: vi.fn(),
}));
vi.mock("@/infra/google-planilhas-api", () => ({
  lerDocumentoGoogle: dubl.documento,
  lerBlocosGoogle: dubl.leitura,
  tamanhoUtilizado: dubl.usado,
  abaVaziaGoogle: dubl.vazia,
  metadadosDaAba: () => [],
}));
vi.mock("@/infra/google-planilhas-abas", () => ({ criarAbaGoogle: dubl.criar }));
vi.mock("@/infra/google-planilhas-apresentacao", () => ({ organizarAbaGoogle: dubl.organizar }));
vi.mock("@/infra/google-planilhas-escrita", () => ({ enviarLotesGoogle: dubl.enviar }));
import { prepararEntradasGoogle } from "@/infra/google-planilhas-entradas";

beforeEach(() => {
  vi.resetAllMocks();
  dubl.documento.mockResolvedValue({
    sheets: [
      { properties: { sheetId: 1, title: "Sheet1" } },
      { properties: { sheetId: 2, title: "Saídas" } },
      { properties: { sheetId: 3, title: "Entradas" } },
    ],
  });
  dubl.usado.mockResolvedValue({ colunas: 7, linhas: 20 });
  dubl.leitura.mockResolvedValue([{ valores: [CABECALHO_ENTRADAS], formula: [[]] }]);
  dubl.vazia.mockResolvedValue(true);
});

describe("proteção das abas de movimentações", () => {
  it.each([undefined, "Sheet1", "Entradas", "Outra aba"])(
    "mantém Sheet1 sem aba de saídas válida: %s",
    async (abaSaidas) => {
      expect(await prepararEntradasGoogle("qa", "acesso", abaSaidas)).toMatchObject({
        criada: false,
        organizada: true,
        sheet1: "mantida",
      });
      expect(dubl.vazia).not.toHaveBeenCalled();
      expect(dubl.enviar).not.toHaveBeenCalled();
    },
  );

  it("não remove a aba padrão se a conferência completa falhar", async () => {
    dubl.vazia.mockRejectedValue(new Error("QA Leitura recusada"));
    await expect(prepararEntradasGoogle("qa", "acesso", "Saídas")).rejects.toThrow("recusada");
    expect(dubl.enviar).not.toHaveBeenCalled();
  });

  it("recusa fórmula no cabeçalho antes de formatar ou remover abas", async () => {
    dubl.leitura.mockResolvedValue([{ valores: [CABECALHO_ENTRADAS], formula: [[true]] }]);
    await expect(prepararEntradasGoogle("qa", "acesso", "Saídas")).rejects.toThrow("cabeçalho");
    expect(dubl.organizar).not.toHaveBeenCalled();
    expect(dubl.enviar).not.toHaveBeenCalled();
  });
});
