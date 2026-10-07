// Prepara Entradas com o padrão visual de Saídas e remove somente Sheet1 vazia.
import { ABA_ENTRADAS, CABECALHO_ENTRADAS } from "@/domain/planilha-entradas";
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { assinarAba } from "@/domain/planilha";
import { normalizar } from "@/domain/frequencia";
import { ErroHttp } from "./erros";
import { criarAbaGoogle } from "./google-planilhas-abas";
import { organizarAbaGoogle } from "./google-planilhas-apresentacao";
import { enviarLotesGoogle } from "./google-planilhas-escrita";
import {
  abaVaziaGoogle,
  lerDocumentoGoogle,
  lerBlocosGoogle,
  tamanhoUtilizado,
  metadadosDaAba,
} from "./google-planilhas-api";

export async function prepararEntradasGoogle(id: string, acesso: string, abaSaidas?: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const existente = doc.sheets.find((aba) => aba.properties.title === ABA_ENTRADAS);
  if (!existente) {
    await criarAbaGoogle(id, acesso, ABA_ENTRADAS, CABECALHO_ENTRADAS);
  } else {
    const usado = await tamanhoUtilizado(id, acesso, ABA_ENTRADAS);
    if (usado.colunas > 400) throw new ErroHttp("Confira as colunas da aba Entradas.", 409);
    const [bloco] = await lerBlocosGoogle(id, acesso, ABA_ENTRADAS, 1, [
      { coluna: 1, colunas: Math.max(usado.colunas, CABECALHO_ENTRADAS.length) },
    ]);
    const cabecalho = bloco?.valores[0] ?? [];
    if (
      CABECALHO_ENTRADAS.some(
        (titulo, indice) => normalizar(cabecalho[indice] ?? "") !== normalizar(titulo),
      ) ||
      bloco?.formula[0]?.some(Boolean)
    )
      throw new ErroHttp("Confira o cabeçalho padrão da aba Entradas antes de preparar.", 409);
    await organizarAbaGoogle(id, acesso, {
      aba: ABA_ENTRADAS,
      cabecalhoLinha: 1,
      assinatura: assinarAba(ABA_ENTRADAS, cabecalho, []),
      colunas: colunasDeNovaAba(CABECALHO_ENTRADAS),
    });
  }
  // A leitura acontece após a preparação: nunca remove a única aba útil do arquivo.
  const atualizado = await lerDocumentoGoogle(id, acesso);
  const padrao = atualizado.sheets.find((aba) => aba.properties.title === "Sheet1");
  let sheet1: "ausente" | "removida" | "mantida" = padrao ? "mantida" : "ausente";
  const saidas = atualizado.sheets.find(
    (aba) =>
      aba.properties.title === abaSaidas &&
      aba.properties.title !== ABA_ENTRADAS &&
      aba.properties.title !== "Sheet1",
  );
  const entradas = atualizado.sheets.find((aba) => aba.properties.title === ABA_ENTRADAS);
  if (
    padrao &&
    saidas &&
    entradas &&
    !saidas.properties.hidden &&
    !entradas.properties.hidden &&
    (!padrao.properties.sheetType || padrao.properties.sheetType === "GRID") &&
    !padrao.merges?.length &&
    !metadadosDaAba(atualizado, padrao).length &&
    (await abaVaziaGoogle(id, acesso, "Sheet1", padrao.properties.sheetId))
  ) {
    await enviarLotesGoogle(id, acesso, [{ deleteSheet: { sheetId: padrao.properties.sheetId } }]);
    sheet1 = "removida";
  }
  return { criada: !existente, organizada: true, sheet1 };
}
