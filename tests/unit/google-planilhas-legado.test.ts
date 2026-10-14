// Retirada de abas antigas exige dados preservados, destino inequívoco e nova conferência.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AbaGoogle, BlocoGoogle, DocumentoGoogle } from "@/infra/google-planilhas-api";

vi.mock("@/infra/google-planilhas-escrita", () => ({ enviarLoteAtomicoGoogle: vi.fn() }));
vi.mock("@/infra/google-planilhas-api", async (original) => ({
  ...(await original<typeof import("@/infra/google-planilhas-api")>()),
  lerDocumentoGoogle: vi.fn(),
  lerBlocosGoogle: vi.fn(),
}));
import { lerBlocosGoogle, lerDocumentoGoogle } from "@/infra/google-planilhas-api";
import { enviarLoteAtomicoGoogle } from "@/infra/google-planilhas-escrita";
import { organizarAbaAntigaGoogle } from "@/infra/google-planilhas-legado";

const turma = randomUUID();
const entrada = { aba: "QA Turma A", turmaOriginalId: turma };
let doc: DocumentoGoogle;
let grades: Map<string, BlocoGoogle>;

function aba(id: number, nome: string, mes?: string): AbaGoogle {
  return {
    properties: {
      sheetId: id,
      title: nome,
      hidden: true,
      gridProperties: { rowCount: 5, columnCount: 4 },
    },
    developerMetadata: [
      {
        metadataId: id * 10,
        metadataKey: "frequenciapp.aba",
        metadataValue: "1",
        location: { sheetId: id },
      },
      ...(mes
        ? [
            {
              metadataId: id * 10 + 1,
              metadataKey: "frequenciapp.turma",
              metadataValue: turma,
              location: { sheetId: id },
            },
            {
              metadataId: id * 10 + 2,
              metadataKey: "frequenciapp.mes",
              metadataValue: mes,
              location: { sheetId: id },
            },
            {
              metadataId: id * 10 + 3,
              metadataKey: "frequenciapp.geracao",
              metadataValue: randomUUID(),
              location: { sheetId: id },
            },
          ]
        : []),
    ],
  };
}
function grade(valores: string[][]): BlocoGoogle {
  return { coluna: 1, colunas: 4, valores, formula: [], notas: [] };
}
async function prever() {
  return organizarAbaAntigaGoogle("arquivo", "acesso", entrada, false);
}

beforeEach(() => {
  vi.clearAllMocks();
  doc = {
    spreadsheetId: "arquivo",
    properties: { title: "QA" },
    sheets: [
      aba(1, entrada.aba),
      aba(2, "QA A · Setembro", "2026-09"),
      aba(3, "QA A · Outubro", "2026-10"),
    ],
  };
  grades = new Map([
    [
      entrada.aba,
      grade([
        ["Aluno", "30/09/2026", "01/10/2026"],
        ["QA Aluno", "FJ", "P"],
      ]),
    ],
    [
      "QA A · Setembro",
      grade([
        ["Aluno", "30/09/2026"],
        ["QA Aluno", "FJ"],
      ]),
    ],
    [
      "QA A · Outubro",
      grade([
        ["Aluno", "01/10/2026"],
        ["QA Aluno", ""],
      ]),
    ],
  ]);
  vi.mocked(lerDocumentoGoogle).mockResolvedValue(doc);
  vi.mocked(lerBlocosGoogle).mockImplementation(async (_id, _acesso, nome, linhas, pedidos) => {
    const fonte = grades.get(nome);
    if (!fonte) throw new Error("Massa ausente.");
    return pedidos.map((pedido) => ({
      coluna: pedido.coluna,
      colunas: pedido.colunas,
      valores: Array.from({ length: linhas }, (_, linha) =>
        Array.from(
          { length: pedido.colunas },
          (_, coluna) => fonte.valores[linha]?.[pedido.coluna + coluna - 1] ?? "",
        ),
      ),
      ocupado: Array.from({ length: linhas }, (_, linha) =>
        Array.from(
          { length: pedido.colunas },
          (_, coluna) =>
            fonte.ocupado?.[linha]?.[pedido.coluna + coluna - 1] ??
            Boolean(fonte.valores[linha]?.[pedido.coluna + coluna - 1]),
        ),
      ),
      formula: Array.from({ length: linhas }, (_, linha) =>
        Array.from(
          { length: pedido.colunas },
          (_, coluna) => fonte.formula[linha]?.[pedido.coluna + coluna - 1] ?? false,
        ),
      ),
      notas: Array.from({ length: linhas }, (_, linha) =>
        Array.from(
          { length: pedido.colunas },
          (_, coluna) => fonte.notas?.[linha]?.[pedido.coluna + coluna - 1] ?? false,
        ),
      ),
    }));
  });
});

describe("organização das abas antigas", () => {
  it("confere dois meses e só copia a célula vazia antes de retirar a origem no mesmo lote", async () => {
    const previa = await prever();
    expect(previa).toMatchObject({ preenchidas: 1, conferidas: 1, removida: false });
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
    expect(
      await organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao },
        true,
      ),
    ).toMatchObject({ removida: true });
    expect(enviarLoteAtomicoGoogle).toHaveBeenCalledOnce();
    const pedidos = vi.mocked(enviarLoteAtomicoGoogle).mock.calls[0]?.[2];
    expect(pedidos?.[0]).toMatchObject({
      updateCells: {
        range: { sheetId: 3, startRowIndex: 1, startColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "P" } }] }],
      },
    });
    expect(pedidos?.at(-1)).toEqual({ deleteSheet: { sheetId: 1 } });
    expect(pedidos).toHaveLength(4);
  });
  it.each(["origem", "destino"])("recusa alteração na %s depois da prévia", async (alvo) => {
    const previa = await prever();
    const fonte = grades.get(alvo === "origem" ? entrada.aba : "QA A · Outubro");
    if (fonte?.valores[1]) fonte.valores[1][2] = "F";
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao },
        true,
      ),
    ).rejects.toThrow();
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it.each([
    "divergência",
    "nota na origem",
    "nota no destino",
    "fórmula na origem",
    "fórmula no destino",
    "aluno ausente",
    "homônimo",
    "coluna manual",
    "mês ausente",
    "mesclagem",
    "gráfico",
    "origem mensal",
    "conteúdo oculto na origem",
    "conteúdo oculto no destino",
  ])("preserva a aba diante de %s", async (caso) => {
    const antiga = grades.get(entrada.aba);
    const destino = grades.get("QA A · Outubro");
    if (!antiga || !destino || !doc.sheets[0]) throw new Error("Massa ausente.");
    if (caso === "divergência" && destino.valores[1]) destino.valores[1][1] = "F";
    if (caso === "nota na origem") antiga.notas = [[], [], [], [false, false, false, true]];
    if (caso === "nota no destino") destino.notas = [[], [false, true]];
    if (caso === "fórmula na origem") antiga.formula = [[], [false, true]];
    if (caso === "fórmula no destino") destino.formula = [[], [false, true]];
    if (caso === "aluno ausente") destino.valores.splice(1);
    if (caso === "homônimo") destino.valores.push(["QA Aluno"]);
    if (caso === "coluna manual" && antiga.valores[0]) antiga.valores[0][3] = "Observação";
    if (caso === "mês ausente") doc.sheets.splice(2);
    if (caso === "mesclagem") doc.sheets[0].merges = [{ startRowIndex: 1, endRowIndex: 2 }];
    if (caso === "gráfico") doc.sheets[0].charts = [{ chartId: 7 }];
    if (caso === "origem mensal") doc.sheets[0] = aba(1, entrada.aba, "2026-08");
    if (caso === "conteúdo oculto na origem")
      antiga.ocupado = [[], [], [], [false, false, false, true]];
    if (caso === "conteúdo oculto no destino") destino.ocupado = [[], [false, true]];
    await expect(prever()).rejects.toThrow();
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("não repete uma escrita quando a resposta é perdida", async () => {
    const previa = await prever();
    vi.mocked(enviarLoteAtomicoGoogle).mockRejectedValueOnce(new TypeError("Resposta perdida"));
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao },
        true,
      ),
    ).rejects.toThrow("Resposta perdida");
    expect(enviarLoteAtomicoGoogle).toHaveBeenCalledOnce();
  });
});
