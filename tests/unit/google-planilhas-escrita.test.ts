// Confere o planejamento da gravação pela Sheets API sem tocar em dados reais.
import { mensagemParaRegistro } from "@/infra/planilha";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assinarAba } from "@/domain/planilha";
import {
  aplicarGoogle,
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
const alunoId = "00000000-0000-4000-8000-000000000001";
const documentoVinculado: DocumentoGoogle = {
  ...documento,
  sheets: [
    {
      properties: {
        sheetId: 7,
        title: "Turma",
        gridProperties: { rowCount: 100, columnCount: 26 },
      },
      developerMetadata: [
        {
          metadataId: 12,
          metadataKey: "frequenciapp.aluno",
          metadataValue: alunoId,
          location: {
            dimensionRange: { sheetId: 7, startRowIndex: 1, endRowIndex: 2 },
          },
        },
      ],
    },
  ],
};

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

  it("sinaliza apenas o nome vinculado e exige cópia de segurança", () => {
    const plano = planejarEscritaGoogle(
      documentoVinculado,
      "Turma",
      valores,
      formulas,
      1,
      assinatura,
      [
        {
          tipo: "sinalizar",
          linha: 2,
          coluna: 1,
          valor: "DESISTENTE",
          anterior: "Ana",
          alunoId,
          nomeOriginal: "Ana",
        },
      ],
      false,
    );
    expect(plano.destrutiva).toBe(true);
    expect(plano.contagens.sinalizadas).toBe(1);
    expect(plano.requests).toMatchObject([
      { updateCells: { range: { startRowIndex: 1, startColumnIndex: 0 } } },
    ]);
  });

  it("recusa sinalização em linha sem vínculo ou com nome alterado", () => {
    const item = {
      tipo: "sinalizar",
      linha: 2,
      coluna: 1,
      valor: "DESISTENTE",
      anterior: "Ana",
      alunoId,
      nomeOriginal: "Ana",
    };
    expect(() =>
      planejarEscritaGoogle(documento, "Turma", valores, formulas, 1, assinatura, [item], false),
    ).toThrow("situação do aluno mudou");
    expect(() =>
      planejarEscritaGoogle(
        documentoVinculado,
        "Turma",
        [
          ["Aluno", "Dia"],
          ["Ana editada", ""],
        ],
        formulas,
        1,
        assinatura,
        [item],
        false,
      ),
    ).toThrow("situação do aluno mudou");
  });

  it("restaura o nome apenas ao reconhecer DESISTENTE na linha vinculada", () => {
    const comMarcador = [
      ["Aluno", "Dia"],
      ["DESISTENTE", ""],
    ];
    const plano = planejarEscritaGoogle(
      documentoVinculado,
      "Turma",
      comMarcador,
      formulas,
      1,
      assinatura,
      [
        {
          tipo: "sinalizar",
          linha: 2,
          coluna: 1,
          valor: "Ana",
          anterior: "DESISTENTE",
          alunoId,
          nomeOriginal: "Ana",
        },
      ],
      false,
    );
    expect(plano.contagens.sinalizadas).toBe(1);
  });

  it("recusa uma troca que não corresponda ao nome original", () => {
    expect(() =>
      planejarEscritaGoogle(
        documentoVinculado,
        "Turma",
        valores,
        formulas,
        1,
        assinatura,
        [
          {
            tipo: "sinalizar",
            linha: 2,
            coluna: 1,
            valor: "DESISTENTE",
            anterior: "Ana",
            alunoId,
            nomeOriginal: "Outra pessoa",
          },
        ],
        false,
      ),
    ).toThrow("situação do aluno mudou");
  });

  it("permite vínculo verificado e sinalização no mesmo lote", () => {
    const plano = planejarEscritaGoogle(
      documento,
      "Turma",
      valores,
      formulas,
      1,
      assinatura,
      [
        { tipo: "vincularLinhas", itens: [{ linha: 2, coluna: 1, nome: "Ana", alunoId }] },
        {
          tipo: "sinalizar",
          linha: 2,
          coluna: 1,
          valor: "DESISTENTE",
          anterior: "Ana",
          alunoId,
          nomeOriginal: "Ana",
        },
      ],
      false,
    );
    expect(plano.contagens).toMatchObject({ vinculadas: 1, sinalizadas: 1 });
    expect(plano.requests).toHaveLength(2);
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

  it("classifica falha de leitura antes do lote como recusa e guarda o HTTP", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/developerMetadata:search")
          ? Response.json(
              { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } },
              { status: 429 },
            )
          : Response.json(documento),
      ),
    );
    const falha = await aplicarGoogle(
      "planilha-de-teste",
      "acesso",
      "Turma",
      1,
      assinatura,
      [],
      false,
    ).catch((excecao: unknown) => excecao);
    expect(falha).toMatchObject({
      recusado: true,
      detalhe: "HTTP 429 RESOURCE_EXHAUSTED Quota exceeded",
    });
    expect(mensagemParaRegistro(falha, "padrão")).toContain("Detalhe: HTTP 429");
    erro.mockRestore();
  });

  it("guarda o motivo do Google e o lote que falhou, sem a requisição", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }),
            { status: 429 },
          ),
      ),
    );
    const falha = await enviarLotesGoogle("planilha", "acesso", [{ updateCells: {} }]).catch(
      (excecao: unknown) => excecao,
    );
    expect(falha).toMatchObject({
      recusado: true,
      detalhe: "lote 1 de 1: HTTP 429 RESOURCE_EXHAUSTED Quota exceeded",
    });
    expect(mensagemParaRegistro(falha, "padrão")).toContain("Detalhe: lote 1 de 1: HTTP 429");
    erro.mockRestore();
  });

  it("registra a queda de rede como sem resposta, ainda incerta", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("tempo", "TimeoutError");
      }),
    );
    const falha = await enviarLotesGoogle("planilha", "acesso", [{ updateCells: {} }]).catch(
      (excecao: unknown) => excecao,
    );
    expect(falha).toMatchObject({
      recusado: false,
      detalhe: "lote 1 de 1: sem resposta do Google (TimeoutError)",
    });
    erro.mockRestore();
  });
});
