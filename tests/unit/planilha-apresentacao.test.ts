// Prévia visual com dados sintéticos: arquivo, deriva, faixas e escrita de estilos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assinarAba } from "@/domain/planilha";
import { colunasDeApresentacao, colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { pedidosDeApresentacao, organizarAbaGoogle } from "@/infra/google-planilhas-apresentacao";
const dubl = vi.hoisted(() => ({ linha: vi.fn(), chamar: vi.fn(), auditar: vi.fn() }));
vi.mock("@/application/planilha-comum", () => ({
  lerLinha: dubl.linha,
  chamarIntegracao: dubl.chamar,
}));
vi.mock("@/infra/ambiente", () => ({
  ambiente: { authSecret: "segredo-sintetico-para-a-previa-visual" },
}));
vi.mock("@/infra/banco", () => ({ banco: () => ({}) }));
vi.mock("@/infra/auditoria", () => ({ auditar: dubl.auditar }));
import { organizarPlanilha } from "@/application/planilha-apresentacao";

const cabecalho = ["Aluno", "Turma atual", "10/09", "Anotação da escola", "Total"];
const plano = {
  aba: "QA Ano A",
  cabecalhoLinha: 2,
  assinatura: assinarAba("QA Ano A", cabecalho, []),
  colunas: colunasDeApresentacao(cabecalho),
};
let arquivo = "qa-arquivo";
let rotulos = cabecalho;
beforeEach(() => {
  vi.clearAllMocks();
  arquivo = "qa-arquivo";
  rotulos = cabecalho;
  dubl.linha.mockImplementation(async () => ({
    ativa: true,
    provedor: "GOOGLE",
    googlePlanilhaId: arquivo,
    atualizadoEm: new Date("2026-10-01T12:00:00Z"),
  }));
  dubl.chamar.mockImplementation(async (_linha, corpo) =>
    corpo.acao === "estrutura"
      ? {
          abas: [
            {
              nome: plano.aba,
              colunas: 5,
              amostra: [["Frequência"], rotulos, ["QA Aluno", "QA Ano A", "P"]],
              mesclagens: [],
            },
          ],
        }
      : { aba: plano.aba },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("organização visual", () => {
  it("mantém colunas auxiliares fora da apresentação e ajusta nomes e dias", () => {
    expect(plano.colunas.map((item) => item.indice)).toEqual([1, 2, 3, 5]);
    expect(plano.colunas[0]?.largura).toBe(260);
    expect(plano.colunas[2]).toMatchObject({ largura: 68, alinhamento: "CENTER" });
  });
  it("formata os títulos personalizados apenas na criação de aba nova", () => {
    const cabecalhoNovo = ["Aluno", "Anotação da escola"];
    expect(colunasDeNovaAba(cabecalhoNovo)).toEqual([
      { indice: 1, rotulo: "Aluno", largura: 260, alinhamento: "LEFT" },
      { indice: 2, rotulo: "Anotação da escola", largura: 240, alinhamento: "LEFT" },
    ]);
    expect(colunasDeApresentacao(cabecalhoNovo)).toHaveLength(1);
  });
  it("a prévia só lê e a confirmação envia apenas a apresentação conferida", async () => {
    const resultado = await organizarPlanilha({ id: "admin" }, "FREQUENCIA", { aba: plano.aba });
    expect(dubl.chamar).toHaveBeenCalledTimes(1);
    expect(dubl.auditar).not.toHaveBeenCalled();
    expect(resultado.previa?.cabecalhoLinha).toBe(2);
    await organizarPlanilha({ id: "admin" }, "FREQUENCIA", {
      aba: plano.aba,
      planoHash: resultado.previa?.planoHash,
    });
    expect(dubl.chamar).toHaveBeenLastCalledWith(
      expect.anything(),
      { acao: "organizarAba", ...plano },
      { retentavel: false },
    );
    expect(dubl.auditar).toHaveBeenCalledTimes(1);
  });
  it.each(["arquivo", "cabeçalho"])("bloqueia mudança de %s depois da prévia", async (mudanca) => {
    const resultado = await organizarPlanilha({ id: "admin" }, "FREQUENCIA", { aba: plano.aba });
    if (mudanca === "arquivo") arquivo = "outro-arquivo";
    else rotulos = ["Aluno", "Turma atual", "11/09", "Anotação da escola", "Total"];
    await expect(
      organizarPlanilha({ id: "admin" }, "FREQUENCIA", {
        aba: plano.aba,
        planoHash: resultado.previa?.planoHash,
      }),
    ).rejects.toThrow("A planilha mudou");
    expect(dubl.chamar.mock.calls.every(([, corpo]) => corpo.acao === "estrutura")).toBe(true);
  });
  it("orienta atualizar o script antes de formatar pelo provedor legado", async () => {
    dubl.linha.mockResolvedValue({ provedor: "GAS", versaoScript: "4" });
    await expect(
      organizarPlanilha({ id: "admin" }, "FREQUENCIA", { aba: plano.aba }),
    ).rejects.toThrow("versão 5");
    expect(dubl.chamar).not.toHaveBeenCalled();
  });
  it.each([{ oculta: true }, { mesclagens: ["A1:B1"] }, { colunas: 401 }])(
    "recusa estrutura insegura %j",
    async (alteracao) => {
      dubl.chamar.mockResolvedValue({
        abas: [{ nome: plano.aba, amostra: [cabecalho], ...alteracao }],
      });
      await expect(
        organizarPlanilha({ id: "admin" }, "FREQUENCIA", { aba: plano.aba }),
      ).rejects.toThrow("Organize apenas abas");
      expect(dubl.auditar).not.toHaveBeenCalled();
    },
  );
});

describe("estilos na Sheets API", () => {
  it("congela até o cabeçalho sem reduzir o congelamento e não altera valores ou formatos numéricos", () => {
    const pedidos = pedidosDeApresentacao(7, 100, plano, 3);
    const json = JSON.stringify(pedidos);
    expect(json).not.toContain("userEnteredValue");
    expect(json).not.toContain("numberFormat");
    expect(json).not.toContain("delete");
    expect(pedidos).toContainEqual({
      updateSheetProperties: {
        properties: { sheetId: 7, gridProperties: { frozenRowCount: 3 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    const faixas = pedidos.flatMap((pedido) =>
      pedido.addBanding
        ? [(pedido.addBanding as { bandedRange: { range: unknown } }).bandedRange.range]
        : [],
    );
    expect(faixas).toEqual([
      { sheetId: 7, startRowIndex: 1, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 3 },
      { sheetId: 7, startRowIndex: 1, endRowIndex: 100, startColumnIndex: 4, endColumnIndex: 5 },
    ]);
  });
  it("atualiza a faixa existente e recusa sobreposição manual", () => {
    const banda = {
      bandedRangeId: 15,
      range: { startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3, endRowIndex: 90 },
    };
    expect(pedidosDeApresentacao(7, 100, plano, 0, [banda])[0]).toHaveProperty("updateBanding");
    expect(() =>
      pedidosDeApresentacao(7, 100, plano, 0, [
        { ...banda, range: { ...banda.range, endColumnIndex: 4 } },
      ]),
    ).toThrow("cores alternadas");
  });
  it.each([false, true])(
    "reconfere o cabeçalho antes da escrita, com deriva %s",
    async (deriva) => {
      const post = vi.fn();
      vi.stubGlobal("fetch", async (entrada: URL | string, opcoes?: RequestInit) => {
        const url = new URL(String(entrada));
        if (opcoes?.method === "POST" && !url.pathname.endsWith("/developerMetadata:search")) {
          post();
          return Response.json({ replies: [] });
        }
        if (url.pathname.endsWith("/developerMetadata:search"))
          return Response.json({ matchedDeveloperMetadata: [] });
        if (url.pathname.includes("/values/")) return Response.json({ values: [[], cabecalho] });
        if (url.searchParams.get("includeGridData") === "true")
          return Response.json({
            sheets: [
              {
                data: [
                  {
                    rowData: [
                      {},
                      {
                        values: (deriva ? ["Aluno", "Turma atual", "11/09"] : cabecalho).map(
                          (formattedValue) => ({
                            formattedValue,
                          }),
                        ),
                      },
                    ],
                  },
                ],
              },
            ],
          });
        return Response.json({
          spreadsheetId: arquivo,
          properties: { title: "QA" },
          sheets: [
            {
              properties: {
                sheetId: 7,
                title: plano.aba,
                gridProperties: { rowCount: 100, columnCount: 26 },
              },
            },
          ],
        });
      });
      if (deriva) {
        await expect(organizarAbaGoogle(arquivo, "acesso-falso", plano)).rejects.toThrow(
          "A estrutura da planilha mudou",
        );
        expect(post).not.toHaveBeenCalled();
      } else {
        expect(await organizarAbaGoogle(arquivo, "acesso-falso", plano)).toEqual({
          aba: plano.aba,
        });
        expect(post).toHaveBeenCalledTimes(1);
      }
    },
  );
});
