// Sheets API e renovação OAuth sintéticas para contratos e navegador.
// O aplicativo usa seus clientes reais contra uma planilha em memória.
import { createServer } from "node:http";
import type pg from "pg";
import { cifrarToken } from "../../src/infra/google-oauth";

type Objeto = Record<string, unknown>;
interface Celula {
  valor: string;
  formula: string;
}
interface Aba {
  id: number;
  nome: string;
  oculta: boolean;
  celulas: Celula[][];
  metadados: Objeto[];
  mesclagens: Objeto[];
  faixas: Objeto[];
  propriedades: Objeto;
}
const objeto = (valor: unknown): Objeto =>
  valor && typeof valor === "object" ? (valor as Objeto) : {};
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
const numero = (valor: unknown, padrao = 0): number => (typeof valor === "number" ? valor : padrao);
const texto = (valor: unknown): string => (typeof valor === "string" ? valor : "");
function coluna(letra: string) {
  return [...letra].reduce((total, item) => total * 26 + item.charCodeAt(0) - 64, 0);
}

export interface GoogleFalso {
  conectar(banco: pg.Client, finalidade?: "FREQUENCIA" | "SAIDAS" | "PARCIAL"): Promise<void>;
  codigoAutorizacao(): string;
  definirFuso(valor: string): void;
  recusarAutorizacao(valor: boolean): void;
  recusarLeituras(valor: boolean): void;
  /** Responde as leituras (GET) com este status temporário; null volta ao normal. */
  falharLeituras(status: number | null): void;
  recusarGravacoes(valor: boolean): void;
  perderProximaResposta(valor?: boolean): void;
  definirAba(
    nome: string,
    valores: string[][],
    opcoes?: {
      formulas?: Record<string, string>;
      mesclagens?: string[];
      mensal?: {
        turmaOriginalId: string;
        mes: string;
        geracao: string;
        vinculos: { linha: number; alunoId: string }[];
      };
    },
  ): void;
  renomearAba(nome: string, novo: string): void;
  removerAba(nome: string): void;
  valor(nome: string, linha: number, coluna: number): string;
  definirValor(nome: string, linha: number, coluna: number, valor: string): void;
  formulaDe(nome: string, linha: number, coluna: number): string;
  apresentacao(nome: string): { congeladasLinhas: number; faixas: Objeto[] };
  vinculos(nome: string): { linha: number; alunoId: string }[];
  marcarLinha(nome: string, linha: number): void;
  marcarColuna(nome: string, coluna: number): void;
  criarCopiaAntiga(nome: string): string;
  abas(): string[];
  abasVisiveis(): string[];
  chamadas(): string[];
  fechar(): Promise<void>;
}

export async function criarGoogleFalso(): Promise<GoogleFalso> {
  const abas: Aba[] = [];
  const chamadas: string[] = [];
  let proximoId = 1;
  let proximoMetadado = 1;
  let fuso = "America/Fortaleza";
  let recusarAutorizacao = false;
  let recusarLeituras = false;
  let falhaDeLeitura: number | null = null;
  let recusarGravacoes = false;
  let perderResposta = false;
  let credencial = "";
  const aba = (nome: string) => abas.find((item) => item.nome === nome);
  const peloId = (id: unknown) => {
    const item = abas.find((item) => item.id === id);
    if (!item) throw new Error("Aba sintética ausente.");
    return item;
  };
  function garantir(item: Aba, linha: number, indice: number): Celula {
    while (item.celulas.length < linha) item.celulas.push([]);
    const fileira = item.celulas[linha - 1];
    if (!fileira) throw new Error("Linha sintética ausente.");
    while (fileira.length < indice) fileira.push({ valor: "", formula: "" });
    const celula = fileira[indice - 1];
    if (!celula) throw new Error("Célula sintética ausente.");
    return celula;
  }
  function nova(nome: string, id = proximoId++): Aba {
    if (abas.some((item) => item.nome === nome || item.id === id)) {
      throw new Error("Nome ou identificador de aba sintética já existente.");
    }
    const item: Aba = {
      id,
      nome,
      oculta: false,
      celulas: [],
      metadados: [],
      mesclagens: [],
      faixas: [],
      propriedades: { rowCount: 100, columnCount: 26, frozenRowCount: 0, frozenColumnCount: 0 },
    };
    abas.push(item);
    return item;
  }
  function marcar(item: Aba, chave: string, location: Objeto, valor = "1") {
    item.metadados.push({
      metadataId: proximoMetadado++,
      metadataKey: chave,
      metadataValue: valor,
      visibility: "DOCUMENT",
      location,
    });
  }
  function dimensoes(item: Aba) {
    let linhas = 0;
    let colunas = 0;
    item.celulas.forEach((fileira, l) =>
      fileira.forEach((celula, c) => {
        if (celula.valor || celula.formula) {
          linhas = Math.max(linhas, l + 1);
          colunas = Math.max(colunas, c + 1);
        }
      }),
    );
    return { linhas, colunas };
  }
  function intervalo(valor: string) {
    if (!valor.includes("!")) {
      const nome = valor.replace(/^'|'$/g, "").replaceAll("''", "'");
      const item = aba(nome);
      if (!item) throw new Error("Aba sintética ausente.");
      return {
        item,
        linha: 0,
        coluna: 0,
        ateLinha: numero(item.propriedades.rowCount),
        ateColuna: numero(item.propriedades.columnCount),
      };
    }
    const match = /^(?:'((?:''|[^'])+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(valor);
    if (!match) throw new Error(`Intervalo sintético inválido: ${valor}`);
    const item = aba((match[1] ?? match[2] ?? "").replaceAll("''", "'"));
    if (!item) throw new Error("Aba sintética ausente.");
    return {
      item,
      linha: Number(match[4]) - 1,
      coluna: coluna(match[3] ?? "A") - 1,
      ateLinha: Number(match[6]),
      ateColuna: coluna(match[5] ?? "A"),
    };
  }
  function valores(faixa: ReturnType<typeof intervalo>) {
    const dimensao = dimensoes(faixa.item);
    return faixa.item.celulas
      .slice(faixa.linha, Math.min(faixa.ateLinha, dimensao.linhas))
      .map((fileira) =>
        Array.from(
          { length: Math.max(0, Math.min(faixa.ateColuna, dimensao.colunas) - faixa.coluna) },
          (_, c) => fileira[faixa.coluna + c]?.valor ?? "",
        ),
      );
  }
  function documento(url: URL) {
    const grade = url.searchParams.get("includeGridData") === "true";
    const idArquivo = url.pathname.split("/")[3] ?? "planilha-sintetica";
    return {
      spreadsheetId: idArquivo,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${idArquivo}/edit`,
      properties: { title: "Planilha de teste", timeZone: fuso },
      sheets: abas
        .filter(
          (item) =>
            !url.searchParams.has("ranges") ||
            url.searchParams.getAll("ranges").some((range) => intervalo(range).item === item),
        )
        .map((item) => ({
          properties: {
            sheetId: item.id,
            title: item.nome,
            hidden: item.oculta,
            sheetType: "GRID",
            gridProperties: item.propriedades,
          },
          developerMetadata: item.metadados,
          merges: item.mesclagens,
          bandedRanges: item.faixas,
          ...(grade
            ? {
                data: url.searchParams
                  .getAll("ranges")
                  .map(intervalo)
                  .filter((faixa) => faixa.item === item)
                  .map((faixa) => ({
                    startRow: faixa.linha,
                    startColumn: faixa.coluna,
                    rowData: valores(faixa).map((fileira, l) => ({
                      values: fileira.map((formattedValue, c) => {
                        const celula = item.celulas[faixa.linha + l]?.[faixa.coluna + c];
                        return {
                          formattedValue,
                          userEnteredValue: celula?.formula
                            ? { formulaValue: celula.formula }
                            : { stringValue: formattedValue },
                        };
                      }),
                    })),
                  })),
              }
            : {}),
        })),
    };
  }
  function deslocarMetadados(
    item: Aba,
    dimensao: string,
    inicio: number,
    quantidade: number,
    apagar: boolean,
  ) {
    item.metadados = item.metadados.filter((meta) => {
      const range = objeto(objeto(meta.location).dimensionRange);
      if (range.dimension !== dimensao) return true;
      const indice = numero(range.startIndex);
      if (apagar && indice >= inicio && indice < inicio + quantidade) return false;
      if (indice >= inicio) {
        range.startIndex = indice + (apagar ? -quantidade : quantidade);
        range.endIndex = numero(range.startIndex) + 1;
      }
      return true;
    });
  }
  function escrever(pedido: Objeto) {
    if (pedido.updateCells) {
      const dados = objeto(pedido.updateCells);
      const faixa = objeto(dados.range ?? dados.start);
      const item = peloId(faixa.sheetId);
      lista(dados.rows).forEach((fileira, l) =>
        lista(objeto(fileira).values).forEach((valor, c) => {
          const celula = garantir(
            item,
            numero(faixa.startRowIndex ?? faixa.rowIndex) + l + 1,
            numero(faixa.startColumnIndex ?? faixa.columnIndex) + c + 1,
          );
          const entrada = objeto(objeto(valor).userEnteredValue);
          celula.formula = texto(entrada.formulaValue);
          celula.valor =
            texto(entrada.stringValue) ||
            (entrada.numberValue !== undefined ? String(entrada.numberValue) : "");
        }),
      );
    } else if (pedido.createDeveloperMetadata) {
      const meta = objeto(objeto(pedido.createDeveloperMetadata).developerMetadata);
      const location = objeto(meta.location);
      const item = peloId(location.sheetId ?? objeto(location.dimensionRange).sheetId);
      item.metadados.push({ ...meta, metadataId: proximoMetadado++ });
    } else if (pedido.deleteDeveloperMetadata) {
      const consulta = objeto(
        objeto(objeto(pedido.deleteDeveloperMetadata).dataFilter).developerMetadataLookup,
      );
      for (const item of abas)
        item.metadados = item.metadados.filter((meta) =>
          consulta.metadataId !== undefined
            ? meta.metadataId !== consulta.metadataId
            : meta.metadataKey !== consulta.metadataKey,
        );
    } else if (pedido.insertDimension || pedido.deleteDimension) {
      const apagar = Boolean(pedido.deleteDimension);
      const faixa = objeto(objeto(pedido.deleteDimension ?? pedido.insertDimension).range);
      const item = peloId(faixa.sheetId);
      const inicio = numero(faixa.startIndex);
      const quantidade = numero(faixa.endIndex) - inicio;
      deslocarMetadados(item, texto(faixa.dimension), inicio, quantidade, apagar);
      const propriedade = faixa.dimension === "ROWS" ? "rowCount" : "columnCount";
      item.propriedades[propriedade] =
        numero(item.propriedades[propriedade]) + (apagar ? -quantidade : quantidade);
      if (faixa.dimension === "ROWS") {
        item.celulas.splice(
          inicio,
          apagar ? quantidade : 0,
          ...(!apagar ? Array.from({ length: quantidade }, () => [] as Celula[]) : []),
        );
      } else {
        for (const fileira of item.celulas)
          fileira.splice(
            inicio,
            apagar ? quantidade : 0,
            ...(!apagar
              ? Array.from({ length: quantidade }, () => ({ valor: "", formula: "" }))
              : []),
          );
      }
    } else if (pedido.moveDimension) {
      const dados = objeto(pedido.moveDimension);
      const origem = objeto(dados.source);
      const item = peloId(origem.sheetId);
      if (origem.dimension !== "ROWS") throw new Error("Movimento sintético exige linhas.");
      const inicio = numero(origem.startIndex);
      const quantidade = numero(origem.endIndex) - inicio;
      const destinoOriginal = numero(dados.destinationIndex);
      const destino = destinoOriginal > inicio ? destinoOriginal - quantidade : destinoOriginal;
      const linhas = item.celulas.splice(inicio, quantidade);
      item.celulas.splice(destino, 0, ...linhas);
      for (const meta of item.metadados) {
        const faixa = objeto(objeto(meta.location).dimensionRange);
        if (faixa.dimension !== "ROWS") continue;
        const indice = numero(faixa.startIndex);
        if (indice >= inicio && indice < inicio + quantidade) {
          faixa.startIndex = destino + indice - inicio;
        } else {
          const depoisDeRemover = indice >= inicio + quantidade ? indice - quantidade : indice;
          faixa.startIndex =
            depoisDeRemover >= destino ? depoisDeRemover + quantidade : depoisDeRemover;
        }
        faixa.endIndex = numero(faixa.startIndex) + 1;
      }
    } else if (pedido.appendDimension) {
      const dados = objeto(pedido.appendDimension);
      const item = peloId(dados.sheetId);
      const chave = dados.dimension === "ROWS" ? "rowCount" : "columnCount";
      item.propriedades[chave] = numero(item.propriedades[chave]) + numero(dados.length);
    } else if (pedido.addSheet) {
      const propriedades = objeto(objeto(pedido.addSheet).properties);
      const item = nova(texto(propriedades.title), numero(propriedades.sheetId, proximoId++));
      item.oculta = Boolean(propriedades.hidden);
      Object.assign(item.propriedades, objeto(propriedades.gridProperties));
    } else if (pedido.deleteSheet) {
      const item = peloId(objeto(pedido.deleteSheet).sheetId);
      abas.splice(abas.indexOf(item), 1);
    } else if (pedido.updateSheetProperties) {
      const propriedades = objeto(objeto(pedido.updateSheetProperties).properties);
      const item = peloId(propriedades.sheetId);
      if (propriedades.title !== undefined) item.nome = texto(propriedades.title);
      if (propriedades.hidden === true && !abas.some((outra) => outra !== item && !outra.oculta))
        throw new Error("A planilha sintética precisa manter uma aba visível.");
      if (propriedades.hidden !== undefined) item.oculta = Boolean(propriedades.hidden);
      Object.assign(item.propriedades, objeto(propriedades.gridProperties));
    } else if (pedido.copyPaste) {
      const dados = objeto(pedido.copyPaste);
      const origem = objeto(dados.source);
      const destino = objeto(dados.destination);
      const de = peloId(origem.sheetId);
      const para = peloId(destino.sheetId);
      const copia = de.celulas
        .slice(numero(origem.startRowIndex), numero(origem.endRowIndex, de.celulas.length))
        .map((fileira) =>
          fileira
            .slice(numero(origem.startColumnIndex), numero(origem.endColumnIndex, fileira.length))
            .map((celula) => ({ ...celula })),
        );
      copia.forEach((fileira, l) =>
        fileira.forEach((celula, c) =>
          Object.assign(
            garantir(
              para,
              numero(destino.startRowIndex) + l + 1,
              numero(destino.startColumnIndex) + c + 1,
            ),
            celula,
          ),
        ),
      );
    } else if (pedido.unmergeCells) {
      peloId(objeto(objeto(pedido.unmergeCells).range).sheetId).mesclagens = [];
    } else if (pedido.addBanding || pedido.updateBanding) {
      const banded = objeto(objeto(pedido.addBanding ?? pedido.updateBanding).bandedRange);
      const item = peloId(objeto(banded.range).sheetId);
      const id = numero(banded.bandedRangeId, proximoId++);
      item.faixas = [
        ...item.faixas.filter((faixa) => faixa.bandedRangeId !== id),
        { ...banded, bandedRangeId: id },
      ];
    } else if (pedido.deleteBanding) {
      const id = objeto(pedido.deleteBanding).bandedRangeId;
      for (const item of abas)
        item.faixas = item.faixas.filter((faixa) => faixa.bandedRangeId !== id);
    } else if (
      ![
        "repeatCell",
        "setDataValidation",
        "autoResizeDimensions",
        "updateDimensionProperties",
        "updateBorders",
      ].some((tipo) => pedido[tipo])
    ) {
      throw new Error(`Pedido sintético sem suporte: ${Object.keys(pedido).join(",")}`);
    }
  }
  const servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (pedaco: Buffer) => {
      corpo += pedaco.toString();
    });
    req.on("end", () => {
      const responder = (dados: unknown, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(dados));
      };
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/token") {
          const autorizacao = new URLSearchParams(corpo).get("grant_type") === "authorization_code";
          responder(
            recusarAutorizacao
              ? { error: "invalid_grant" }
              : {
                  access_token: credencial,
                  ...(autorizacao ? { refresh_token: credencial } : {}),
                },
            recusarAutorizacao ? 400 : 200,
          );
          return;
        }
        if (req.headers.authorization !== `Bearer ${credencial}`) {
          responder({ error: { message: "Credencial sintética inválida." } }, 401);
          return;
        }
        if (recusarLeituras && req.method === "GET") {
          responder({ error: { message: "Acesso sintético ao arquivo recusado." } }, 403);
          return;
        }
        if (falhaDeLeitura !== null && req.method === "GET") {
          responder(
            { error: { message: "Falha sintética temporária do Google." } },
            falhaDeLeitura,
          );
          return;
        }
        if (url.pathname.endsWith(":batchUpdate")) {
          chamadas.push("gravar");
          if (recusarGravacoes) {
            responder({ error: { message: "Gravação sintética recusada." } }, 400);
            return;
          }
          const requests = lista(objeto(JSON.parse(corpo)).requests);
          const anteriores = structuredClone(abas);
          const idAnterior = proximoId;
          const metadadoAnterior = proximoMetadado;
          try {
            for (const request of requests) escrever(objeto(request));
          } catch (erro) {
            // A Sheets API rejeita o lote inteiro quando um pedido é inválido.
            abas.splice(0, abas.length, ...anteriores);
            proximoId = idAnterior;
            proximoMetadado = metadadoAnterior;
            throw erro;
          }
          if (perderResposta) {
            perderResposta = false;
            req.socket.destroy();
            return;
          }
          responder({ replies: requests.map(() => ({})) });
          return;
        }
        if (url.pathname.endsWith("/developerMetadata:search")) {
          const chaves = lista(objeto(JSON.parse(corpo)).dataFilters).map(
            (filtro) => objeto(objeto(filtro).developerMetadataLookup).metadataKey,
          );
          responder({
            matchedDeveloperMetadata: abas.flatMap((item) =>
              item.metadados
                .filter((meta) => chaves.includes(meta.metadataKey))
                .map((developerMetadata) => ({ developerMetadata })),
            ),
          });
          return;
        }
        if (url.pathname.includes("/values/")) {
          chamadas.push("ler");
          responder({
            values: valores(intervalo(decodeURIComponent(url.pathname.split("/values/")[1] ?? ""))),
          });
          return;
        }
        chamadas.push(url.searchParams.get("includeGridData") === "true" ? "ler" : "estrutura");
        responder(documento(url));
      } catch (erro) {
        responder(
          {
            error: { message: erro instanceof Error ? erro.message : "Pedido sintético inválido." },
          },
          400,
        );
      }
    });
  });
  await new Promise<void>((resolver) => servidor.listen(0, "127.0.0.1", resolver));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor sintético sem porta.");
  credencial = `frequenciapp-teste:${Buffer.from(`http://127.0.0.1:${endereco.port}`).toString("base64url")}`;
  return {
    codigoAutorizacao: () => credencial,
    conectar: async (banco, finalidade = "FREQUENCIA") => {
      const id =
        finalidade === "PARCIAL" ? "parcial" : finalidade === "SAIDAS" ? "saidas" : "principal";
      await banco.query(
        `insert into integracoes_planilha (id, finalidade, ativa, google_refresh_token, google_planilha_id, google_planilha_nome, atualizado_em) values ($1, $2::finalidade_integracao, true, $3, $4, 'Planilha de teste', now()) on conflict (id) do update set ativa = true, google_refresh_token = excluded.google_refresh_token, google_planilha_id = excluded.google_planilha_id, google_planilha_nome = excluded.google_planilha_nome, atualizado_em = now()`,
        [
          id,
          finalidade,
          cifrarToken(credencial),
          finalidade === "PARCIAL" ? "planilha-parcial-sintetica" : "planilha-sintetica",
        ],
      );
    },
    definirFuso: (valor) => {
      fuso = valor;
    },
    recusarAutorizacao: (valor) => {
      recusarAutorizacao = valor;
    },
    recusarLeituras: (valor) => {
      recusarLeituras = valor;
    },
    falharLeituras: (status) => {
      falhaDeLeitura = status;
    },
    recusarGravacoes: (valor) => {
      recusarGravacoes = valor;
    },
    perderProximaResposta: (valor = true) => {
      perderResposta = valor;
    },
    definirAba: (nome, valores, opcoes) => {
      const existente = aba(nome);
      if (existente) abas.splice(abas.indexOf(existente), 1);
      const item = nova(nome, existente?.id);
      valores.forEach((fileira, l) =>
        fileira.forEach((valor, c) => {
          garantir(item, l + 1, c + 1).valor = valor;
        }),
      );
      item.propriedades.columnCount = Math.max(
        numero(item.propriedades.columnCount),
        ...valores.map((fileira) => fileira.length),
      );
      if (opcoes?.mensal) {
        const mensal = opcoes.mensal;
        marcar(item, "frequenciapp.aba", { sheetId: item.id });
        marcar(item, "frequenciapp.turma", { sheetId: item.id }, mensal.turmaOriginalId);
        marcar(item, "frequenciapp.mes", { sheetId: item.id }, mensal.mes);
        marcar(item, "frequenciapp.geracao", { sheetId: item.id }, mensal.geracao);
        for (const vinculo of mensal.vinculos) {
          const local = {
            dimensionRange: {
              sheetId: item.id,
              dimension: "ROWS",
              startIndex: vinculo.linha - 1,
              endIndex: vinculo.linha,
            },
          };
          marcar(item, "frequenciapp.linha", local);
          marcar(item, "frequenciapp.aluno", local, vinculo.alunoId);
        }
        for (let indice = 0; indice < (valores[0]?.length ?? 0); indice++)
          marcar(item, "frequenciapp.coluna", {
            dimensionRange: {
              sheetId: item.id,
              dimension: "COLUMNS",
              startIndex: indice,
              endIndex: indice + 1,
            },
          });
      }
      for (const [a1, formula] of Object.entries(opcoes?.formulas ?? {})) {
        const match = /^([A-Z]+)(\d+)$/.exec(a1);
        if (match) garantir(item, Number(match[2]), coluna(match[1] ?? "A")).formula = formula;
      }
      item.mesclagens = (opcoes?.mesclagens ?? []).map((a1) => {
        const faixa = intervalo(`'${nome}'!${a1}`);
        return {
          sheetId: item.id,
          startRowIndex: faixa.linha,
          startColumnIndex: faixa.coluna,
          endRowIndex: faixa.ateLinha,
          endColumnIndex: faixa.ateColuna,
        };
      });
    },
    renomearAba: (nome, novo) => {
      const item = aba(nome);
      if (item) item.nome = novo;
    },
    removerAba: (nome) => {
      const item = aba(nome);
      if (item) abas.splice(abas.indexOf(item), 1);
    },
    valor: (nome, linha, indice) => aba(nome)?.celulas[linha - 1]?.[indice - 1]?.valor ?? "",
    definirValor: (nome, linha, indice, valor) => {
      const item = aba(nome);
      if (item) garantir(item, linha, indice).valor = valor;
    },
    formulaDe: (nome, linha, indice) => aba(nome)?.celulas[linha - 1]?.[indice - 1]?.formula ?? "",
    apresentacao: (nome) => ({
      congeladasLinhas: numero(aba(nome)?.propriedades.frozenRowCount),
      faixas: structuredClone(aba(nome)?.faixas ?? []),
    }),
    vinculos: (nome) =>
      (aba(nome)?.metadados ?? [])
        .filter((meta) => meta.metadataKey === "frequenciapp.aluno")
        .map((meta) => ({
          linha: numero(objeto(objeto(meta.location).dimensionRange).startIndex) + 1,
          alunoId: texto(meta.metadataValue),
        }))
        .sort((a, b) => a.linha - b.linha),
    marcarLinha: (nome, linha) => {
      const item = aba(nome);
      if (item)
        marcar(item, "frequenciapp.linha", {
          dimensionRange: {
            sheetId: item.id,
            dimension: "ROWS",
            startIndex: linha - 1,
            endIndex: linha,
          },
        });
    },
    marcarColuna: (nome, indice) => {
      const item = aba(nome);
      if (item)
        marcar(item, "frequenciapp.coluna", {
          dimensionRange: {
            sheetId: item.id,
            dimension: "COLUMNS",
            startIndex: indice - 1,
            endIndex: indice,
          },
        });
    },
    criarCopiaAntiga: (nome) => {
      const item = aba(nome);
      if (!item) throw new Error("Aba sintética ausente.");
      const copia = nova(
        `_frequenciapp_backup_${nome}_20261002-120000-${String(proximoId).padStart(3, "0")}`,
      );
      copia.oculta = true;
      copia.celulas = item.celulas.map((fileira) => fileira.map((celula) => ({ ...celula })));
      marcar(copia, "frequenciapp.copia", { sheetId: copia.id });
      return copia.nome;
    },
    abas: () => abas.map((item) => item.nome),
    abasVisiveis: () => abas.filter((item) => !item.oculta).map((item) => item.nome),
    chamadas: () => chamadas.slice(),
    fechar: () => new Promise<void>((resolver) => servidor.close(() => resolver())),
  };
}
