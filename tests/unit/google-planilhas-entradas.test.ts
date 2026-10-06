// A preparação preserva abas manuais, realinha o formato anterior e exige as duas abas úteis antes de remover Sheet1.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CABECALHO_ENTRADAS, CABECALHO_ENTRADAS_ANTERIOR } from "@/domain/planilha-entradas";
const dubl = vi.hoisted(() => ({
  documento: vi.fn(),
  leitura: vi.fn(),
  usado: vi.fn(),
  vazia: vi.fn(),
  criar: vi.fn(),
  organizar: vi.fn(),
  enviar: vi.fn(),
  atomico: vi.fn(),
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
vi.mock("@/infra/google-planilhas-escrita", () => ({
  enviarLotesGoogle: dubl.enviar,
  enviarLoteAtomicoGoogle: dubl.atomico,
}));
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

describe("realinhamento do formato anterior da aba Entradas", () => {
  it("move o responsável para a coluna G, esvazia Observação e organiza com o cabeçalho novo", async () => {
    dubl.leitura
      .mockResolvedValueOnce([{ valores: [CABECALHO_ENTRADAS_ANTERIOR], formula: [[]] }])
      .mockResolvedValueOnce([
        {
          valores: [
            ["Registrado por", "Código"],
            ["QA Ana", "a:2026-06-15"],
            ["", ""],
          ],
          formula: [
            [false, false],
            [false, false],
            [false, false],
          ],
        },
      ]);
    expect(await prepararEntradasGoogle("qa", "acesso", "Saídas")).toMatchObject({
      criada: false,
      realinhada: true,
    });
    expect(dubl.leitura).toHaveBeenLastCalledWith("qa", "acesso", "Entradas", 20, [
      { coluna: 6, colunas: 2 },
    ]);
    expect(dubl.atomico).toHaveBeenCalledOnce();
    expect(dubl.atomico.mock.calls[0]?.[2]).toEqual([
      {
        updateCells: {
          range: {
            sheetId: 3,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 7,
          },
          rows: [
            {
              values: CABECALHO_ENTRADAS.map((titulo) => ({
                userEnteredValue: { stringValue: titulo },
              })),
            },
          ],
          fields: "userEnteredValue",
        },
      },
      {
        updateCells: {
          range: {
            sheetId: 3,
            startRowIndex: 1,
            endRowIndex: 3,
            startColumnIndex: 5,
            endColumnIndex: 7,
          },
          rows: [
            { values: [{}, { userEnteredValue: { stringValue: "QA Ana" } }] },
            { values: [{}, {}] },
          ],
          fields: "userEnteredValue",
        },
      },
    ]);
    expect(dubl.organizar).toHaveBeenCalledOnce();
  });

  it("recusa fórmula nas colunas que mudam de lugar, sem escrever", async () => {
    dubl.leitura
      .mockResolvedValueOnce([{ valores: [CABECALHO_ENTRADAS_ANTERIOR], formula: [[]] }])
      .mockResolvedValueOnce([
        {
          valores: [
            ["Registrado por", "Código"],
            ["=A1", ""],
          ],
          formula: [
            [false, false],
            [true, false],
          ],
        },
      ]);
    await expect(prepararEntradasGoogle("qa", "acesso", "Saídas")).rejects.toThrow("fórmulas");
    expect(dubl.atomico).not.toHaveBeenCalled();
    expect(dubl.organizar).not.toHaveBeenCalled();
  });

  it("não realinha o formato atual nem cabeçalho desconhecido", async () => {
    await prepararEntradasGoogle("qa", "acesso", "Saídas");
    expect(dubl.atomico).not.toHaveBeenCalled();
    dubl.leitura.mockResolvedValue([{ valores: [["Data", "Nome"]], formula: [[]] }]);
    await expect(prepararEntradasGoogle("qa", "acesso", "Saídas")).rejects.toThrow("cabeçalho");
    expect(dubl.atomico).not.toHaveBeenCalled();
  });
});
