// Cópias ocultas e restauração de abas pela Sheets API, mantendo o ID da
// aba original e os marcadores de linhas, colunas e alunos.
import { randomInt } from "node:crypto";
import { ErroHttp } from "@/infra/erros";
import { enviarLotesGoogle } from "@/infra/google-planilhas-escrita";
import {
  exigirAbaGoogle,
  lerDocumentoGoogle,
  metadadosDaAba,
  type AbaGoogle,
  type DocumentoGoogle,
  type MetadadoGoogle,
} from "@/infra/google-planilhas-api";

const PREFIXO = "_frequenciapp_backup_";
const CARIMBO = /^(\d{8})-(\d{6})(?:-\d{3})?(?:-[a-z0-9]+)?$/;
type Pedido = Record<string, unknown>;

export function copiasDaAbaGoogle(doc: DocumentoGoogle, nome: string): AbaGoogle[] {
  const prefixo = `${PREFIXO}${nome}_`;
  return doc.sheets
    .filter((aba) => {
      const titulo = aba.properties.title;
      return titulo.startsWith(prefixo) && CARIMBO.test(titulo.slice(prefixo.length));
    })
    .sort((a, b) => b.properties.title.localeCompare(a.properties.title));
}

function dataDaCopia(nome: string): string {
  const carimbo = nome.split("_").at(-1) ?? "";
  const achado = CARIMBO.exec(carimbo);
  if (!achado) return "";
  const data = achado[1] ?? "";
  const hora = achado[2] ?? "";
  return `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)} ${hora.slice(0, 2)}:${hora.slice(2, 4)}`;
}

export async function listarCopiasGoogle(id: string, acesso: string, nome: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  exigirAbaGoogle(doc, nome);
  return {
    copias: copiasDaAbaGoogle(doc, nome).map((aba) => ({
      nome: aba.properties.title,
      criadaEm: dataDaCopia(aba.properties.title),
    })),
  };
}

function mesmoMarcador(a: MetadadoGoogle, b: MetadadoGoogle): boolean {
  const localA = a.location.dimensionRange;
  const localB = b.location.dimensionRange;
  return (
    a.metadataKey === b.metadataKey &&
    a.metadataValue === b.metadataValue &&
    localA?.startRowIndex === localB?.startRowIndex &&
    localA?.startColumnIndex === localB?.startColumnIndex
  );
}

function copiarMarcador(item: MetadadoGoogle, sheetId: number): Pedido | null {
  const local = item.location.dimensionRange;
  if (!local) return null;
  const dimension = local.startRowIndex !== undefined ? "ROWS" : "COLUMNS";
  const inicio = local.startRowIndex ?? local.startColumnIndex;
  if (inicio === undefined) return null;
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: item.metadataKey,
        metadataValue: item.metadataValue ?? "1",
        visibility: "DOCUMENT",
        location: {
          dimensionRange: { sheetId, dimension, startIndex: inicio, endIndex: inicio + 1 },
        },
      },
    },
  };
}

/** Duplica a aba antes da alteração destrutiva e mantém três cópias. */
export async function criarCopiaGoogle(
  id: string,
  acesso: string,
  nome: string,
  adiarPoda = false,
): Promise<string> {
  const doc = await lerDocumentoGoogle(id, acesso);
  const origem = exigirAbaGoogle(doc, nome);
  const instante = new Date().toISOString().replace(/[-:]/g, "");
  const base = `${PREFIXO}${nome}_${instante.slice(0, 8)}-${instante.slice(9, 15)}-${instante.slice(16, 19)}`;
  let titulo = base;
  for (let sufixo = 2; doc.sheets.some((aba) => aba.properties.title === titulo); sufixo += 1) {
    titulo = `${base}-${sufixo}`;
  }
  const existentes = new Set(doc.sheets.map((aba) => aba.properties.sheetId));
  let novoId = randomInt(1, 2_147_483_647);
  while (existentes.has(novoId)) novoId = randomInt(1, 2_147_483_647);
  await enviarLotesGoogle(id, acesso, [
    {
      duplicateSheet: {
        sourceSheetId: origem.properties.sheetId,
        newSheetId: novoId,
        newSheetName: titulo,
      },
    },
    {
      updateSheetProperties: { properties: { sheetId: novoId, hidden: true }, fields: "hidden" },
    },
  ]);
  const depois = await lerDocumentoGoogle(id, acesso);
  const copia = exigirAbaGoogle(depois, titulo);
  const marcadoresOrigem = metadadosDaAba(doc, origem).filter((item) =>
    ["frequenciapp.linha", "frequenciapp.coluna", "frequenciapp.aluno"].includes(item.metadataKey),
  );
  const marcadoresCopia = metadadosDaAba(depois, copia);
  const pedidos: Pedido[] = marcadoresCopia
    .filter((item) => ["frequenciapp.aba", "frequenciapp.copia"].includes(item.metadataKey))
    .map((item) => ({
      deleteDeveloperMetadata: {
        dataFilter: { developerMetadataLookup: { metadataId: item.metadataId } },
      },
    }));
  pedidos.push({
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: "frequenciapp.copia",
        metadataValue: "1",
        visibility: "DOCUMENT",
        location: { sheetId: novoId },
      },
    },
  });
  for (const marcador of marcadoresOrigem) {
    if (marcadoresCopia.some((item) => mesmoMarcador(item, marcador))) continue;
    const pedido = copiarMarcador(marcador, novoId);
    if (pedido) pedidos.push(pedido);
  }
  await enviarLotesGoogle(id, acesso, pedidos);
  if (!adiarPoda) await podarCopiasGoogle(id, acesso, nome);
  return titulo;
}

export async function podarCopiasGoogle(id: string, acesso: string, nome: string): Promise<void> {
  const doc = await lerDocumentoGoogle(id, acesso);
  const antigas = copiasDaAbaGoogle(doc, nome).slice(3);
  if (antigas.length === 0) return;
  await enviarLotesGoogle(
    id,
    acesso,
    antigas.map((aba) => ({ deleteSheet: { sheetId: aba.properties.sheetId } })),
  );
}

/** Restaura dados e formatos dentro da mesma aba para preservar referências. */
export async function restaurarCopiaGoogle(
  id: string,
  acesso: string,
  nome: string,
  nomeCopia: string,
) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const atual = exigirAbaGoogle(doc, nome);
  const copia = copiasDaAbaGoogle(doc, nome).find((item) => item.properties.title === nomeCopia);
  if (!copia) throw new ErroHttp("Esta aba não é uma cópia da integração.", 409);
  const anterior = await criarCopiaGoogle(id, acesso, nome, true);
  const idAtual = atual.properties.sheetId;
  const idCopia = copia.properties.sheetId;
  const linhas = copia.properties.gridProperties?.rowCount ?? 1;
  const colunas = copia.properties.gridProperties?.columnCount ?? 1;
  const linhasAtuais = atual.properties.gridProperties?.rowCount ?? 1;
  const colunasAtuais = atual.properties.gridProperties?.columnCount ?? 1;
  const pedidos: Pedido[] = [];
  if (linhas > linhasAtuais || colunas > colunasAtuais) {
    pedidos.push({
      updateSheetProperties: {
        properties: {
          sheetId: idAtual,
          gridProperties: {
            rowCount: Math.max(linhas, linhasAtuais),
            columnCount: Math.max(colunas, colunasAtuais),
          },
        },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    });
  }
  const destino = {
    sheetId: idAtual,
    startRowIndex: 0,
    endRowIndex: Math.max(linhas, linhasAtuais),
    startColumnIndex: 0,
    endColumnIndex: Math.max(colunas, colunasAtuais),
  };
  pedidos.push({ unmergeCells: { range: destino } });
  pedidos.push({
    repeatCell: {
      range: destino,
      cell: {},
      fields: "userEnteredValue,userEnteredFormat,note,dataValidation",
    },
  });
  pedidos.push({
    copyPaste: {
      source: {
        sheetId: idCopia,
        startRowIndex: 0,
        endRowIndex: linhas,
        startColumnIndex: 0,
        endColumnIndex: colunas,
      },
      destination: {
        sheetId: idAtual,
        startRowIndex: 0,
        endRowIndex: linhas,
        startColumnIndex: 0,
        endColumnIndex: colunas,
      },
      pasteType: "PASTE_NORMAL",
      pasteOrientation: "NORMAL",
    },
  });
  for (const mesclagem of copia.merges ?? []) {
    pedidos.push({
      mergeCells: { range: { ...mesclagem, sheetId: idAtual }, mergeType: "MERGE_ALL" },
    });
  }
  pedidos.push({
    updateSheetProperties: {
      properties: {
        sheetId: idAtual,
        hidden: false,
        gridProperties: {
          frozenRowCount: copia.properties.gridProperties?.frozenRowCount ?? 0,
          frozenColumnCount: copia.properties.gridProperties?.frozenColumnCount ?? 0,
        },
      },
      fields: "hidden,gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
    },
  });
  const chaves = ["frequenciapp.linha", "frequenciapp.coluna", "frequenciapp.aluno"];
  for (const item of metadadosDaAba(doc, atual)) {
    if (!chaves.includes(item.metadataKey)) continue;
    pedidos.push({
      deleteDeveloperMetadata: {
        dataFilter: { developerMetadataLookup: { metadataId: item.metadataId } },
      },
    });
  }
  for (const item of metadadosDaAba(doc, copia)) {
    if (!chaves.includes(item.metadataKey)) continue;
    const pedido = copiarMarcador(item, idAtual);
    if (pedido) pedidos.push(pedido);
  }
  await enviarLotesGoogle(id, acesso, pedidos);
  await podarCopiasGoogle(id, acesso, nome);
  return { aba: nome, copia: nomeCopia, anterior };
}
