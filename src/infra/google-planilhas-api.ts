// Cliente da Sheets API para a planilha escolhida: leitura de células,
// estrutura e marcadores sem depender de uma implantação Apps Script.
import { z } from "zod";
import { ErroHttp } from "@/infra/erros";
import { assinarAba, colunasDoIntervalo } from "@/domain/planilha";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const CAMPOS_ESTRUTURA =
  "spreadsheetId,spreadsheetUrl,properties(title,timeZone),developerMetadata(metadataId,metadataKey,metadataValue,location),sheets(properties(sheetId,title,hidden,sheetType,gridProperties),merges,developerMetadata(metadataId,metadataKey,metadataValue,location),data(rowMetadata(developerMetadata(metadataId,metadataKey,metadataValue,location)),columnMetadata(developerMetadata(metadataId,metadataKey,metadataValue,location))))";
const CAMPOS_CELULAS =
  "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue))))";

const faixa = z.object({
  sheetId: z.number().optional(),
  startRowIndex: z.number().optional(),
  endRowIndex: z.number().optional(),
  startColumnIndex: z.number().optional(),
  endColumnIndex: z.number().optional(),
});
const metadado = z.object({
  metadataId: z.number(),
  metadataKey: z.string(),
  metadataValue: z.string().optional(),
  location: z.object({ sheetId: z.number().optional(), dimensionRange: faixa.optional() }),
});
const propriedades = z.object({
  sheetId: z.number(),
  title: z.string(),
  hidden: z.boolean().optional(),
  sheetType: z.string().optional(),
  gridProperties: z
    .object({
      rowCount: z.number().optional(),
      columnCount: z.number().optional(),
      frozenRowCount: z.number().optional(),
      frozenColumnCount: z.number().optional(),
    })
    .optional(),
});
const documento = z.object({
  spreadsheetId: z.string(),
  spreadsheetUrl: z.string().optional(),
  properties: z.object({ title: z.string(), timeZone: z.string().optional() }),
  developerMetadata: z.array(metadado).optional(),
  sheets: z.array(
    z.object({
      properties: propriedades,
      merges: z.array(faixa).optional(),
      developerMetadata: z.array(metadado).optional(),
      data: z
        .array(
          z.object({
            rowMetadata: z
              .array(z.object({ developerMetadata: z.array(metadado).optional() }))
              .optional(),
            columnMetadata: z
              .array(z.object({ developerMetadata: z.array(metadado).optional() }))
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});

export type DocumentoGoogle = z.infer<typeof documento>;
export type AbaGoogle = DocumentoGoogle["sheets"][number];
export type MetadadoGoogle = z.infer<typeof metadado>;

function letra(coluna: number): string {
  let atual = coluna;
  let texto = "";
  while (atual > 0) {
    atual -= 1;
    texto = String.fromCharCode(65 + (atual % 26)) + texto;
    atual = Math.floor(atual / 26);
  }
  return texto;
}

function nomeNoA1(nome: string): string {
  return `'${nome.replaceAll("'", "''")}'`;
}

function intervaloA1(item: z.infer<typeof faixa>): string {
  const inicio = `${letra((item.startColumnIndex ?? 0) + 1)}${(item.startRowIndex ?? 0) + 1}`;
  const fim = `${letra(item.endColumnIndex ?? (item.startColumnIndex ?? 0) + 1)}${item.endRowIndex ?? (item.startRowIndex ?? 0) + 1}`;
  return inicio === fim ? inicio : `${inicio}:${fim}`;
}

export function metadadosDaAba(doc: DocumentoGoogle, aba: AbaGoogle): MetadadoGoogle[] {
  // A Sheets API devolve marcadores de linha e coluna em GridData, não em Sheet.
  const marcadoresDimensoes = (aba.data ?? []).flatMap((grade) =>
    [...(grade.rowMetadata ?? []), ...(grade.columnMetadata ?? [])].flatMap(
      (dimensao) => dimensao.developerMetadata ?? [],
    ),
  );
  return [
    ...new Map(
      [...(doc.developerMetadata ?? []), ...(aba.developerMetadata ?? []), ...marcadoresDimensoes]
        .filter((item) => {
          const id = item.location.dimensionRange?.sheetId ?? item.location.sheetId;
          return id === aba.properties.sheetId;
        })
        .map((item) => [item.metadataId, item] as const),
    ).values(),
  ];
}

export function marcadoresDaAba(
  doc: DocumentoGoogle,
  aba: AbaGoogle,
  chave: string,
  dimensao: "ROWS" | "COLUMNS",
): number[] {
  return [
    ...new Set(
      metadadosDaAba(doc, aba)
        .filter((item) => item.metadataKey === chave)
        .flatMap((item) => {
          const local = item.location.dimensionRange;
          return local?.startRowIndex !== undefined && dimensao === "ROWS"
            ? [local.startRowIndex + 1]
            : local?.startColumnIndex !== undefined && dimensao === "COLUMNS"
              ? [local.startColumnIndex + 1]
              : [];
        }),
    ),
  ].sort((a, b) => a - b);
}

export function mesclagensDaAba(aba: AbaGoogle): string[] {
  return (aba.merges ?? []).map(intervaloA1);
}

export function mesclagensDaAssinatura(aba: AbaGoogle): string[] {
  return mesclagensDaAba(aba).filter((intervalo) => colunasDoIntervalo(intervalo).length > 1);
}

async function requisitar(url: URL, acesso: string): Promise<unknown> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${acesso}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ErroHttp("Não foi possível falar com a planilha agora.", 502);
  }
  if (resposta.status === 401) throw new ErroHttp("Reconecte a conta Google.", 401);
  if (resposta.status === 403 || resposta.status === 404) {
    throw new ErroHttp("A conta Google não tem acesso à planilha escolhida.", 403);
  }
  if (!resposta.ok) throw new ErroHttp("O Google recusou a leitura da planilha.", 502);
  try {
    return (await resposta.json()) as unknown;
  } catch {
    throw new ErroHttp("A planilha respondeu em formato inesperado.", 502);
  }
}

export async function lerDocumentoGoogle(id: string, acesso: string): Promise<DocumentoGoogle> {
  const url = new URL(`${BASE}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", CAMPOS_ESTRUTURA);
  const lido = documento.safeParse(await requisitar(url, acesso));
  if (!lido.success) throw new ErroHttp("A estrutura da planilha não pôde ser lida.", 502);
  return lido.data;
}

export function exigirAbaGoogle(doc: DocumentoGoogle, nome: string): AbaGoogle {
  const aba = doc.sheets.find((item) => item.properties.title === nome);
  if (!aba) throw new ErroHttp(`A aba ${nome} não foi encontrada na planilha.`, 409);
  if (aba.properties.sheetType && aba.properties.sheetType !== "GRID") {
    throw new ErroHttp("Esta aba não permite o registro da frequência.", 400);
  }
  return aba;
}

const valores = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).optional(),
});

/** Obtém o tamanho utilizado, incluindo fórmulas cujo resultado é vazio. */
export async function tamanhoUtilizado(id: string, acesso: string, nome: string) {
  const url = new URL(
    `${BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(nomeNoA1(nome))}`,
  );
  url.searchParams.set("valueRenderOption", "FORMULA");
  const lido = valores.safeParse(await requisitar(url, acesso));
  if (!lido.success) throw new ErroHttp("Não foi possível ler as células da aba.", 502);
  const linhas = lido.data.values ?? [];
  return { linhas: linhas.length, colunas: Math.max(0, ...linhas.map((item) => item.length)) };
}

const celula = z.object({
  formattedValue: z.string().optional(),
  userEnteredValue: z.object({ formulaValue: z.string().optional() }).passthrough().optional(),
});
const grade = z.object({
  sheets: z.array(
    z.object({
      data: z
        .array(
          z.object({
            startRow: z.number().optional(),
            startColumn: z.number().optional(),
            rowData: z.array(z.object({ values: z.array(celula).optional() })).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

export interface BlocoGoogle {
  coluna: number;
  colunas: number;
  valores: string[][];
  formula: boolean[][];
}

/** Lê somente as faixas pedidas, com valores exibidos e fórmula separada. */
export async function lerBlocosGoogle(
  id: string,
  acesso: string,
  nome: string,
  linhas: number,
  pedidos: { coluna: number; colunas: number }[],
): Promise<BlocoGoogle[]> {
  if (linhas * pedidos.reduce((total, item) => total + item.colunas, 0) > 20_000) {
    throw new ErroHttp("Intervalo grande demais para uma leitura.", 400);
  }
  const url = new URL(`${BASE}/${encodeURIComponent(id)}`);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set("fields", CAMPOS_CELULAS);
  for (const pedido of pedidos) {
    const inicio = letra(pedido.coluna);
    const fim = letra(pedido.coluna + pedido.colunas - 1);
    url.searchParams.append("ranges", `${nomeNoA1(nome)}!${inicio}1:${fim}${linhas}`);
  }
  const lido = grade.safeParse(await requisitar(url, acesso));
  if (!lido.success) throw new ErroHttp("Não foi possível ler as células da aba.", 502);
  const dados = lido.data.sheets[0]?.data ?? [];
  return pedidos.map((pedido, indice) => {
    const trecho = dados[indice];
    const valores: string[][] = [];
    const formula: boolean[][] = [];
    for (let linha = 0; linha < linhas; linha += 1) {
      const itens = trecho?.rowData?.[linha]?.values ?? [];
      valores.push(
        Array.from({ length: pedido.colunas }, (_, coluna) => itens[coluna]?.formattedValue ?? ""),
      );
      formula.push(
        Array.from({ length: pedido.colunas }, (_, coluna) =>
          Boolean(itens[coluna]?.userEnteredValue?.formulaValue),
        ),
      );
    }
    return { coluna: pedido.coluna, colunas: pedido.colunas, valores, formula };
  });
}

export async function estruturaGoogle(id: string, acesso: string, nome?: string) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const abas = nome
    ? [exigirAbaGoogle(doc, nome)]
    : doc.sheets.filter(
        (item) =>
          (!item.properties.sheetType || item.properties.sheetType === "GRID") &&
          !item.properties.title.startsWith("_frequenciapp_backup_"),
      );
  return {
    planilha: {
      nome: doc.properties.title,
      id: doc.spreadsheetId,
      url: doc.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit`,
      fuso: doc.properties.timeZone ?? "UTC",
      versao: 1,
    },
    abas: await Promise.all(
      abas.map(async (aba) => {
        const usado = await tamanhoUtilizado(id, acesso, aba.properties.title);
        const amostra = await lerBlocosGoogle(
          id,
          acesso,
          aba.properties.title,
          Math.max(1, Math.min(usado.linhas, 12)),
          [{ coluna: 1, colunas: Math.max(1, Math.min(usado.colunas, 60)) }],
        );
        return {
          nome: aba.properties.title,
          oculta: aba.properties.hidden ?? false,
          criada: metadadosDaAba(doc, aba).some((item) => item.metadataKey === "frequenciapp.aba"),
          linhas: usado.linhas,
          colunas: usado.colunas,
          congeladasLinhas: aba.properties.gridProperties?.frozenRowCount ?? 0,
          congeladasColunas: aba.properties.gridProperties?.frozenColumnCount ?? 0,
          mesclagens: mesclagensDaAba(aba),
          amostra: amostra[0]?.valores ?? [],
        };
      }),
    ),
  };
}

export async function lerGoogle(
  id: string,
  acesso: string,
  nome: string,
  pedidos?: { coluna: number; colunas: number }[],
  cabecalhoLinha?: number,
) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const aba = exigirAbaGoogle(doc, nome);
  const usado = await tamanhoUtilizado(id, acesso, nome);
  const faixas = pedidos?.length ? pedidos : [{ coluna: 1, colunas: Math.max(usado.colunas, 1) }];
  const blocos = await lerBlocosGoogle(id, acesso, nome, Math.max(usado.linhas, 1), faixas);
  const primeiro = blocos[0];
  if (!primeiro) throw new ErroHttp("Não foi possível ler a aba.", 502);
  const marcadores = metadadosDaAba(doc, aba);
  let assinatura: string | undefined;
  if (cabecalhoLinha) {
    const cabecalho = await lerBlocosGoogle(id, acesso, nome, cabecalhoLinha, [
      { coluna: 1, colunas: Math.max(usado.colunas, 1) },
    ]);
    assinatura = assinarAba(
      nome,
      cabecalho[0]?.valores[cabecalhoLinha - 1] ?? [],
      mesclagensDaAssinatura(aba),
    );
  }
  return {
    aba: nome,
    linhaInicial: 1,
    colunaInicial: primeiro.coluna,
    linhas: Math.max(usado.linhas, 1),
    colunas: primeiro.colunas,
    valores: primeiro.valores,
    formula: primeiro.formula,
    blocos,
    ultimaLinha: usado.linhas,
    linhasCriadas: marcadoresDaAba(doc, aba, "frequenciapp.linha", "ROWS"),
    colunasCriadas: marcadoresDaAba(doc, aba, "frequenciapp.coluna", "COLUMNS"),
    alunosDasLinhas: marcadores
      .filter((item) => item.metadataKey === "frequenciapp.aluno")
      .flatMap((item) => {
        const linha = item.location.dimensionRange?.startRowIndex;
        return linha !== undefined && item.metadataValue
          ? [{ linha: linha + 1, alunoId: item.metadataValue }]
          : [];
      }),
    ...(assinatura ? { assinatura } : {}),
  };
}

/** Preserva o contrato interno de leitura enquanto a fonte passa à Sheets API. */
export async function executarAcaoGoogle(
  id: string,
  acesso: string,
  corpo: Record<string, unknown>,
): Promise<unknown> {
  if (corpo.acao === "estrutura") {
    const aba = typeof corpo.aba === "string" ? corpo.aba : undefined;
    return estruturaGoogle(id, acesso, aba);
  }
  if (corpo.acao === "ler") {
    if (typeof corpo.aba !== "string") throw new ErroHttp("Informe a aba.", 400);
    const blocos = z
      .array(
        z.object({ coluna: z.number().int().positive(), colunas: z.number().int().positive() }),
      )
      .safeParse(corpo.blocos);
    const pedidos = blocos.success ? blocos.data : undefined;
    const cabecalhoLinha = z.number().int().positive().safeParse(corpo.cabecalhoLinha);
    return lerGoogle(
      id,
      acesso,
      corpo.aba,
      pedidos,
      cabecalhoLinha.success ? cabecalhoLinha.data : undefined,
    );
  }
  if (corpo.acao === "aplicar") {
    const dados = z
      .object({
        aba: z.string().min(1),
        cabecalhoLinha: z.number().int().positive(),
        assinatura: z.string(),
        operacoes: z.unknown(),
        modoCompleto: z.boolean(),
      })
      .safeParse(corpo);
    if (!dados.success) throw new ErroHttp("Envio da planilha inválido.", 400);
    const { aplicarGoogle } = await import("@/infra/google-planilhas-escrita");
    return aplicarGoogle(
      id,
      acesso,
      dados.data.aba,
      dados.data.cabecalhoLinha,
      dados.data.assinatura,
      dados.data.operacoes,
      dados.data.modoCompleto,
    );
  }
  if (corpo.acao === "listarCopias") {
    if (typeof corpo.aba !== "string") throw new ErroHttp("Informe a aba.", 400);
    const { listarCopiasGoogle } = await import("@/infra/google-planilhas-copias");
    return listarCopiasGoogle(id, acesso, corpo.aba);
  }
  if (corpo.acao === "restaurarCopia") {
    if (typeof corpo.aba !== "string" || typeof corpo.copia !== "string") {
      throw new ErroHttp("Escolha uma cópia válida.", 400);
    }
    const { restaurarCopiaGoogle } = await import("@/infra/google-planilhas-copias");
    return restaurarCopiaGoogle(id, acesso, corpo.aba, corpo.copia);
  }
  if (corpo.acao === "criarAba") {
    if (typeof corpo.nome !== "string" || !corpo.nome.trim()) {
      throw new ErroHttp("Informe o nome da aba.", 400);
    }
    const cabecalho = z.array(z.string()).safeParse(corpo.cabecalho);
    const { criarAbaGoogle } = await import("@/infra/google-planilhas-abas");
    return criarAbaGoogle(id, acesso, corpo.nome, cabecalho.success ? cabecalho.data : undefined);
  }
  if (corpo.acao === "removerAba") {
    if (typeof corpo.aba !== "string") throw new ErroHttp("Informe a aba.", 400);
    const { removerAbaGoogle } = await import("@/infra/google-planilhas-abas");
    return removerAbaGoogle(id, acesso, corpo.aba);
  }
  throw new ErroHttp("Esta operação ainda não está disponível na conexão Google.", 501);
}
