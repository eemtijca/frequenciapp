// Apresentação e correção de cabeçalhos pela Sheets API, sem criar abas de backup.
import type { ApresentacaoAba } from "@/domain/planilha-apresentacao";
import {
  CORES_PLANILHA,
  faixasDeApresentacao,
  assinaturaIntroducao,
  introducaoReconhecida,
} from "@/domain/planilha-apresentacao";
import { assinarAba, dataDoRotulo } from "@/domain/planilha";
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
  const ajuste = plano.ajusteCabecalho;
  if (
    aba.properties.hidden ||
    aba.merges?.some(
      (mesclagem) =>
        !ajuste || (mesclagem.endRowIndex ?? Number.POSITIVE_INFINITY) > ajuste.linhasRemover,
    )
  )
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
  // Valida também a apresentação antes de alterar células.
  pedidosDeApresentacao(
    aba.properties.sheetId,
    linhas,
    plano,
    aba.properties.gridProperties?.frozenRowCount,
    aba.bandedRanges,
  );
  const pedidos: Record<string, unknown>[] = [];
  let apresentacao = plano;
  let bandas = aba.bandedRanges;
  let removidas = 0;
  if (ajuste) {
    removidas = ajuste.linhasRemover;
    const introducao = bloco?.valores.slice(0, removidas) ?? [];
    const cabecalho = bloco?.valores[plano.cabecalhoLinha - 1] ?? [];
    if (
      removidas !== plano.cabecalhoLinha - 1 ||
      !introducaoReconhecida(introducao) ||
      assinaturaIntroducao(introducao) !== ajuste.assinaturaIntroducao ||
      bloco?.formula.slice(0, removidas).some((linha) => linha.some(Boolean)) ||
      ajuste.datas.some((data) => {
        const ano = Number(data.rotulo.slice(-4));
        return (
          cabecalho[data.indice - 1] !== data.anterior ||
          bloco?.formula[plano.cabecalhoLinha - 1]?.[data.indice - 1] ||
          !dataDoRotulo(data.rotulo, ano) ||
          dataDoRotulo(data.anterior, ano) !== dataDoRotulo(data.rotulo, ano)
        );
      })
    )
      throw new ErroHttp("O cabeçalho mudou ou contém fórmulas. Confira uma nova prévia.", 409);
    if (removidas || ajuste.datas.length) {
      // Reconfere as células imediatamente antes de alterar o cabeçalho.
      const [reconferido] = await lerBlocosGoogle(id, acesso, plano.aba, plano.cabecalhoLinha, [
        { coluna: 1, colunas: Math.max(usado.colunas, 1) },
      ]);
      if (JSON.stringify(reconferido) !== JSON.stringify(bloco))
        throw new ErroHttp("O cabeçalho mudou antes da correção. Confira uma nova prévia.", 409);
    }
    for (const data of ajuste.datas)
      pedidos.push({
        updateCells: {
          range: {
            sheetId: aba.properties.sheetId,
            startRowIndex: plano.cabecalhoLinha - 1,
            endRowIndex: plano.cabecalhoLinha,
            startColumnIndex: data.indice - 1,
            endColumnIndex: data.indice,
          },
          rows: [{ values: [{ userEnteredValue: { stringValue: data.rotulo } }] }],
          fields: "userEnteredValue",
        },
      });
    if (removidas)
      pedidos.push({
        deleteDimension: {
          range: {
            sheetId: aba.properties.sheetId,
            dimension: "ROWS",
            startIndex: 0,
            endIndex: removidas,
          },
        },
      });
    apresentacao = { ...plano, cabecalhoLinha: plano.cabecalhoLinha - removidas };
    bandas = bandas?.map((banda) => ({
      ...banda,
      range: {
        ...banda.range,
        startRowIndex: Math.max(0, (banda.range.startRowIndex ?? 0) - removidas),
        endRowIndex: Math.max(0, (banda.range.endRowIndex ?? linhas) - removidas),
      },
    }));
  }
  pedidos.push(
    ...pedidosDeApresentacao(
      aba.properties.sheetId,
      linhas - removidas,
      apresentacao,
      Math.max(0, (aba.properties.gridProperties?.frozenRowCount ?? 0) - removidas),
      bandas,
    ),
  );
  await enviarLotesGoogle(id, acesso, pedidos);
  return { aba: plano.aba };
}
