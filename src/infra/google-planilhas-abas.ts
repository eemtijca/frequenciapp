// Criação e remoção de abas pelo Google Sheets, com marcadores que impedem
// apagar uma aba criada manualmente pela escola.
import { randomInt } from "node:crypto";
import { ErroHttp } from "@/infra/erros";
import { criarCopiaGoogle } from "@/infra/google-planilhas-copias";
import { enviarLotesGoogle } from "@/infra/google-planilhas-escrita";
import { exigirAbaGoogle, lerDocumentoGoogle, metadadosDaAba } from "@/infra/google-planilhas-api";

export async function criarAbaGoogle(
  id: string,
  acesso: string,
  nome: string,
  cabecalho?: string[],
) {
  const doc = await lerDocumentoGoogle(id, acesso);
  if (doc.sheets.some((aba) => aba.properties.title === nome)) {
    throw new ErroHttp("Já existe uma aba com esse nome.", 409);
  }
  const ids = new Set(doc.sheets.map((aba) => aba.properties.sheetId));
  let sheetId = randomInt(1, 2_147_483_647);
  while (ids.has(sheetId)) sheetId = randomInt(1, 2_147_483_647);
  const titulos = cabecalho?.length ? cabecalho : ["Aluno", "Turma atual"];
  await enviarLotesGoogle(id, acesso, [
    { addSheet: { properties: { sheetId, title: nome, gridProperties: { frozenRowCount: 1 } } } },
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: "frequenciapp.aba",
          metadataValue: "1",
          visibility: "DOCUMENT",
          location: { sheetId },
        },
      },
    },
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: titulos.length,
        },
        rows: [
          { values: titulos.map((titulo) => ({ userEnteredValue: { stringValue: titulo } })) },
        ],
        fields: "userEnteredValue",
      },
    },
  ]);
  return { aba: nome };
}

export async function removerAbaGoogle(id: string, acesso: string, nome: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const aba = exigirAbaGoogle(doc, nome);
  if (doc.sheets.filter((item) => !item.properties.hidden).length <= 1) {
    throw new ErroHttp("A planilha precisa de uma aba.", 409);
  }
  if (
    !metadadosDaAba(doc, aba).some(
      (item) =>
        item.metadataKey === "frequenciapp.aba" && item.location.sheetId === aba.properties.sheetId,
    )
  ) {
    throw new ErroHttp("Esta aba não foi criada pela integração.", 409);
  }
  await criarCopiaGoogle(id, acesso, nome);
  await enviarLotesGoogle(id, acesso, [{ deleteSheet: { sheetId: aba.properties.sheetId } }]);
  return { aba: nome };
}
