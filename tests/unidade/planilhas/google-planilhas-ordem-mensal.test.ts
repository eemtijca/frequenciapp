// Confere a ordem física dos meses sem deslocar definitivamente abas manuais ou legadas.
import { describe, expect, it } from "vitest";
import type { AbaGoogle, DocumentoGoogle } from "@/infra/google/planilhas-api";
import { planejarOrdemMensalGoogle } from "@/infra/google/planilhas-ordem-mensal";

const GERACAO = "30000000-0000-4000-8000-000000000001";

function aba(sheetId: number, mes?: string, index?: number): AbaGoogle {
  const marcadores: [string, string][] = [
    ["frequenciapp.aba", "1"],
    ["frequenciapp.turma", `10000000-0000-4000-8000-${String(sheetId).padStart(12, "0")}`],
    ["frequenciapp.mes", mes ?? ""],
    ["frequenciapp.geracao", GERACAO],
  ];
  return {
    properties: {
      sheetId,
      title: `QA Aba ${sheetId}`,
      ...(index === undefined ? {} : { index }),
    },
    ...(mes
      ? {
          developerMetadata: marcadores.map(([metadataKey, metadataValue], indice) => ({
            metadataId: sheetId * 10 + indice,
            metadataKey,
            metadataValue,
            location: { sheetId },
          })),
        }
      : {}),
  };
}

function documento(sheets: AbaGoogle[]): DocumentoGoogle {
  return { spreadsheetId: "arquivo", properties: { title: "QA Frequência" }, sheets };
}

function aplicarMovimentos(inicial: number[], pedidos: Record<string, unknown>[]): number[] {
  const ordem = [...inicial];
  for (const pedido of pedidos) {
    expect(Object.keys(pedido)).toEqual(["updateSheetProperties"]);
    const atualizacao = pedido.updateSheetProperties as {
      properties: { sheetId: number; index: number };
      fields: string;
    };
    expect(atualizacao.fields).toBe("index");
    expect(Object.keys(atualizacao.properties).sort()).toEqual(["index", "sheetId"]);
    const { sheetId, index } = atualizacao.properties;
    const origem = ordem.indexOf(sheetId);
    // O Google interpreta o índice antes da remoção: mover à esquerda evita ambiguidade.
    expect(origem).toBeGreaterThan(index);
    expect(index).toBeGreaterThanOrEqual(0);
    ordem.splice(origem, 1);
    ordem.splice(index, 0, sheetId);
  }
  return ordem;
}

describe("ordem física das abas mensais", () => {
  it("coloca meses recentes primeiro e mantém a ordem das turmas dentro do mesmo mês", () => {
    const doc = documento([
      aba(1, "2025-12"),
      aba(2, "2026-01"),
      aba(3, "2026-11"),
      aba(4, "2026-01"),
      aba(5, "2026-11"),
    ]);
    const antes = structuredClone(doc);
    const plano = planejarOrdemMensalGoogle(doc);
    expect(plano.ordem).toEqual([3, 5, 2, 4, 1]);
    expect(aplicarMovimentos([1, 2, 3, 4, 5], plano.pedidos)).toEqual(plano.ordem);
    expect(doc).toEqual(antes);
  });

  it("conserva os lugares finais das abas manuais, legadas e de backup intercaladas", () => {
    const manual = aba(10);
    manual.properties.title = "1º A · Dezembro 2099";
    const legada = aba(11);
    legada.properties.title = "QA Turma sem mês";
    const copia = aba(12);
    copia.properties.title = "_frequenciapp_backup_QA";
    copia.properties.hidden = true;
    const doc = documento([
      manual,
      aba(1, "2026-09"),
      legada,
      aba(2, "2026-10"),
      copia,
      aba(3, "2026-11"),
    ]);
    const plano = planejarOrdemMensalGoogle(doc);
    expect(plano.ordem).toEqual([10, 3, 11, 2, 12, 1]);
    expect(aplicarMovimentos([10, 1, 11, 2, 12, 3], plano.pedidos)).toEqual(plano.ordem);
    expect(copia.properties.hidden).toBe(true);
  });

  it("usa os índices físicos mesmo quando o Google devolve as abas fora de ordem", () => {
    const doc = documento([
      aba(3, "2026-11", 3),
      aba(1, "2026-09", 0),
      aba(2, "2026-11", 2),
      aba(10, undefined, 1),
    ]);
    const plano = planejarOrdemMensalGoogle(doc);
    expect(plano.ordem).toEqual([2, 10, 3, 1]);
    expect(aplicarMovimentos([1, 10, 2, 3], plano.pedidos)).toEqual(plano.ordem);
  });

  it("inclui a nova aba virtual no fim antes de organizar os meses", () => {
    const doc = documento([aba(1, "2026-09"), aba(10), aba(2, "2026-10")]);
    const plano = planejarOrdemMensalGoogle(doc, { sheetId: 3, mes: "2026-11" });
    expect(plano.ordem).toEqual([3, 10, 2, 1]);
    expect(aplicarMovimentos([1, 10, 2, 3], plano.pedidos)).toEqual(plano.ordem);
    expect(doc.sheets).toHaveLength(3);
  });

  it("mantém a nova turma depois das demais abas do mesmo mês", () => {
    const doc = documento([aba(1, "2026-11"), aba(10), aba(2, "2026-10")]);
    const plano = planejarOrdemMensalGoogle(doc, { sheetId: 3, mes: "2026-11" });
    expect(plano.ordem).toEqual([1, 10, 3, 2]);
    expect(aplicarMovimentos([1, 10, 2, 3], plano.pedidos)).toEqual(plano.ordem);
  });

  it("dispensa movimentos quando a ordem já está correta", () => {
    const doc = documento([aba(1, "2026-11"), aba(10), aba(2, "2026-10")]);
    expect(planejarOrdemMensalGoogle(doc)).toEqual({ pedidos: [], ordem: [1, 10, 2] });
    expect(planejarOrdemMensalGoogle(doc, { sheetId: 3, mes: "2026-09" })).toEqual({
      pedidos: [],
      ordem: [1, 10, 2, 3],
    });
    expect(planejarOrdemMensalGoogle(documento([aba(10), aba(11)]))).toEqual({
      pedidos: [],
      ordem: [10, 11],
    });
  });

  it("recusa identificação mensal inválida antes de planejar movimentos", () => {
    expect(() => planejarOrdemMensalGoogle(documento([aba(1, "2026-13")]))).toThrow(
      "Confira a identificação das abas mensais na planilha.",
    );
  });
});
