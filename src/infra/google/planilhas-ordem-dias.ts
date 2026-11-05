// Ordena as colunas próprias de datas sem reescrever células nem deslocar colunas manuais.
import { ehDiaValido } from "@/domain/frequencia";
import { planejarOrdenacaoLinhasPlanilha } from "@/domain/ordenacao-planilha";
import { dataDoRotulo } from "@/domain/planilha";
import { ErroHttp } from "@/infra/erros";
import type { AbaGoogle } from "./planilhas-api";

/** Os índices próprios são baseados em um; os movimentos abrangem a coluna inteira. */
export function planejarOrdemDiasGoogle(
  sheetId: number,
  mes: string,
  cabecalho: readonly string[],
  formulas: readonly boolean[],
  colunas: ReadonlySet<number>,
  mesclagens: NonNullable<AbaGoogle["merges"]> = [],
): Record<string, unknown>[] {
  const datas = cabecalho.map((rotulo) => {
    const dia = dataDoRotulo(rotulo, Number(mes.slice(0, 4)));
    return dia && ehDiaValido(dia) ? dia : null;
  });
  const proprias = datas.flatMap((dia, indice) => {
    if (!dia || !colunas.has(indice + 1)) return [];
    if (
      formulas[indice] ||
      !dia.startsWith(`${mes}-`) ||
      datas.some((outra, posicao) => posicao !== indice && outra === dia)
    )
      throw new ErroHttp(
        "Confira as datas e as fórmulas do cabeçalho antes de ordenar os dias.",
        409,
      );
    return [{ linha: indice + 1, nome: dia }];
  });
  const movimentos = planejarOrdenacaoLinhasPlanilha(proprias, (a, b) =>
    a.nome.localeCompare(b.nome),
  );
  if (
    movimentos.some(({ origem, destino }) =>
      mesclagens.some((mesclagem) => {
        const inicio = mesclagem.startColumnIndex ?? 0;
        const fim = mesclagem.endColumnIndex ?? Number.POSITIVE_INFINITY;
        return (
          fim - inicio > 1 &&
          inicio < Math.max(origem, destino) &&
          fim > Math.min(origem, destino) - 1
        );
      }),
    )
  )
    throw new ErroHttp("Confira as células mescladas na tabela antes de ordenar os dias.", 409);
  return movimentos.map(({ origem, destino }) => ({
    moveDimension: {
      source: { sheetId, dimension: "COLUMNS", startIndex: origem - 1, endIndex: origem },
      destinationIndex: destino < origem ? destino - 1 : destino,
    },
  }));
}
