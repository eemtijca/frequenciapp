// Formatação pela Sheets API: máscaras limitadas a estilos e conferência prévia.
import type { ApresentacaoAba } from "@/domain/planilha-apresentacao";
import { CORES_PLANILHA, faixasDeApresentacao } from "@/domain/planilha-apresentacao";
import { assinarAba } from "@/domain/planilha";
import { ErroHttp } from "./erros";
import {
  exigirAbaGoogle,
  lerDocumentoGoogle,
  lerBlocosGoogle,
  tamanhoUtilizado,
  mesclagensDaAssinatura,
} from "./google-planilhas-api";
import { enviarLotesGoogle } from "./google-planilhas-escrita";

function cor(hex: string) {
  return {
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

export function pedidosDeApresentacao(
  sheetId: number,
  linhas: number,
  plano: ApresentacaoAba,
  congeladas = 0,
  bandas: {
    bandedRangeId: number;
    range: {
      startRowIndex?: number;
      endRowIndex?: number;
      startColumnIndex?: number;
      endColumnIndex?: number;
    };
  }[] = [],
) {
  const pedidos: Record<string, unknown>[] = [];
  const faixas = faixasDeApresentacao(plano.colunas);
  // Recusa sobreposição com uma faixa manual; reaplicar o mesmo padrão atualiza a faixa.
  for (const faixa of faixas) {
    const range = {
      sheetId,
      startRowIndex: plano.cabecalhoLinha - 1,
      endRowIndex: linhas,
      startColumnIndex: faixa.coluna - 1,
      endColumnIndex: faixa.coluna - 1 + faixa.colunas,
    };
    const sobrepostas = bandas.filter(
      ({ range: existente }) =>
        (existente.startRowIndex ?? 0) < linhas &&
        (existente.endRowIndex ?? linhas) > range.startRowIndex &&
        (existente.startColumnIndex ?? 0) < range.endColumnIndex &&
        (existente.endColumnIndex ?? Number.POSITIVE_INFINITY) > range.startColumnIndex,
    );
    if (
      sobrepostas.some(
        ({ range: existente }) =>
          (existente.startRowIndex ?? 0) !== range.startRowIndex ||
          (existente.startColumnIndex ?? 0) !== range.startColumnIndex ||
          existente.endColumnIndex !== range.endColumnIndex,
      )
    )
      throw new ErroHttp(
        "A aba já tem cores alternadas em outro intervalo. Ajuste esse intervalo na planilha antes de organizar.",
        409,
      );
    const rowProperties = {
      headerColor: cor(CORES_PLANILHA.cabecalho),
      firstBandColor: cor(CORES_PLANILHA.primeiraLinha),
      secondBandColor: cor(CORES_PLANILHA.segundaLinha),
    };
    if (sobrepostas.length > 0) {
      for (const banda of sobrepostas)
        pedidos.push({
          updateBanding: {
            bandedRange: { bandedRangeId: banda.bandedRangeId, range, rowProperties },
            fields: "range,rowProperties",
          },
        });
    } else pedidos.push({ addBanding: { bandedRange: { range, rowProperties } } });
  }
  pedidos.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: Math.max(congeladas, plano.cabecalhoLinha) },
      },
      fields: "gridProperties.frozenRowCount",
    },
  });
  pedidos.push({
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: plano.cabecalhoLinha - 1,
        endIndex: plano.cabecalhoLinha,
      },
      properties: { pixelSize: 44 },
      fields: "pixelSize",
    },
  });
  for (const coluna of plano.colunas) {
    const range = {
      sheetId,
      startRowIndex: plano.cabecalhoLinha - 1,
      endRowIndex: linhas,
      startColumnIndex: coluna.indice - 1,
      endColumnIndex: coluna.indice,
    };
    pedidos.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: coluna.indice - 1,
          endIndex: coluna.indice,
        },
        properties: { pixelSize: coluna.largura },
        fields: "pixelSize",
      },
    });
    if (linhas > plano.cabecalhoLinha)
      pedidos.push({
        repeatCell: {
          range: { ...range, startRowIndex: plano.cabecalhoLinha },
          cell: { userEnteredFormat: { textFormat: { foregroundColor: cor("#1f2937") } } },
          fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
        },
      });
    pedidos.push({
      repeatCell: {
        range,
        cell: {
          userEnteredFormat: {
            verticalAlignment: "TOP",
            horizontalAlignment: coluna.alinhamento,
            wrapStrategy: "WRAP",
          },
        },
        fields:
          "userEnteredFormat.verticalAlignment,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy",
      },
    });
    pedidos.push({
      repeatCell: {
        range: { ...range, endRowIndex: plano.cabecalhoLinha },
        cell: {
          userEnteredFormat: {
            backgroundColor: cor(CORES_PLANILHA.cabecalho),
            textFormat: { bold: true, foregroundColor: cor(CORES_PLANILHA.textoCabecalho) },
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.verticalAlignment",
      },
    });
  }
  return pedidos;
}

export async function organizarAbaGoogle(id: string, acesso: string, plano: ApresentacaoAba) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const aba = exigirAbaGoogle(doc, plano.aba);
  if (aba.properties.hidden || aba.merges?.length)
    throw new ErroHttp("Organize apenas abas visíveis e sem células mescladas.", 409);
  const usado = await tamanhoUtilizado(id, acesso, plano.aba);
  const [bloco] = await lerBlocosGoogle(id, acesso, plano.aba, plano.cabecalhoLinha, [
    { coluna: 1, colunas: Math.max(usado.colunas, 1) },
  ]);
  const assinatura = assinarAba(
    plano.aba,
    bloco?.valores[plano.cabecalhoLinha - 1] ?? [],
    mesclagensDaAssinatura(aba),
  );
  if (assinatura !== plano.assinatura)
    throw new ErroHttp("A estrutura da planilha mudou. Confira de novo antes de organizar.", 409);
  const linhas = aba.properties.gridProperties?.rowCount ?? Math.max(usado.linhas, 1);
  await enviarLotesGoogle(
    id,
    acesso,
    pedidosDeApresentacao(
      aba.properties.sheetId,
      linhas,
      plano,
      aba.properties.gridProperties?.frozenRowCount,
      aba.bandedRanges,
    ),
  );
  return { aba: plano.aba };
}
