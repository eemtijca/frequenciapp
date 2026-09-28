// Confere o planejamento da gravação pela Sheets API sem tocar em dados reais.
import { afterEach, describe, expect, it, vi } from "vitest";
import { assinarAba } from "@/domain/planilha";
import {
  compactarAtualizacoesGoogle,
  enviarLotesGoogle,
  planejarEscritaGoogle,
} from "@/infra/google-planilhas-escrita";
import type { DocumentoGoogle } from "@/infra/google-planilhas-api";

const documento: DocumentoGoogle = {
  spreadsheetId: "planilha-de-teste",
  properties: { title: "Teste" },
  sheets: [
    {
      properties: {
        sheetId: 7,
        title: "Turma",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
    },
  ],
};

const valores = [
  ["Aluno", "Dia"],
  ["Ana", ""],
  ["Bia", "Manual"],
  ["Caio", ""],
];
const formulas = [
  [false, false],
  [false, false],
  [false, false],
  [false, true],
];
const assinatura = assinarAba("Turma", valores[0] ?? [], []);

afterEach(() => vi.unstubAllGlobals());

describe("gravação pela Sheets API", () => {
  it("preenche somente célula vazia sem fórmula na releitura", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      formulas,
      1,
      assinatura,
      [
        { tipo: "preencher", linha: 2, coluna: 2, valor: "F" },
        { tipo: "preencher", linha: 3, coluna: 2, valor: "F" },
        { tipo: "preencher", linha: 4, coluna: 2, valor: "F" },
      ],
      false,
    );
    expect(plano.contagens).toMatchObject({
      preenchidas: 1,
      puladasOcupadas: 1,
      puladasFormula: 1,
    });
    expect(plano.requests).toHaveLength(1);
    expect(plano.requests[0]).toMatchObject({
      updateCells: { range: { sheetId: 7, startRowIndex: 1, startColumnIndex: 1 } },
    });
  });

  it("recusa envio quando o cabeçalho mudou desde a prévia", () => {
    expect(() =>
      planejarEscritaGoogle(documento, "Turma", valores, formulas, 1, "antiga", [], false),
    ).toThrow("estrutura da planilha mudou");
  });

  it("marca a linha antes de escrever o novo aluno", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      formulas,
      1,
      assinatura,
      [
        {
          tipo: "criarLinhas",
          itens: [
            {
              linha: 5,
              alunoId: "00000000-0000-4000-8000-000000000001",
              celulas: [{ coluna: 1, valor: "Dora" }],
            },
          ],
        },
      ],
      false,
    );
    expect(plano.contagens.linhasCriadas).toBe(1);
    expect(plano.requests[0]).toMatchObject({
      createDeveloperMetadata: { developerMetadata: { metadataKey: "frequenciapp.linha" } },
    });
    expect(plano.requests[2]).toMatchObject({ updateCells: {} });
  });

  it("cria linha de saída sem vínculo de aluno e preserva o marcador de remoção", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      formulas,
      1,
      assinatura,
      [{ tipo: "criarLinhas", itens: [{ linha: 5, celulas: [{ coluna: 1, valor: "Dora" }] }] }],
      false,
    );
    expect(plano.contagens.linhasCriadas).toBe(1);
    expect(plano.requests[0]).toMatchObject({
      createDeveloperMetadata: { developerMetadata: { metadataKey: "frequenciapp.linha" } },
    });
    expect(
      plano.requests.some((pedido) => JSON.stringify(pedido).includes("frequenciapp.aluno")),
    ).toBe(false);
  });

  it("recusa remoção de coluna sem marcador", () => {
    expect(() =>
      planejarEscritaGoogle(
        documento,
        "Turma",
        valores,
        formulas,
        1,
        assinatura,
        [{ tipo: "removerColunas", colunas: [2] }],
        true,
      ),
    ).toThrow("não foi criada pela integração");
  });

  it("recusa substituição fora do modo completo", () => {
    expect(() =>
      planejarEscritaGoogle(
        documento,
        "Turma",
        valores,
        formulas,
        1,
        assinatura,
        [{ tipo: "substituir", linha: 3, coluna: 2, valor: "F", anterior: "Manual" }],
        false,
      ),
    ).toThrow("modo completo não está ativo");
  });

  it("agrupa escritas contíguas para reduzir chamadas ao Google", () => {
    const primeira = {
      updateCells: {
        range: {
          sheetId: 7,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: "F" } }] }],
        fields: "userEnteredValue",
      },
    };
    const segunda = {
      updateCells: {
        range: {
          sheetId: 7,
          startRowIndex: 2,
          endRowIndex: 3,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: "P" } }] }],
        fields: "userEnteredValue",
      },
    };
    expect(compactarAtualizacoesGoogle([primeira, segunda])).toEqual([
      {
        updateCells: {
          range: {
            sheetId: 7,
            startRowIndex: 1,
            endRowIndex: 3,
            startColumnIndex: 1,
            endColumnIndex: 2,
          },
          rows: [...primeira.updateCells.rows, ...segunda.updateCells.rows],
          fields: "userEnteredValue",
        },
      },
    ]);
  });

  it("classifica a recusa do primeiro lote como sem escrita", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    await expect(
      enviarLotesGoogle("planilha", "acesso", [{ updateCells: {} }]),
    ).rejects.toMatchObject({
      recusado: true,
    });
  });
});
