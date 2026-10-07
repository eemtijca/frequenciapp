// Prepara Entradas com as colunas e o padrão visual de Saídas, realinha o formato anterior e remove somente Sheet1 vazia.
import {
  ABA_ENTRADAS,
  CABECALHO_ENTRADAS,
  formatoCabecalhoEntradas,
} from "@/domain/planilha-entradas";
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { assinarAba } from "@/domain/planilha";
import { ErroHttp } from "./erros";
import { criarAbaGoogle } from "./google-planilhas-abas";
import { organizarAbaGoogle } from "./google-planilhas-apresentacao";
import { enviarLoteAtomicoGoogle, enviarLotesGoogle } from "./google-planilhas-escrita";
import {
  abaVaziaGoogle,
  lerDocumentoGoogle,
  lerBlocosGoogle,
  tamanhoUtilizado,
  metadadosDaAba,
} from "./google-planilhas-api";

/**
 * Troca o cabeçalho anterior pelo atual de uma vez só: os rótulos passam a ser
 * os do cabeçalho comum, o responsável vai da coluna F para a G, Observação
 * fica vazia e o Código é descartado. Fórmulas nessas colunas bloqueiam,
 * porque mudariam de lugar.
 */
async function realinharEntradasGoogle(
  id: string,
  acesso: string,
  sheetId: number,
  linhas: number,
): Promise<void> {
  const total = Math.max(linhas, 1);
  // Só as colunas F (responsável) e G (código) mudam de lugar.
  const [corpo] = await lerBlocosGoogle(id, acesso, ABA_ENTRADAS, total, [
    { coluna: 6, colunas: 2 },
  ]);
  if (!corpo || corpo.formula.some((linha) => linha.some(Boolean)))
    throw new ErroHttp("Há fórmulas na aba Entradas. Confira a planilha antes de preparar.", 409);
  const texto = (valor: string) =>
    valor === "" ? {} : { userEnteredValue: { stringValue: valor } };
  const dados = corpo.valores.slice(1);
  await enviarLoteAtomicoGoogle(id, acesso, [
    // O cabeçalho inteiro muda de rótulo (Horário e Motivo viram Momento e Justificativa).
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: CABECALHO_ENTRADAS.length,
        },
        rows: [
          {
            values: CABECALHO_ENTRADAS.map((titulo) => ({
              userEnteredValue: { stringValue: titulo },
            })),
          },
        ],
        fields: "userEnteredValue",
      },
    },
    ...(dados.length
      ? [
          {
            updateCells: {
              range: {
                sheetId,
                startRowIndex: 1,
                endRowIndex: 1 + dados.length,
                startColumnIndex: 5,
                endColumnIndex: 7,
              },
              rows: dados.map((linha) => ({ values: [texto(""), texto(linha[0] ?? "")] })),
              fields: "userEnteredValue",
            },
          },
        ]
      : []),
  ]);
}

export async function prepararEntradasGoogle(id: string, acesso: string, abaSaidas?: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const existente = doc.sheets.find((aba) => aba.properties.title === ABA_ENTRADAS);
  let realinhada = false;
  if (!existente) {
    await criarAbaGoogle(id, acesso, ABA_ENTRADAS, CABECALHO_ENTRADAS);
  } else {
    const usado = await tamanhoUtilizado(id, acesso, ABA_ENTRADAS);
    if (usado.colunas > 400) throw new ErroHttp("Confira as colunas da aba Entradas.", 409);
    const [bloco] = await lerBlocosGoogle(id, acesso, ABA_ENTRADAS, 1, [
      { coluna: 1, colunas: Math.max(usado.colunas, CABECALHO_ENTRADAS.length) },
    ]);
    const cabecalho = bloco?.valores[0] ?? [];
    const formato = formatoCabecalhoEntradas(cabecalho);
    if (formato === "outro" || bloco?.formula[0]?.some(Boolean))
      throw new ErroHttp("Confira o cabeçalho padrão da aba Entradas antes de preparar.", 409);
    if (formato === "anterior") {
      await realinharEntradasGoogle(id, acesso, existente.properties.sheetId, usado.linhas);
      realinhada = true;
    }
    await organizarAbaGoogle(id, acesso, {
      aba: ABA_ENTRADAS,
      cabecalhoLinha: 1,
      assinatura: assinarAba(
        ABA_ENTRADAS,
        realinhada
          ? cabecalho.map((valor, indice) => CABECALHO_ENTRADAS[indice] ?? valor)
          : cabecalho,
        [],
      ),
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
  return { criada: !existente, organizada: true, realinhada, sheet1 };
}
