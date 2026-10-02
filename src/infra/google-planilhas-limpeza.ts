// Limpeza das cópias antigas identificadas pelo nome e marcador da integração.
import { ErroHttp } from "./erros";
import { lerDocumentoGoogle, metadadosDaAba, type DocumentoGoogle } from "./google-planilhas-api";
import { enviarLotesGoogle } from "./google-planilhas-escrita";

const NOME_BACKUP = /^_frequenciapp_backup_.+_\d{8}-\d{6}(?:-\d{3})?(?:-[a-z0-9]+)?$/;

export function backupsAntigosGoogle(doc: DocumentoGoogle) {
  return doc.sheets.filter(
    (aba) =>
      NOME_BACKUP.test(aba.properties.title) &&
      metadadosDaAba(doc, aba).some(
        (item) =>
          item.metadataKey === "frequenciapp.copia" &&
          item.metadataValue === "1" &&
          item.location.sheetId === aba.properties.sheetId,
      ),
  );
}

export async function listarAbasBackupGoogle(id: string, acesso: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  return {
    copias: backupsAntigosGoogle(doc)
      .map((aba) => aba.properties.title)
      .sort(),
  };
}

export async function removerAbasBackupGoogle(id: string, acesso: string, nomes: string[]) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const copias = backupsAntigosGoogle(doc);
  const atuais = copias.map((aba) => aba.properties.title).sort();
  if (JSON.stringify(atuais) !== JSON.stringify([...nomes].sort()))
    throw new ErroHttp("As cópias mudaram. Confira uma nova prévia antes de remover.", 409);
  const ids = new Set(copias.map((aba) => aba.properties.sheetId));
  if (!doc.sheets.some((aba) => !aba.properties.hidden && !ids.has(aba.properties.sheetId)))
    throw new ErroHttp("A planilha precisa manter uma aba visível.", 409);
  if (copias.length)
    await enviarLotesGoogle(
      id,
      acesso,
      copias.map((aba) => ({ deleteSheet: { sheetId: aba.properties.sheetId } })),
    );
  return { removidas: copias.length };
}
