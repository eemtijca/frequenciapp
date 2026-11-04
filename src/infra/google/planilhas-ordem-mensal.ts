// Ordena abas mensais por período, preservando os lugares das demais abas da planilha.
import { mensalDaAbaGoogle, type DocumentoGoogle } from "./planilhas-api";

export function planejarOrdemMensalGoogle(
  doc: DocumentoGoogle,
  nova?: { sheetId: number; mes: string },
): { pedidos: Record<string, unknown>[]; ordem: number[] } {
  const abas = doc.sheets
    .map((aba, posicao) => ({
      sheetId: aba.properties.sheetId,
      mes: mensalDaAbaGoogle(doc, aba)?.mes,
      indice: aba.properties.index ?? posicao,
    }))
    .sort((a, b) => a.indice - b.indice);
  // addSheet sem índice acrescenta a nova aba ao final, antes destes movimentos.
  if (nova) abas.push({ ...nova, indice: abas.length });

  const posicoesMensais = abas.flatMap((aba, indice) => (aba.mes ? [indice] : []));
  const mensais = abas
    .flatMap((aba) => (aba.mes ? [{ sheetId: aba.sheetId, mes: aba.mes }] : []))
    .sort((a, b) => b.mes.localeCompare(a.mes));
  const ordem = abas.map((aba) => aba.sheetId);
  for (const [indice, aba] of mensais.entries()) {
    const posicao = posicoesMensais[indice];
    if (posicao !== undefined) ordem[posicao] = aba.sheetId;
  }

  const atual = abas.map((aba) => aba.sheetId);
  const pedidos: Record<string, unknown>[] = [];
  for (const [destino, sheetId] of ordem.entries()) {
    const origem = atual.indexOf(sheetId);
    // Os lugares anteriores já estão definitivos; cada movimento vem da direita.
    if (origem > destino) {
      pedidos.push({
        updateSheetProperties: { properties: { sheetId, index: destino }, fields: "index" },
      });
      atual.splice(origem, 1);
      atual.splice(destino, 0, sheetId);
    }
  }
  return { pedidos, ordem };
}
