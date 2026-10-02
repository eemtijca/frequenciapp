// Revisão das linhas parciais na última leitura antes de enviar ao Google.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ABA_PARCIAL, CABECALHO_PARCIAL } from "@/domain/planilha-parcial";
import { assinarAba, hashTexto } from "@/domain/planilha";
const dubl = vi.hoisted(() => ({ lerDocumento: vi.fn(), ler: vi.fn(), enviar: vi.fn() }));
vi.mock("@/infra/google-planilhas-api", async (original) => ({
  ...(await original<object>()),
  lerDocumentoGoogle: dubl.lerDocumento,
  lerGoogle: dubl.ler,
}));
vi.mock("@/infra/google-planilhas-escrita", async (original) => ({
  ...(await original<object>()),
  enviarLotesGoogle: dubl.enviar,
}));
import { aplicarParciaisGoogle } from "@/infra/google-planilhas-parcial";
const codigo = "00000000-0000-4000-8000-000000000001";
const anteriores = ["15/06/2026", "QA Aluno", "QA Turma", "Manhã", "Não", "", "", codigo, "0"];
const assinatura = assinarAba(ABA_PARCIAL, CABECALHO_PARCIAL, []);
let valores: string[][] = [];
let formulas: boolean[][] = [];
let marcada = true;
const leitura = () => ({ valores, formula: formulas });
const alterar = () => ({
  criar: [],
  atualizar: [
    {
      linha: 2,
      codigo,
      anteriores,
      celulas: [
        { coluna: 5, valor: "Sim" },
        { coluna: 9, valor: "1" },
      ],
    },
  ],
});
const executar = () =>
  aplicarParciaisGoogle(
    "arquivo",
    "acesso",
    assinatura,
    hashTexto(JSON.stringify(leitura())),
    alterar(),
  );
beforeEach(() => {
  vi.clearAllMocks();
  marcada = true;
  valores = [[...CABECALHO_PARCIAL], [...anteriores]];
  formulas = [[], []];
  dubl.ler.mockImplementation(async () => leitura());
  dubl.lerDocumento.mockImplementation(async () => ({
    spreadsheetId: "arquivo",
    properties: { title: "QA" },
    sheets: [
      {
        properties: {
          sheetId: 7,
          title: ABA_PARCIAL,
          gridProperties: { rowCount: 100, columnCount: 26 },
        },
        merges: [],
        developerMetadata: marcada
          ? [
              {
                metadataId: 1,
                metadataKey: "frequenciapp.linha",
                metadataValue: "1",
                location: { dimensionRange: { sheetId: 7, startRowIndex: 1, endRowIndex: 2 } },
              },
            ]
          : [],
      },
    ],
  }));
  dubl.enviar.mockResolvedValue(undefined);
});
describe("escrita revisada da planilha parcial", () => {
  it("atualiza só células revisadas e não altera código nem colunas manuais", async () => {
    const resultado = await executar();
    expect(resultado).toEqual({ linhasCriadas: 0, linhasAtualizadas: 1 });
    const requests = dubl.enviar.mock.calls[0]?.[2] as {
      updateCells?: { range?: { startColumnIndex?: number } };
    }[];
    expect(requests.map((item) => item.updateCells?.range?.startColumnIndex)).toEqual([4, 8]);
    expect(dubl.enviar).toHaveBeenCalledTimes(1);
  });
  it("recusa linha manual mesmo com o código do registro", async () => {
    marcada = false;
    await expect(executar()).rejects.toMatchObject({ status: 409 });
    expect(dubl.enviar).not.toHaveBeenCalled();
  });
  it("recusa dados alterados na última releitura", async () => {
    const anteriorHash = hashTexto(JSON.stringify(leitura()));
    valores[1] = [...anteriores.slice(0, 3), "Tarde", ...anteriores.slice(4)];
    await expect(
      aplicarParciaisGoogle("arquivo", "acesso", assinatura, anteriorHash, alterar()),
    ).rejects.toMatchObject({ status: 409 });
    expect(dubl.enviar).not.toHaveBeenCalled();
  });
  it("recusa fórmula no registro, código duplicado e comparação anterior divergente", async () => {
    formulas[1] = [true];
    await expect(executar()).rejects.toMatchObject({ status: 409 });
    formulas[1] = [];
    valores.push([...anteriores]);
    await expect(executar()).rejects.toMatchObject({ status: 409 });
    valores.pop();
    valores[1] = ["16/06/2026", ...anteriores.slice(1)];
    await expect(executar()).rejects.toMatchObject({ status: 409 });
    expect(dubl.enviar).not.toHaveBeenCalled();
  });
  it("recusa troca do código e alteração em coluna fora do registro", async () => {
    for (const coluna of [8, 10]) {
      const alteracoes = alterar();
      alteracoes.atualizar[0]?.celulas.push({ coluna, valor: "texto" });
      await expect(
        aplicarParciaisGoogle(
          "arquivo",
          "acesso",
          assinatura,
          hashTexto(JSON.stringify(leitura())),
          alteracoes,
        ),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(dubl.enviar).not.toHaveBeenCalled();
  });
  it("não repete escrita cuja resposta não foi confirmada", async () => {
    dubl.enviar.mockRejectedValue(new Error("Resposta perdida"));
    await expect(executar()).rejects.toThrow("Resposta perdida");
    expect(dubl.enviar).toHaveBeenCalledTimes(1);
  });
});
