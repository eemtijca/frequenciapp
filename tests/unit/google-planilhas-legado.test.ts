// Retirada de abas antigas exige dados preservados, destino inequívoco e nova conferência.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
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
      valorInformado: Array.from({ length: linhas }, (_, linha) =>
        Array.from(
          { length: pedido.colunas },
          (_, coluna) =>
            fonte.valorInformado?.[linha]?.[pedido.coluna + coluna - 1] ??
            Boolean(
              fonte.valores[linha]?.[pedido.coluna + coluna - 1] ||
              fonte.formula[linha]?.[pedido.coluna + coluna - 1] ||
              (fonte.ocupado?.[linha]?.[pedido.coluna + coluna - 1] &&
                !fonte.notas?.[linha]?.[pedido.coluna + coluna - 1]),
            ),
        ),
      ),
      conteudoHash: createHash("sha256")
        .update(JSON.stringify([fonte, pedido]))
        .digest("hex"),
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
    "valor oculto com nota",
  ])("preserva a aba diante de %s", async (caso) => {
    const antiga = grades.get(entrada.aba);
    const destino = grades.get("QA A · Outubro");
    if (!antiga || !destino || !doc.sheets[0]) throw new Error("Massa ausente.");
    if (caso === "divergência" && destino.valores[1]) destino.valores[1][1] = "F";
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
    if (caso === "valor oculto com nota") {
      antiga.notas = [[], [], [], [false, false, false, true]];
      antiga.valorInformado = [[], [], [], [false, false, false, true]];
    }
    if (["divergência", "aluno ausente", "homônimo"].includes(caso)) {
      const previa = await prever();
      expect(previa.totalPendencias).toBeGreaterThan(0);
      await expect(
        organizarAbaAntigaGoogle(
          "arquivo",
          "acesso",
          { ...entrada, impressao: previa.impressao },
          true,
        ),
      ).rejects.toThrow("Resolva as pendências");
    } else await expect(prever()).rejects.toThrow();
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("lista totais e notas sem escrever e exige confirmação do descarte", async () => {
    const antiga = grades.get(entrada.aba);
    if (!antiga?.valores[0] || !antiga.valores[1]) throw new Error("Massa ausente.");
    antiga.valores[0][3] = "Total";
    antiga.valores[1][3] = "1";
    antiga.formula = [[], [false, false, false, true]];
    antiga.notas = [[], [], [], [false, false, false, true]];
    const previa = await prever();
    expect(previa.complementos).toEqual({
      formulas: 1,
      notas: 1,
      totais: 0,
      amostras: [
        { celula: "D2", tipo: "fórmula" },
        { celula: "D4", tipo: "nota" },
      ],
    });
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao },
        true,
      ),
    ).rejects.toThrow("Confirme o descarte");
    await organizarAbaAntigaGoogle(
      "arquivo",
      "acesso",
      { ...entrada, impressao: previa.impressao, descartarComplementos: true },
      true,
    );
    expect(enviarLoteAtomicoGoogle).toHaveBeenCalledOnce();
  });
  it.each(["antiga", "mensal"] as const)(
    "permite conferir e manter a marca %s sem decidir silenciosamente",
    async (manter) => {
      const destino = grades.get("QA A · Outubro");
      if (!destino?.valores[1]) throw new Error("Massa ausente.");
      destino.valores[1][1] = "F";
      const bloqueada = await prever();
      expect(bloqueada.pendencias).toMatchObject([
        {
          tipo: "frequencia",
          aluno: "QA Aluno",
          dia: "2026-10-01",
          antiga: "P",
          mensal: "F",
          origem: { celula: "C2", url: expect.stringContaining("gid=1&range=C2") },
          destino: { celula: "B2", url: expect.stringContaining("gid=3&range=B2") },
        },
      ]);
      const resolucoes = [
        { tipo: "frequencia" as const, mes: "2026-10", celulaAntiga: "C2", manter },
      ];
      const previa = await organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, resolucoes },
        false,
      );
      expect(previa).toMatchObject({
        totalPendencias: 0,
        resolucoesAplicadas: 1,
        substituidas: manter === "antiga" ? 1 : 0,
        mantidas: manter === "mensal" ? 1 : 0,
      });
      expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
      await expect(
        organizarAbaAntigaGoogle(
          "arquivo",
          "acesso",
          { ...entrada, resolucoes, impressao: bloqueada.impressao },
          true,
        ),
      ).rejects.toThrow("A planilha mudou");
      await organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, resolucoes, impressao: previa.impressao },
        true,
      );
      const pedidos = vi.mocked(enviarLoteAtomicoGoogle).mock.calls[0]?.[2] ?? [];
      expect(pedidos.filter((pedido) => pedido.updateCells)).toHaveLength(
        manter === "antiga" ? 1 : 0,
      );
      expect(pedidos.at(-1)).toEqual({ deleteSheet: { sheetId: 1 } });
    },
  );
  it("mostra homônimos, exige uma linha compatível e nunca aceita duas origens no mesmo destino", async () => {
    grades.get("QA A · Outubro")?.valores.push(["QA Aluno"]);
    const bloqueada = await prever();
    expect(bloqueada.pendencias).toMatchObject([
      {
        tipo: "aluno",
        linhaAntiga: 2,
        opcoes: [{ linha: 2 }, { linha: 3 }],
      },
    ]);
    const resolucoes = [{ tipo: "aluno" as const, mes: "2026-10", linhaAntiga: 2, linhaMensal: 3 }];
    const previa = await organizarAbaAntigaGoogle(
      "arquivo",
      "acesso",
      { ...entrada, resolucoes },
      false,
    );
    expect(previa).toMatchObject({ totalPendencias: 0, resolucoesAplicadas: 1 });
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        {
          ...entrada,
          resolucoes: [
            { ...resolucoes[0], tipo: "aluno", mes: "2026-10", linhaAntiga: 2, linhaMensal: 4 },
          ],
        },
        false,
      ),
    ).rejects.toThrow("não corresponde");
    grades.get(entrada.aba)?.valores.push(["QA Aluno", "", "P"]);
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        {
          ...entrada,
          resolucoes: [
            ...resolucoes,
            { tipo: "aluno", mes: "2026-10", linhaAntiga: 3, linhaMensal: 3 },
          ],
        },
        false,
      ),
    ).rejects.toThrow("Duas linhas antigas");
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("usa o código estável após correção do nome e aceita nome único sem código de destino", async () => {
    const alunoId = randomUUID();
    const antiga = doc.sheets[0];
    const setembro = doc.sheets[1];
    const fonte = grades.get(entrada.aba);
    const destino = grades.get("QA A · Setembro");
    if (!antiga || !setembro || !fonte?.valores[1] || !destino?.valores[1])
      throw new Error("Massa ausente.");
    for (const aba of [antiga, setembro])
      aba.developerMetadata?.push({
        metadataId: 1000 + aba.properties.sheetId,
        metadataKey: "frequenciapp.aluno",
        metadataValue: alunoId,
        location: {
          dimensionRange: {
            sheetId: aba.properties.sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
          },
        },
      });
    destino.valores[1][0] = "QA Nome corrigido";
    const outubro = grades.get("QA A · Outubro");
    if (!outubro?.valores[1]) throw new Error("Massa ausente.");
    outubro.valores[1][0] = "  qa   aluno  ";
    expect(await prever()).toMatchObject({
      totalPendencias: 1,
      pendencias: [
        { tipo: "aluno", mensagem: "O código coincide, mas o nome mudou. Confira as duas linhas." },
      ],
    });
    const resolucoes = [{ tipo: "aluno" as const, mes: "2026-09", linhaAntiga: 2, linhaMensal: 2 }];
    expect(
      await organizarAbaAntigaGoogle("arquivo", "acesso", { ...entrada, resolucoes }, false),
    ).toMatchObject({ totalPendencias: 0, conferidas: 1, preenchidas: 1 });
    doc.sheets[2]?.developerMetadata?.push({
      metadataId: 1003,
      metadataKey: "frequenciapp.aluno",
      metadataValue: randomUUID(),
      location: {
        dimensionRange: { sheetId: 3, startRowIndex: 1, endRowIndex: 2 },
      },
    });
    expect(
      await organizarAbaAntigaGoogle("arquivo", "acesso", { ...entrada, resolucoes }, false),
    ).toMatchObject({
      totalPendencias: 1,
      pendencias: [{ tipo: "aluno", opcoes: [] }],
    });
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("não deixa uma escolha substituir fórmula ou nota de destino", async () => {
    const destino = grades.get("QA A · Outubro");
    if (!destino?.valores[1]) throw new Error("Massa ausente.");
    destino.valores[1][1] = "F";
    const resolucoes = [
      {
        tipo: "frequencia" as const,
        mes: "2026-10",
        celulaAntiga: "C2",
        manter: "antiga" as const,
      },
    ];
    const previa = await organizarAbaAntigaGoogle(
      "arquivo",
      "acesso",
      { ...entrada, resolucoes },
      false,
    );
    destino.notas = [[], [false, true]];
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, resolucoes, impressao: previa.impressao },
        true,
      ),
    ).rejects.toThrow("Há fórmula ou nota");
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("inclui um aluno ausente somente após escolha e preserva a linha ocupada e suas marcas", async () => {
    const destino = grades.get("QA A · Outubro");
    if (!destino?.valores[1]) throw new Error("Massa ausente.");
    destino.valores[1] = ["QA Outro aluno", "F"];
    const bloqueada = await prever();
    expect(bloqueada.pendencias).toMatchObject([{ tipo: "aluno", opcoes: [] }]);
    const resolucoes = [{ tipo: "adicionar-aluno" as const, mes: "2026-10", linhaAntiga: 2 }];
    const previa = await organizarAbaAntigaGoogle(
      "arquivo",
      "acesso",
      { ...entrada, resolucoes },
      false,
    );
    expect(previa).toMatchObject({
      alunosIncluidos: 1,
      totalPendencias: 0,
      resolucoesAplicadas: 1,
      preenchidas: 1,
    });
    expect(destino.valores[1]).toEqual(["QA Outro aluno", "F"]);
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
    await organizarAbaAntigaGoogle(
      "arquivo",
      "acesso",
      { ...entrada, resolucoes, impressao: previa.impressao },
      true,
    );
    const pedidos = vi.mocked(enviarLoteAtomicoGoogle).mock.calls[0]?.[2] ?? [];
    const alteracoes = pedidos.flatMap((pedido) =>
      pedido.updateCells ? [pedido.updateCells] : [],
    );
    expect(alteracoes).toMatchObject([
      {
        range: { sheetId: 3, startRowIndex: 2, startColumnIndex: 0 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "QA Aluno" } }] }],
      },
      {
        range: { sheetId: 3, startRowIndex: 2, startColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "P" } }] }],
      },
    ]);
  });
  it("limita os detalhes a 200 pendências, mas mantém a contagem e o bloqueio do conjunto completo", async () => {
    const fonte = grades.get(entrada.aba);
    const destino = grades.get("QA A · Outubro");
    if (!fonte || !destino) throw new Error("Massa ausente.");
    fonte.valores = [
      ["Aluno", "01/10/2026"],
      ...Array.from({ length: 205 }, (_, i) => [`QA Aluno ${i}`, "P"]),
    ];
    destino.valores = [
      ["Aluno", "01/10/2026"],
      ...Array.from({ length: 205 }, (_, i) => [`QA Aluno ${i}`, "F"]),
    ];
    for (const aba of doc.sheets)
      if (aba.properties.gridProperties) aba.properties.gridProperties.rowCount = 210;
    const previa = await prever();
    expect(previa.totalPendencias).toBe(205);
    expect(previa.pendencias).toHaveLength(200);
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao },
        true,
      ),
    ).rejects.toThrow("Resolva as pendências");
    expect(enviarLoteAtomicoGoogle).not.toHaveBeenCalled();
  });
  it("invalida a prévia quando o conteúdo muda sem mudar os indicadores visuais", async () => {
    const antiga = grades.get(entrada.aba);
    if (!antiga) throw new Error("Massa ausente.");
    antiga.notas = [[], [true]];
    antiga.conteudoHash = "QA Nota anterior";
    const previa = await prever();
    antiga.conteudoHash = "QA Nota corrigida";
    await expect(
      organizarAbaAntigaGoogle(
        "arquivo",
        "acesso",
        { ...entrada, impressao: previa.impressao, descartarComplementos: true },
        true,
      ),
    ).rejects.toThrow("A planilha mudou");
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
