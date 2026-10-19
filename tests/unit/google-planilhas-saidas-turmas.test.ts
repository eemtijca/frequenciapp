// Confere as consultas por turma, os nomes seguros e a preservação das abas existentes.
import { describe, expect, it } from "vitest";
import { assinarAba } from "@/domain/planilha";
import { planejarEscritaGoogle } from "@/infra/google-planilhas-escrita";
import type { DocumentoGoogle } from "@/infra/google-planilhas-api";
import {
  formulaSaidasTurma,
  MARCADOR_SAIDAS_ESQUEMA,
  MARCADOR_SAIDAS_TURMA,
} from "@/infra/google-planilhas-saidas-turmas";

const nome = "Saiu mais cedo";
const valores = [
  ["Data", "Aluno", "Turma", "Observação"],
  ["30/09/2026", "QA Ana", "2º ano A", "Histórico"],
];
const documento: DocumentoGoogle = {
  spreadsheetId: "qa-abas-saidas",
  properties: { title: "QA" },
  sheets: [
    {
      properties: { sheetId: 1, title: nome, gridProperties: { rowCount: 100, columnCount: 4 } },
    },
  ],
};
function planejar(doc = documento, turmas = ["1º ano A", "1º ano B"]) {
  return planejarEscritaGoogle(
    doc,
    nome,
    valores,
    [],
    1,
    assinarAba(nome, valores[0] ?? [], []),
    [
      {
        tipo: "ordenarSaidas",
        colunaTurma: 3,
        colunaAluno: 2,
        colunaData: 1,
        anoReferencia: 2026,
        turmas,
      },
    ],
    false,
  );
}
function refletirPreparacao(pedidos: Record<string, unknown>[]) {
  const doc = structuredClone(documento);
  let metadataId = 100;
  for (const pedido of pedidos) {
    if (pedido.addSheet) {
      const dados = pedido.addSheet as {
        properties: DocumentoGoogle["sheets"][number]["properties"];
      };
      doc.sheets.push({ properties: dados.properties, developerMetadata: [] });
    }
    if (pedido.createDeveloperMetadata) {
      const dados = pedido.createDeveloperMetadata as {
        developerMetadata: {
          metadataKey: string;
          metadataValue: string;
          location: { sheetId: number };
        };
      };
      const meta = dados.developerMetadata;
      doc.sheets
        .find((aba) => aba.properties.sheetId === meta.location.sheetId)
        ?.developerMetadata?.push({ ...meta, metadataId: metadataId++ });
    }
  }
  return doc;
}

describe("abas de consulta das saídas por turma", () => {
  it("cria uma aba para cada turma, incluindo histórico, sem escrever nem remover a origem", () => {
    const plano = planejar();
    const criacoes = plano.requests
      .filter((item) => item.addSheet)
      .map((item) => item.addSheet as { properties: { title: string; sheetId: number } });
    expect(criacoes.map((item) => item.properties.title)).toEqual([
      "Saiu mais cedo · 1º ano A",
      "Saiu mais cedo · 1º ano B",
      "Saiu mais cedo · 2º ano A",
    ]);
    expect(new Set(criacoes.map((item) => item.properties.sheetId)).size).toBe(3);
    expect(plano.atomico).toBe(true);
    expect(plano.destrutiva).toBe(false);
    expect(plano.requests.some((item) => item.deleteSheet || item.deleteDimension)).toBe(false);
    const escritas = plano.requests
      .filter((item) => item.updateCells)
      .map(
        (item) =>
          item.updateCells as {
            range: { sheetId: number };
            rows: { values: { userEnteredValue: { formulaValue: string } }[] }[];
          },
      );
    expect(escritas).toHaveLength(3);
    expect(escritas.every((item) => item.range.sheetId !== 1)).toBe(true);
    expect(escritas[0]?.rows[0]?.values[0]?.userEnteredValue.formulaValue).toBe(
      formulaSaidasTurma(nome, 1, 4, 3, 2, "1º ano A"),
    );
    expect(valores[1]?.[3]).toBe("Histórico");
    expect(plano.requests.filter((item) => item.addBanding)).toHaveLength(3);
  });

  it("reutiliza consultas marcadas sem duplicar nem reescrever células", () => {
    const doc = refletirPreparacao(planejar().requests);
    expect(planejar(doc).requests).toEqual([]);
    // Uma aba renomeada continua identificada pelo marcador e a fórmula acompanha a origem no Google.
    const primeira = doc.sheets[1];
    if (!primeira) throw new Error("Consulta sintética ausente.");
    primeira.properties.title = "Consulta personalizada";
    expect(planejar(doc).requests).toEqual([]);
  });

  it("preserva abas manuais com o mesmo título e distingue títulos sanitizados", () => {
    const doc = structuredClone(documento);
    doc.sheets.push({ properties: { sheetId: 2, title: "Saiu mais cedo · 1º ano A" } });
    const plano = planejar(doc, ["1º ano A", "2º [A]", "2º /A/"]);
    const titulos = plano.requests
      .filter((item) => item.addSheet)
      .map((item) => (item.addSheet as { properties: { title: string } }).properties.title);
    expect(titulos).toHaveLength(4);
    expect(titulos).not.toContain("Saiu mais cedo · 1º ano A");
    expect(new Set(titulos).size).toBe(4);
    expect(titulos.every((titulo) => !/[\\/?*:[\]]/.test(titulo) && titulo.length <= 100)).toBe(
      true,
    );
    expect(plano.requests.some((item) => item.deleteSheet)).toBe(false);
  });

  it("escapa aspas de nomes e turmas na fórmula e admite cabeçalho fora da primeira linha", () => {
    expect(formulaSaidasTurma("D'Escola", 3, 7, 4, 2, 'QA "A"')).toBe(
      "=VSTACK('D''Escola'!A3:G3,IFNA(SORT(FILTER('D''Escola'!A4:G,TRIM('D''Escola'!D4:D)=\"QA \"\"A\"\"\"),2,TRUE),IF(SEQUENCE(1,7),\"\",\"\")))",
    );
  });

  it("recusa identidades repetidas e estrutura divergente antes da escrita", () => {
    const doc = refletirPreparacao(planejar().requests);
    const consulta = doc.sheets[1];
    if (!consulta) throw new Error("Consulta sintética ausente.");
    const duplicado = structuredClone(consulta);
    duplicado.properties.sheetId = 100;
    duplicado.developerMetadata?.forEach((item) => {
      item.location.sheetId = 100;
    });
    doc.sheets.push(duplicado);
    expect(() => planejar(doc)).toThrow("Há consultas repetidas");
    doc.sheets.pop();
    consulta.developerMetadata = consulta.developerMetadata?.filter(
      (meta) => meta.metadataKey !== MARCADOR_SAIDAS_ESQUEMA,
    );
    expect(() => planejar(doc)).toThrow("A estrutura da consulta por turma mudou");
  });

  it("impede enviar registros para uma consulta por turma", () => {
    const doc = structuredClone(documento);
    const origem = doc.sheets[0];
    if (!origem) throw new Error("Origem sintética ausente.");
    origem.developerMetadata = [
      {
        metadataId: 1,
        metadataKey: MARCADOR_SAIDAS_TURMA,
        metadataValue: "QA",
        location: { sheetId: 1 },
      },
    ];
    expect(() => planejar(doc)).toThrow("Selecione a aba original de saídas");
  });

  it("aumenta somente a capacidade das consultas para comportar o crescimento do histórico", () => {
    const doc = refletirPreparacao(planejar().requests);
    const consulta = doc.sheets[1];
    if (!consulta?.properties.gridProperties) throw new Error("Consulta sintética ausente.");
    consulta.properties.gridProperties.rowCount = 10;
    expect(planejar(doc).requests).toEqual([
      { appendDimension: { sheetId: consulta.properties.sheetId, dimension: "ROWS", length: 990 } },
    ]);
  });
});
