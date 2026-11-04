// Confere a ordenação das datas e a preservação das posições das demais colunas.
import { describe, expect, it } from "vitest";
import { planejarOrdemDiasGoogle } from "@/infra/google/planilhas-ordem-dias";
import type { AbaGoogle } from "@/infra/google/planilhas-api";

type Movimento = {
  moveDimension: {
    source: { sheetId: number; dimension: string; startIndex: number; endIndex: number };
    destinationIndex: number;
  };
};

function aplicarMovimentos<T>(colunas: readonly T[], pedidos: Record<string, unknown>[]): T[] {
  const resultado = [...colunas];
  for (const pedido of pedidos) {
    expect(Object.keys(pedido)).toEqual(["moveDimension"]);
    const { source, destinationIndex } = (pedido as Movimento).moveDimension;
    expect(source).toMatchObject({ sheetId: 7, dimension: "COLUMNS" });
    expect(source.endIndex).toBe(source.startIndex + 1);
    const retirada = resultado.splice(source.startIndex, 1);
    const destino = destinationIndex > source.startIndex ? destinationIndex - 1 : destinationIndex;
    resultado.splice(destino, 0, ...retirada);
  }
  return resultado;
}

function planejar(
  cabecalho: string[],
  colunas = new Set(cabecalho.map((_, indice) => indice + 1)),
  formulas: boolean[] = [],
  mesclagens: NonNullable<AbaGoogle["merges"]> = [],
) {
  return planejarOrdemDiasGoogle(7, "2026-10", cabecalho, formulas, colunas, mesclagens);
}

describe("ordem dos dias da aba mensal", () => {
  it("coloca o dia 28 recuperado de feriado antes do dia 29 com as colunas inteiras", () => {
    const colunas = [
      { rotulo: "Aluno", valor: "QA Ana", nota: "", formula: "", marcador: 1 },
      { rotulo: "27/10/2026", valor: "P", nota: "", formula: "", marcador: 2 },
      { rotulo: "29/10/2026", valor: "F", nota: "QA Nota do dia 29", formula: "", marcador: 3 },
      { rotulo: "28/10/2026", valor: "P", nota: "", formula: '=IF(TRUE,"P","")', marcador: 4 },
    ];
    const anterior = structuredClone(colunas);
    const pedidos = planejar(colunas.map((coluna) => coluna.rotulo));
    expect(pedidos).toHaveLength(1);
    expect(aplicarMovimentos(colunas, pedidos)).toEqual([
      colunas[0],
      colunas[1],
      colunas[3],
      colunas[2],
    ]);
    expect(colunas).toEqual(anterior);
  });

  it("ordena vários dias retroativos e mantém as colunas manuais e o total nos mesmos lugares", () => {
    const cabecalho = ["Aluno", "29/10", "Observações", "28/10", "15/09", "01/10", "Total"];
    const colunas = new Set([6, 1, 4, 2]);
    const anterior = [...colunas];
    const pedidos = planejar(cabecalho, colunas);
    const ordenadas = aplicarMovimentos(cabecalho, pedidos);
    expect(ordenadas).toEqual([
      "Aluno",
      "01/10",
      "Observações",
      "28/10",
      "15/09",
      "29/10",
      "Total",
    ]);
    expect([...colunas]).toEqual(anterior);
    expect(planejar(ordenadas, colunas)).toEqual([]);
  });

  it("reconhece formatos de data e não ordena rótulos inválidos ou colunas sem marcador", () => {
    const cabecalho = ["Aluno", "2026-10-29", "29/02/2026", "28.10.26", "01/10", "02-10-2026"];
    const colunas = new Set([1, 2, 3, 4, 6]);
    expect(aplicarMovimentos(cabecalho, planejar(cabecalho, colunas))).toEqual([
      "Aluno",
      "02-10-2026",
      "29/02/2026",
      "28.10.26",
      "01/10",
      "2026-10-29",
    ]);
  });

  it.each([
    ["Aluno", "27/10", "28/10", "29/10"],
    ["Aluno", "28/10", "Total"],
    ["Aluno", "Observações"],
    [],
  ])("não gera escrita para cabeçalho já ordenado %j", (...cabecalho) => {
    expect(planejar(cabecalho)).toEqual([]);
  });

  it.each([
    { cabecalho: ["Aluno", "29/10", "29/10/2026"], colunas: new Set([1, 2, 3]) },
    { cabecalho: ["Aluno", "29/10", "2026-10-29"], colunas: new Set([1, 2]) },
    { cabecalho: ["Aluno", "29/10", "01/11"], colunas: new Set([1, 2, 3]) },
  ])("recusa datas ambíguas ou de outro mês $cabecalho", ({ cabecalho, colunas }) => {
    expect(() => planejar(cabecalho, colunas)).toThrow(
      "Confira as datas e as fórmulas do cabeçalho antes de ordenar os dias.",
    );
  });

  it("recusa cabeçalho de data calculado por fórmula", () => {
    expect(() => planejar(["Aluno", "29/10", "28/10"], undefined, [false, true])).toThrow(
      "Confira as datas e as fórmulas do cabeçalho antes de ordenar os dias.",
    );
  });

  it("recusa uma mesclagem horizontal nas colunas manuais atravessadas", () => {
    const cabecalho = ["Aluno", "29/10", "Manual", "", "28/10"];
    const mesclagens = [
      { startRowIndex: 3, endRowIndex: 4, startColumnIndex: 2, endColumnIndex: 4 },
    ];
    const anterior = structuredClone(mesclagens);
    expect(() => planejar(cabecalho, new Set([1, 2, 5]), [], mesclagens)).toThrow(
      "Confira as células mescladas na tabela antes de ordenar os dias.",
    );
    expect(mesclagens).toEqual(anterior);
  });

  it("aceita mesclagens verticais e horizontais fora do intervalo movido", () => {
    const cabecalho = ["Aluno", "29/10", "28/10", "Manual", ""];
    const pedidos = planejar(
      cabecalho,
      new Set([1, 2, 3]),
      [],
      [
        { startRowIndex: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
        { startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 5 },
      ],
    );
    expect(aplicarMovimentos(cabecalho, pedidos)).toEqual([
      "Aluno",
      "28/10",
      "29/10",
      "Manual",
      "",
    ]);
  });

  it("ignora mesclagens quando não há colunas para mover", () => {
    expect(
      planejar(
        ["Aluno", "28/10", "29/10"],
        undefined,
        [],
        [{ startColumnIndex: 1, endColumnIndex: 3 }],
      ),
    ).toEqual([]);
  });
});
