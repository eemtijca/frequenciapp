// Criação e substituição atômica de fontes agregadas em arquivo exclusivo do aplicativo.
import { z } from "zod";
import type { FonteIndicadores } from "@/domain/indicadores";
import { ErroHttp } from "./erros";
import type { ControleTravaPlanilha } from "./trava-planilha";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const MARCADOR = "frequenciapp.indicadores";
export const ABAS_INDICADORES = ["Frequencia", "Movimentacoes", "Parciais", "Aulas_parciais"];
const documento = z.object({
  spreadsheetId: z.string().regex(/^[\w-]+$/),
  developerMetadata: z
    .array(
      z.object({
        metadataKey: z.string(),
        metadataValue: z.string().optional(),
        location: z.object({ spreadsheet: z.boolean().optional() }),
      }),
    )
    .optional(),
  sheets: z.array(
    z.object({ properties: z.object({ sheetId: z.number().int(), title: z.string() }) }),
  ),
});

async function pedirGoogle(
  caminho: string,
  acesso: string,
  controle: ControleTravaPlanilha,
  corpo?: unknown,
) {
  controle.conferir();
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: AbortSignal.any([controle.signal, AbortSignal.timeout(25_000)]),
    });
  } catch {
    throw new ErroHttp(
      "O Google não confirmou a operação. Confira a planilha e tente novamente.",
      502,
    );
  }
  controle.conferir();
  if (!resposta.ok) {
    throw new ErroHttp(
      resposta.status === 401 || resposta.status === 403
        ? "O Google recusou o acesso. Reconecte a conta da frequência e confira a permissão da planilha de indicadores."
        : "Não foi possível atualizar os indicadores no Google agora. Tente novamente.",
      resposta.status === 401 || resposta.status === 403 ? 409 : 502,
      caminho === "" && [400, 401, 403, 404].includes(resposta.status)
        ? "CRIACAO_RECUSADA"
        : undefined,
    );
  }
  const retorno: unknown = await resposta.json().catch(() => null);
  controle.conferir();
  return retorno;
}

export async function criarPlanilhaIndicadores(
  geracao: string,
  acesso: string,
  controle: ControleTravaPlanilha,
) {
  const retorno = await pedirGoogle("", acesso, controle, {
    properties: {
      title: "FrequenciApp - Indicadores",
      locale: "pt_BR",
      timeZone: "America/Fortaleza",
    },
    sheets: ABAS_INDICADORES.map((title, sheetId) => ({ properties: { sheetId, title } })),
    developerMetadata: [
      {
        metadataKey: MARCADOR,
        metadataValue: geracao,
        location: { spreadsheet: true },
        visibility: "DOCUMENT",
      },
    ],
  });
  const dados = documento.safeParse(retorno);
  if (!dados.success)
    throw new ErroHttp(
      "A criação não pôde ser confirmada. Recupere a planilha pelo endereço do Google.",
      502,
    );
  return dados.data.spreadsheetId;
}

/** Aceita somente o arquivo marcado nesta instalação e suas quatro abas conhecidas. */
export async function conferirPlanilhaIndicadores(
  id: string,
  geracao: string,
  acesso: string,
  controle: ControleTravaPlanilha,
) {
  const retorno = await pedirGoogle(
    `/${encodeURIComponent(id)}?fields=spreadsheetId,developerMetadata,sheets(properties(sheetId,title))`,
    acesso,
    controle,
  );
  const dados = documento.safeParse(retorno);
  if (
    !dados.success ||
    dados.data.spreadsheetId !== id ||
    !dados.data.developerMetadata?.some(
      (m) =>
        m.metadataKey === MARCADOR &&
        m.metadataValue === geracao &&
        m.location.spreadsheet === true,
    ) ||
    !ABAS_INDICADORES.every((nome, indice) =>
      dados.data.sheets.some((s) => s.properties.title === nome && s.properties.sheetId === indice),
    )
  ) {
    throw new ErroHttp(
      "Esta planilha não é a fonte de indicadores desta instalação. Confira o arquivo e as quatro abas originais.",
      409,
    );
  }
}

/** Datas são números nativos; textos nunca são interpretados como fórmulas. */
export function loteIndicadores(fontes: FonteIndicadores[]) {
  if (fontes.length !== 4 || fontes.some((f, i) => f.nome !== ABAS_INDICADORES[i])) {
    throw new ErroHttp("As fontes de indicadores estão incompletas.", 409);
  }
  const requests = fontes.flatMap((fonte, sheetId) => {
    const rowCount = Math.max(2, fonte.linhas.length + 1);
    const columnCount = fonte.cabecalho.length;
    const range = {
      sheetId,
      startRowIndex: 0,
      endRowIndex: rowCount,
      startColumnIndex: 0,
      endColumnIndex: columnCount,
    };
    const linhas = [fonte.cabecalho, ...fonte.linhas];
    return [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { rowCount, columnCount, frozenRowCount: 1 } },
          fields: "gridProperties",
        },
      },
      {
        updateCells: {
          range,
          fields: "userEnteredValue",
          rows: linhas.map((linha, r) => ({
            values: linha.map((valor, c) => ({
              userEnteredValue:
                r > 0 && c === 0
                  ? {
                      numberValue:
                        (Date.parse(`${valor}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000,
                    }
                  : typeof valor === "number"
                    ? { numberValue: valor }
                    : { stringValue: valor },
            })),
          })),
        },
      },
      {
        repeatCell: {
          range: { ...range, startRowIndex: 1, endColumnIndex: 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      },
      {
        repeatCell: {
          range: { ...range, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.52, green: 0.89, blue: 0.73 },
            },
          },
          fields: "userEnteredFormat",
        },
      },
    ];
  });
  const lote = { requests };
  if (Buffer.byteLength(JSON.stringify(lote), "utf8") > 2_000_000) {
    throw new ErroHttp(
      "Os indicadores excedem o limite de envio. Selecione um ano com menos registros.",
      413,
    );
  }
  return lote;
}

export async function substituirIndicadores(
  id: string,
  geracao: string,
  acesso: string,
  fontes: FonteIndicadores[],
  controle: ControleTravaPlanilha,
) {
  const lote = loteIndicadores(fontes);
  await conferirPlanilhaIndicadores(id, geracao, acesso, controle);
  await pedirGoogle(`/${encodeURIComponent(id)}:batchUpdate`, acesso, controle, lote);
}
