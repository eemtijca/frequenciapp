// Apps Script: roteamento, token, escrita conservadora, marcadores, cópias e
// restauração. O Codigo.gs roda em vm com dublês fiéis às recusas do Google.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { colunasDeApresentacao } from "@/domain/planilha-apresentacao";
import { VERSAO_SCRIPT } from "@/domain/planilha";

type TipoLocal = "SPREADSHEET" | "SHEET" | "ROW" | "COLUMN";

interface Celula {
  valor: string | Date;
  formula: string;
}

interface Metadado {
  chave: string;
  valor: string;
  tipo: TipoLocal;
  indice?: number;
}

interface Intervalo {
  linhaInicial: number;
  linhaFinal: number;
  colunaInicial: number;
  colunaFinal: number;
}

/** Mensagem literal do Google para metadado fora de linha ou coluna inteira. */
const ERRO_METADADO_ARBITRARIO =
  "Adding developer metadata to arbitrary ranges is not currently supported. Developer metadata may only be added to the top-level spreadsheet, an individual sheet, or an entire row or column.";

function colunaDeLetras(letras: string): number {
  let valor = 0;
  for (const letra of letras) {
    valor = valor * 26 + (letra.toUpperCase().charCodeAt(0) - 64);
  }
  return valor;
}

function letrasDaColuna(coluna: number): string {
  let resto = coluna;
  let letras = "";
  while (resto > 0) {
    const indice = (resto - 1) % 26;
    letras = String.fromCharCode(65 + indice) + letras;
    resto = Math.floor((resto - 1) / 26);
  }
  return letras;
}

function intervaloA1(texto: string): Intervalo | null {
  const partes = texto.split(":");
  const inicio = /^([A-Za-z]+)(\d+)$/.exec(partes[0] ?? "");
  if (!inicio) return null;
  const fim = partes[1] ? /^([A-Za-z]+)(\d+)$/.exec(partes[1]) : null;
  const colunaInicial = colunaDeLetras(inicio[1] ?? "");
  const linhaInicial = Number(inicio[2]);
  const colunaFinal = fim ? colunaDeLetras(fim[1] ?? "") : colunaInicial;
  const linhaFinal = fim ? Number(fim[2]) : linhaInicial;
  if (!colunaInicial || !linhaInicial) return null;
  return { linhaInicial, linhaFinal, colunaInicial, colunaFinal };
}

/** Exibição como o Sheets mostra por padrão em pt-BR: data em dd/MM/yyyy. */
function exibir(valor: string | Date): string {
  if (valor instanceof Date) {
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}/${valor.getUTCFullYear()}`;
  }
  return valor;
}

function copiarCelula(celula: Celula): Celula {
  return {
    valor: celula.valor instanceof Date ? new Date(celula.valor.getTime()) : celula.valor,
    formula: celula.formula,
  };
}

function vazia(): Celula {
  return { valor: "", formula: "" };
}

class AbaFalsa {
  nome: string;
  estilos: { intervalo: string; metodo: string; valor: unknown }[] = [];
  larguras = new Map<number, number>();
  alturas = new Map<number, number>();
  bandas: BandaFalsa[] = [];
  getBandings() {
    return this.bandas;
  }
  setColumnWidth(coluna: number, largura: number) {
    this.larguras.set(coluna, largura);
    return this;
  }
  setRowHeight(linha: number, altura: number) {
    this.alturas.set(linha, altura);
    return this;
  }
  oculta = false;
  congeladasLinhas = 0;
  congeladasColunas = 0;
  mesclagens: string[] = [];
  celulas: Celula[][] = [];
  metadados: Metadado[] = [];
  maxLinhas = 500;
  maxColunas = 60;
  /** Células gravadas, em A1, para provar o que nunca foi regravado. */
  gravacoes: string[] = [];
  /** Método que lança erro de serviço na próxima chamada, para testes. */
  falharEm: string | null = null;
  /** Como a API real: aba apagada não aceita mais chamada. */
  excluida = false;
  dono: PlanilhaFalsa;

  constructor(nome: string, dono: PlanilhaFalsa) {
    this.nome = nome;
    this.dono = dono;
  }

  private viva() {
    if (this.excluida) throw new Error("Exception: The sheet has been deleted.");
  }

  private conferirFalha(metodo: string) {
    if (this.falharEm === metodo) {
      this.falharEm = null;
      throw new Error(
        "Exception: Service Spreadsheets failed while accessing document with token segredo.",
      );
    }
  }

  private garantir(linha: number, coluna: number) {
    while (this.celulas.length < linha) {
      this.celulas.push(Array.from({ length: this.maxColunas }, vazia));
    }
    const fileira = this.celulas[linha - 1];
    if (fileira && fileira.length < coluna) {
      while (fileira.length < coluna) fileira.push(vazia());
    }
  }

  getCelula(linha: number, coluna: number): Celula {
    this.garantir(linha, coluna);
    return this.celulas[linha - 1]?.[coluna - 1] ?? vazia();
  }

  getName() {
    return this.nome;
  }
  setName(nome: string) {
    if (this.dono.getSheetByName(nome) && this.dono.getSheetByName(nome) !== this) {
      throw new Error("Já existe aba com esse nome.");
    }
    this.nome = nome;
    return this;
  }
  getSheetId() {
    return this.dono.abas.indexOf(this);
  }
  isSheetHidden() {
    return this.oculta;
  }
  hideSheet() {
    this.oculta = true;
    return this;
  }
  showSheet() {
    this.oculta = false;
    return this;
  }
  getFrozenRows() {
    return this.congeladasLinhas;
  }
  getFrozenColumns() {
    return this.congeladasColunas;
  }
  setFrozenRows(valor: number) {
    this.congeladasLinhas = valor;
    return this;
  }
  setFrozenColumns(valor: number) {
    this.congeladasColunas = valor;
    return this;
  }
  /** Como a API real: linha vazia no fim não conta. */
  getLastRow() {
    let ultima = 0;
    for (let linha = 0; linha < this.celulas.length; linha += 1) {
      const fileira = this.celulas[linha] ?? [];
      if (fileira.some((celula) => celula.valor !== "" || celula.formula !== ""))
        ultima = linha + 1;
    }
    return ultima;
  }
  /** Como a API real: coluna vazia, mesmo recém-inserida, não conta. */
  getLastColumn() {
    let ultima = 0;
    for (const fileira of this.celulas) {
      for (let coluna = 0; coluna < fileira.length; coluna += 1) {
        const celula = fileira[coluna];
        if (celula && (celula.valor !== "" || celula.formula !== "")) {
          if (coluna + 1 > ultima) ultima = coluna + 1;
        }
      }
    }
    return ultima;
  }
  getMaxRows() {
    this.viva();
    return this.maxLinhas;
  }
  getMaxColumns() {
    this.viva();
    return this.maxColunas;
  }

  getRange(a: number | string, coluna = 1, linhas = 1, colunas = 1): FaixaFalsa {
    this.viva();
    if (typeof a === "string") {
      const linhasInteiras = /^(\d+):(\d+)$/.exec(a);
      if (linhasInteiras) {
        const inicio = Number(linhasInteiras[1]);
        const fim = Number(linhasInteiras[2]);
        return new FaixaFalsa(this, inicio, 1, fim - inicio + 1, this.maxColunas);
      }
      const colunasInteiras = /^([A-Z]+):([A-Z]+)$/.exec(a);
      if (colunasInteiras) {
        const inicio = colunaDeLetras(colunasInteiras[1] ?? "");
        const fim = colunaDeLetras(colunasInteiras[2] ?? "");
        return new FaixaFalsa(this, 1, inicio, this.maxLinhas, fim - inicio + 1);
      }
      const faixa = intervaloA1(a);
      if (!faixa) throw new Error("Range not found");
      return new FaixaFalsa(
        this,
        faixa.linhaInicial,
        faixa.colunaInicial,
        faixa.linhaFinal - faixa.linhaInicial + 1,
        faixa.colunaFinal - faixa.colunaInicial + 1,
      );
    }
    return new FaixaFalsa(this, a, coluna, linhas, colunas);
  }

  /** Metadado de linha e coluna acompanha inserções, como no Google. */
  private deslocar(tipo: TipoLocal, aPartirDe: number, delta: number) {
    for (const item of this.metadados) {
      if (item.tipo === tipo && item.indice !== undefined && item.indice >= aPartirDe) {
        item.indice += delta;
      }
    }
  }

  insertRowsBefore(linha: number, quantidade: number) {
    if (linha - 1 <= this.celulas.length) {
      this.celulas.splice(
        linha - 1,
        0,
        ...Array.from({ length: quantidade }, () => Array.from({ length: this.maxColunas }, vazia)),
      );
    }
    this.maxLinhas += quantidade;
    this.deslocar("ROW", linha, quantidade);
    return this;
  }
  insertRowsAfter(linha: number, quantidade: number) {
    return this.insertRowsBefore(linha + 1, quantidade);
  }
  insertColumnsBefore(coluna: number, quantidade: number) {
    this.conferirFalha("insertColumnsBefore");
    for (const fileira of this.celulas) {
      while (fileira.length < coluna - 1) fileira.push(vazia());
      fileira.splice(coluna - 1, 0, ...Array.from({ length: quantidade }, vazia));
    }
    this.maxColunas += quantidade;
    this.deslocar("COLUMN", coluna, quantidade);
    return this;
  }
  insertColumnsAfter(coluna: number, quantidade: number) {
    if (coluna < 1) throw new Error("Those columns are out of bounds.");
    return this.insertColumnsBefore(coluna + 1, quantidade);
  }
  deleteColumn(coluna: number) {
    for (const fileira of this.celulas) fileira.splice(coluna - 1, 1);
    this.maxColunas -= 1;
    this.metadados = this.metadados.filter(
      (item) => !(item.tipo === "COLUMN" && item.indice === coluna),
    );
    this.deslocar("COLUMN", coluna + 1, -1);
    return this;
  }
  deleteRow(linha: number) {
    this.celulas.splice(linha - 1, 1);
    this.maxLinhas -= 1;
    this.metadados = this.metadados.filter(
      (item) => !(item.tipo === "ROW" && item.indice === linha),
    );
    this.deslocar("ROW", linha + 1, -1);
    return this;
  }
  clear() {
    for (const fileira of this.celulas) {
      for (let coluna = 0; coluna < fileira.length; coluna += 1) fileira[coluna] = vazia();
    }
    return this;
  }
  copyTo(planilha: PlanilhaFalsa) {
    this.viva();
    const copia = new AbaFalsa(`Cópia de ${this.nome}`, planilha);
    copia.celulas = this.celulas.map((fileira) => fileira.map(copiarCelula));
    copia.mesclagens = this.mesclagens.slice();
    copia.maxLinhas = this.maxLinhas;
    copia.maxColunas = this.maxColunas;
    copia.congeladasLinhas = this.congeladasLinhas;
    copia.congeladasColunas = this.congeladasColunas;
    copia.metadados = planilha.copiaLevaMetadados
      ? this.metadados.map((item) => ({ ...item }))
      : [];
    planilha.abas.push(copia);
    return copia;
  }
  addDeveloperMetadata(chave: string, valor = "") {
    this.metadados.push({ chave, valor, tipo: "SHEET" });
    return this;
  }
  createDeveloperMetadataFinder() {
    let chave: string | null = null;
    const finder = {
      withKey: (valor: string) => {
        chave = valor;
        return finder;
      },
      find: () =>
        this.metadados
          .filter((item) => chave === null || item.chave === chave)
          .map((item) => this.embrulhar(item)),
    };
    return finder;
  }
  private embrulhar(item: Metadado) {
    return {
      getKey: () => item.chave,
      getValue: () => item.valor,
      getLocation: () => ({
        getLocationType: () => item.tipo,
        getRow: () => (item.tipo === "ROW" ? this.getRange(`${item.indice}:${item.indice}`) : null),
        getColumn: () => {
          if (item.tipo !== "COLUMN") return null;
          const letras = letrasDaColuna(item.indice ?? 0);
          return this.getRange(`${letras}:${letras}`);
        },
        getSheet: () => (item.tipo === "SPREADSHEET" ? null : this),
      }),
      remove: () => {
        this.metadados = this.metadados.filter((outro) => outro !== item);
      },
    };
  }
  marcadoresDe(chave: string, tipo: TipoLocal) {
    return this.metadados
      .filter((item) => item.chave === chave && item.tipo === tipo)
      .map((item) => item.indice ?? 0)
      .sort((a, b) => a - b);
  }
}

class BandaFalsa {
  constructor(
    private readonly aba: AbaFalsa,
    private readonly faixa: FaixaFalsa,
  ) {}
  getRange() {
    return this.faixa;
  }
  remove() {
    this.aba.bandas = this.aba.bandas.filter((banda) => banda !== this);
  }
  setHeaderRowColor(cor: string) {
    this.faixa.setBackground(cor);
    return this;
  }
  setFirstRowColor(cor: string) {
    this.aba.estilos.push({
      intervalo: this.faixa.getA1Notation(),
      metodo: "primeiraLinha",
      valor: cor,
    });
    return this;
  }
  setSecondRowColor(cor: string) {
    this.aba.estilos.push({
      intervalo: this.faixa.getA1Notation(),
      metodo: "segundaLinha",
      valor: cor,
    });
    return this;
  }
}

class FaixaFalsa {
  constructor(
    private readonly aba: AbaFalsa,
    private readonly linha: number,
    private readonly coluna: number,
    private readonly linhas: number,
    private readonly colunas: number,
  ) {}

  private estilo(metodo: string, valor: unknown) {
    this.aba.estilos.push({ intervalo: this.getA1Notation(), metodo, valor });
    return this;
  }
  setBackground(valor: string | null) {
    return this.estilo("fundo", valor);
  }
  setFontColor(valor: string) {
    return this.estilo("corTexto", valor);
  }
  setFontWeight(valor: string) {
    return this.estilo("pesoTexto", valor);
  }
  setVerticalAlignment(valor: string) {
    return this.estilo("vertical", valor);
  }
  setHorizontalAlignment(valor: string) {
    return this.estilo("horizontal", valor);
  }
  setWrap(valor: boolean) {
    return this.estilo("quebraTexto", valor);
  }
  applyRowBanding() {
    if (
      this.aba.bandas.some((banda) => {
        const faixa = banda.getRange();
        return (
          faixa.getRow() < this.linha + this.linhas &&
          faixa.getRow() + faixa.getNumRows() > this.linha &&
          faixa.getColumn() < this.coluna + this.colunas &&
          faixa.getColumn() + faixa.getNumColumns() > this.coluna
        );
      })
    )
      throw new Error("This range already has alternating background colors.");
    const banda = new BandaFalsa(this.aba, this);
    this.aba.bandas.push(banda);
    return banda;
  }
  getRow() {
    return this.linha;
  }
  getColumn() {
    return this.coluna;
  }
  getNumRows() {
    return this.linhas;
  }
  getNumColumns() {
    return this.colunas;
  }
  getA1Notation() {
    const inicio = `${letrasDaColuna(this.coluna)}${this.linha}`;
    if (this.linhas === 1 && this.colunas === 1) return inicio;
    return `${inicio}:${letrasDaColuna(this.coluna + this.colunas - 1)}${this.linha + this.linhas - 1}`;
  }
  getValue() {
    return this.aba.getCelula(this.linha, this.coluna).valor;
  }
  getDisplayValue() {
    return exibir(this.getValue());
  }
  getFormula() {
    return this.aba.getCelula(this.linha, this.coluna).formula;
  }
  private gravar(linha: number, coluna: number, valor: unknown) {
    const celula = this.aba.getCelula(linha, coluna);
    celula.valor = valor instanceof Date ? valor : String(valor ?? "");
    celula.formula = "";
    this.aba.gravacoes.push(`${letrasDaColuna(coluna)}${linha}`);
  }
  setValue(valor: unknown) {
    this.gravar(this.linha, this.coluna, valor);
    return this;
  }
  clearContent() {
    const celula = this.aba.getCelula(this.linha, this.coluna);
    celula.valor = "";
    celula.formula = "";
    return this;
  }
  private matriz<T>(ler: (celula: Celula) => T): T[][] {
    const saida: T[][] = [];
    for (let l = 0; l < this.linhas; l += 1) {
      const fileira: T[] = [];
      for (let c = 0; c < this.colunas; c += 1) {
        fileira.push(ler(this.aba.getCelula(this.linha + l, this.coluna + c)));
      }
      saida.push(fileira);
    }
    return saida;
  }
  getValues() {
    return this.matriz((celula) => celula.valor);
  }
  getDisplayValues() {
    return this.matriz((celula) => exibir(celula.valor));
  }
  getFormulas() {
    return this.matriz((celula) => celula.formula);
  }
  /** Como a API real: gravar sobre fórmula apaga a fórmula. */
  setValues(valores: unknown[][]) {
    if (valores.length !== this.linhas || (valores[0]?.length ?? 0) !== this.colunas) {
      throw new Error("The number of rows or columns in the data does not match the range.");
    }
    for (let l = 0; l < valores.length; l += 1) {
      const fileira = valores[l] ?? [];
      for (let c = 0; c < fileira.length; c += 1) {
        this.gravar(this.linha + l, this.coluna + c, fileira[c]);
      }
    }
    return this;
  }
  /** Como a API real: só linha ou coluna inteira aceita metadado. */
  addDeveloperMetadata(chave: string, valor = "") {
    const linhaInteira =
      this.linhas === 1 && this.coluna === 1 && this.colunas === this.aba.getMaxColumns();
    const colunaInteira =
      this.colunas === 1 && this.linha === 1 && this.linhas === this.aba.getMaxRows();
    if (linhaInteira) {
      this.aba.metadados.push({ chave, valor, tipo: "ROW", indice: this.linha });
    } else if (colunaInteira) {
      this.aba.metadados.push({ chave, valor, tipo: "COLUMN", indice: this.coluna });
    } else {
      throw new Error(ERRO_METADADO_ARBITRARIO);
    }
    return this;
  }
  private cruza(coordenadas: Intervalo) {
    return !(
      coordenadas.linhaFinal < this.linha ||
      coordenadas.linhaInicial > this.linha + this.linhas - 1 ||
      coordenadas.colunaFinal < this.coluna ||
      coordenadas.colunaInicial > this.coluna + this.colunas - 1
    );
  }
  getMergedRanges() {
    return this.aba.mesclagens
      .map((intervalo) => ({ intervalo, coordenadas: intervaloA1(intervalo) }))
      .filter(
        (item): item is { intervalo: string; coordenadas: Intervalo } => item.coordenadas !== null,
      )
      .filter(({ coordenadas }) => this.cruza(coordenadas))
      .map((item) => ({ getA1Notation: () => item.intervalo }));
  }
  breakApart() {
    this.aba.mesclagens = this.aba.mesclagens.filter((intervalo) => {
      const coordenadas = intervaloA1(intervalo);
      return coordenadas === null || !this.cruza(coordenadas);
    });
    return this;
  }
  /** Cópia de conteúdo e mesclagens na mesma posição; metadado não vai junto. */
  copyTo(destino: FaixaFalsa) {
    for (let l = 0; l < this.linhas; l += 1) {
      for (let c = 0; c < this.colunas; c += 1) {
        const origem = this.aba.getCelula(this.linha + l, this.coluna + c);
        const alvo = destino.aba.getCelula(destino.linha + l, destino.coluna + c);
        const copia = copiarCelula(origem);
        alvo.valor = copia.valor;
        alvo.formula = copia.formula;
      }
    }
    for (const intervalo of this.aba.mesclagens) {
      if (!destino.aba.mesclagens.includes(intervalo)) destino.aba.mesclagens.push(intervalo);
    }
  }
}

class PlanilhaFalsa {
  nome: string;
  abas: AbaFalsa[] = [];
  copiaLevaMetadados: boolean;
  constructor(nome: string, copiaLevaMetadados: boolean) {
    this.nome = nome;
    this.copiaLevaMetadados = copiaLevaMetadados;
  }
  getName() {
    return this.nome;
  }
  getId() {
    return "planilha-falsa";
  }
  getUrl() {
    return "https://docs.google.com/spreadsheets/d/falsa";
  }
  getSpreadsheetTimeZone() {
    return "America/Fortaleza";
  }
  getSheets() {
    return this.abas;
  }
  getSheetByName(nome: string) {
    return this.abas.find((aba) => aba.nome === nome) ?? null;
  }
  insertSheet(nome: string) {
    const aba = new AbaFalsa(nome, this);
    this.abas.push(aba);
    return aba;
  }
  deleteSheet(aba: AbaFalsa) {
    aba.excluida = true;
    this.abas = this.abas.filter((item) => item !== aba);
  }
}

/** Contagem de chamadas ao serviço de planilhas, por método, para medir custo. */
interface Contador {
  total: number;
  porMetodo: Map<string, number>;
}

/**
 * Envolve os dublês para contar cada método chamado. Cada chamada ao serviço
 * real custa uma ida ao Google; a contagem aproxima o tempo do doPost.
 */
function contar<T>(alvo: T, contador: Contador): T {
  if (Array.isArray(alvo)) return alvo.map((item: unknown) => contar(item, contador)) as T;
  if (alvo === null || typeof alvo !== "object" || alvo instanceof Date) return alvo;
  return new Proxy(alvo as object, {
    get(objeto, chave, receptor) {
      const valor: unknown = Reflect.get(objeto, chave, receptor);
      if (typeof valor !== "function") return valor;
      return (...args: unknown[]) => {
        const nome = String(chave);
        contador.total += 1;
        contador.porMetodo.set(nome, (contador.porMetodo.get(nome) ?? 0) + 1);
        return contar((valor as (...a: unknown[]) => unknown).apply(objeto, args), contador);
      };
    },
  }) as T;
}

interface OpcoesContexto {
  /** Conta as chamadas feitas pelo script ao serviço de planilhas. */
  contador?: Contador;
  /** Simula `Sheet.copyTo` levando os metadados da aba (não confirmado). */
  copiaLevaMetadados?: boolean;
  /** Carimbo fixo, para simular duas cópias no mesmo segundo. */
  carimboFixo?: boolean;
}

interface Contexto {
  doPost(evento: { postData: { contents: string } }): { getContent(): string };
  aba: AbaFalsa;
  planilha: PlanilhaFalsa;
  errosRegistrados: unknown[][];
  definirToken(valor: string | null): void;
}

function montarContexto(opcoes: OpcoesContexto = {}): Contexto {
  const planilha = new PlanilhaFalsa("Frequência 2026", opcoes.copiaLevaMetadados ?? false);
  const aba = planilha.insertSheet("3º ano A");
  const cabecalho = ["Aluno", "Turma atual", "10/09", "11/09", "Total"];
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aba.getRange(2, 1, 2, 5).setValues([
    ["Alice", "3º ano A", "P", "", ""],
    ["Bruno", "3º ano A", "", "", ""],
  ]);
  aba.getCelula(2, 5).formula = '=CONT.SE(C2:D3;"F")';
  aba.gravacoes = [];
  const propriedades = new Map<string, string>();
  propriedades.set("FREQUENCIAPP_TOKEN", "segredo");
  const errosRegistrados: unknown[][] = [];
  let carimbo = 0;
  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (chave: string) => propriedades.get(chave) ?? null,
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => (opcoes.contador ? contar(planilha, opcoes.contador) : planilha),
      openById: () => (opcoes.contador ? contar(planilha, opcoes.contador) : planilha),
      flush: () => undefined,
      BandingTheme: { LIGHT_GREY: "LIGHT_GREY" },
      DeveloperMetadataLocationType: {
        SPREADSHEET: "SPREADSHEET",
        SHEET: "SHEET",
        ROW: "ROW",
        COLUMN: "COLUMN",
      },
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (texto: string) => ({
        getContent: () => texto,
        setMimeType: () => ({ getContent: () => texto }),
      }),
    },
    Utilities: {
      formatDate: (_data: Date, _fuso: string, formato: string) => {
        if (!opcoes.carimboFixo) carimbo += 1;
        const base = `20260926-0300${String(carimbo).padStart(2, "0")}`;
        return formato.includes("SSS") ? `${base}-000` : base;
      },
    },
    console: {
      log: () => undefined,
      warn: () => undefined,
      error: (...args: unknown[]) => {
        errosRegistrados.push(args);
      },
    },
  };
  const codigo = readFileSync(path.resolve("gas/Codigo.gs"), "utf8");
  vm.runInNewContext(codigo, sandbox);
  return {
    doPost: (evento) => {
      const texto = (
        sandbox as unknown as {
          doPost: (e: { postData: { contents: string } }) => { getContent(): string };
        }
      ).doPost(evento);
      return typeof texto === "string" ? { getContent: () => texto } : texto;
    },
    aba,
    planilha,
    errosRegistrados,
    definirToken: (valor) => {
      if (valor === null) propriedades.delete("FREQUENCIAPP_TOKEN");
      else propriedades.set("FREQUENCIAPP_TOKEN", valor);
    },
  };
}

interface Resposta {
  ok: boolean;
  erro?: string;
  detalhe?: string;
  parcial?: boolean;
  dados?: Record<string, unknown>;
}

function chamar(contexto: Contexto, corpo: Record<string, unknown>): Resposta {
  const resposta = contexto.doPost({
    postData: { contents: JSON.stringify({ token: "segredo", versao: 1, ...corpo }) },
  });
  return JSON.parse(resposta.getContent()) as Resposta;
}

function assinaturaDaAba(aba: AbaFalsa): string {
  const largura = Math.max(aba.getLastColumn(), 1);
  const cabecalho = aba.getRange(1, 1, 1, largura).getDisplayValues()[0] ?? [];
  // Mesmo cálculo do domínio e do script.
  let a = 0x811c9dc5;
  let b = 0x1000193;
  const texto = JSON.stringify([
    aba.getName(),
    cabecalho.map((v) => String(v).trim()),
    aba.mesclagens.slice().sort(),
  ]);
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    a ^= codigo;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ codigo, 0x85ebca6b) + indice) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/** Aplica operações na aba com a assinatura vigente. */
function aplicar(
  contexto: Contexto,
  operacoes: Record<string, unknown>[],
  opcoes: { aba?: AbaFalsa; modoCompleto?: boolean } = {},
): Resposta {
  const aba = opcoes.aba ?? contexto.aba;
  return chamar(contexto, {
    acao: "aplicar",
    aba: aba.getName(),
    cabecalhoLinha: 1,
    assinatura: assinaturaDaAba(aba),
    modoCompleto: opcoes.modoCompleto ?? false,
    operacoes,
  });
}

function ler(contexto: Contexto, aba: AbaFalsa = contexto.aba) {
  const resposta = chamar(contexto, {
    acao: "ler",
    aba: aba.getName(),
    linhaInicial: 1,
    colunaInicial: 1,
    linhas: 12,
    colunas: 10,
  });
  expect(resposta.ok).toBe(true);
  return resposta.dados as {
    valores: string[][];
    linhasCriadas: number[];
    colunasCriadas: number[];
  };
}

function criarCarla(contexto: Contexto, linha = 4): Resposta {
  return aplicar(contexto, [
    {
      tipo: "criarLinhas",
      itens: [
        {
          linha,
          celulas: [
            { coluna: 1, valor: "Carla" },
            { coluna: 2, valor: "3º ano A" },
          ],
        },
      ],
    },
  ]);
}

function nomesDeCopias(contexto: Contexto): string[] {
  return contexto.planilha
    .getSheets()
    .map((item) => item.nome)
    .filter((nome) => nome.startsWith("_frequenciapp_backup_"));
}

let contexto: Contexto;

describe("Apps Script", () => {
  beforeAll(() => {
    contexto = montarContexto();
  });

  it("recusa token inválido sem tocar na planilha", () => {
    const resposta = contexto.doPost({
      postData: { contents: JSON.stringify({ token: "errado", acao: "ping" }) },
    });
    expect(JSON.parse(resposta.getContent()).ok).toBe(false);
    expect(JSON.parse(resposta.getContent()).erro).toBe("Não autorizado.");
  });

  it("responde ping com planilha e abas", () => {
    const resposta = chamar(contexto, { acao: "ping" });
    expect(resposta.ok).toBe(true);
    const dados = resposta.dados as { planilha: { nome: string }; abas: unknown[] };
    expect(dados.planilha.nome).toBe("Frequência 2026");
    expect(dados.abas).toHaveLength(1);
  });

  it("lê janela de células com marcação de fórmula", () => {
    const resposta = chamar(contexto, {
      acao: "ler",
      aba: "3º ano A",
      linhaInicial: 1,
      colunaInicial: 1,
      linhas: 3,
      colunas: 5,
    });
    expect(resposta.ok).toBe(true);
    const dados = resposta.dados as { valores: string[][]; formula: boolean[][] };
    expect(dados.valores[1]?.[0]).toBe("Alice");
    expect(dados.formula[1]?.[4]).toBe(true);
    expect(dados.formula[0]?.[0]).toBe(false);
  });

  it("devolve as mesclagens da aba na estrutura", () => {
    contexto.aba.mesclagens.push("C1:D1");
    try {
      const resposta = chamar(contexto, { acao: "estrutura" });
      expect(resposta.ok).toBe(true);
      const dados = resposta.dados as { abas: { nome: string; mesclagens: string[] }[] };
      expect(dados.abas[0]?.mesclagens).toEqual(["C1:D1"]);
    } finally {
      contexto.aba.mesclagens.length = 0;
    }
  });

  it("escreve apenas em célula vazia e sem fórmula", () => {
    const resposta = chamar(contexto, {
      acao: "escrever",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      intervalos: [
        { linha: 2, coluna: 4, valores: [["P"]] },
        { linha: 3, coluna: 3, valores: [["F"]] },
        { linha: 2, coluna: 3, valores: [["F"]] },
        { linha: 2, coluna: 5, valores: [["0"]] },
      ],
    });
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({
      aplicadas: 2,
      puladasOcupadas: 1,
      puladasFormula: 1,
    });
    expect(contexto.aba.getCelula(2, 4).valor).toBe("P");
    expect(contexto.aba.getCelula(3, 3).valor).toBe("F");
    expect(contexto.aba.getCelula(2, 3).valor).toBe("P");
    expect(contexto.aba.getCelula(2, 5).formula).not.toBe("");
  });

  it("recusa escrita quando o cabeçalho muda", () => {
    const assinatura = assinaturaDaAba(contexto.aba);
    contexto.aba.getCelula(1, 2).valor = "Classe";
    const resposta = chamar(contexto, {
      acao: "escrever",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura,
      intervalos: [{ linha: 3, coluna: 4, valores: [["F"]] }],
    });
    expect(resposta.ok).toBe(false);
    expect(resposta.erro).toContain("estrutura da planilha mudou");
    contexto.aba.getCelula(1, 2).valor = "Turma atual";
  });

  it("recusa operação destrutiva sem o modo completo", () => {
    const resposta = aplicar(contexto, [{ tipo: "limpar", linha: 2, coluna: 3, anterior: "P" }]);
    expect(resposta.ok).toBe(false);
    expect(contexto.aba.getCelula(2, 3).valor).toBe("P");
  });

  it("substitui no modo completo e cria cópia antes de operação destrutiva", () => {
    const resposta = aplicar(
      contexto,
      [
        { tipo: "limpar", linha: 2, coluna: 3, anterior: "P" },
        { tipo: "substituir", linha: 2, coluna: 4, valor: "F", anterior: "P" },
      ],
      { modoCompleto: true },
    );
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ limpas: 1, substituidas: 1 });
    expect(contexto.aba.getCelula(2, 3).valor).toBe("");
    expect(contexto.aba.getCelula(2, 4).valor).toBe("F");
    expect(nomesDeCopias(contexto).length).toBeGreaterThanOrEqual(1);
  });

  it("recusa remoção de linha sem marcador da integração", () => {
    const resposta = aplicar(contexto, [{ tipo: "removerLinhas", linhas: [3] }], {
      modoCompleto: true,
    });
    expect(resposta.ok).toBe(false);
    expect(contexto.planilha.getSheetByName("3º ano A")?.getCelula(3, 1).valor).toBe("Bruno");
  });

  it("remove linha marcada e insere coluna com marcador", () => {
    const criar = aplicar(
      contexto,
      [
        {
          tipo: "criarLinhas",
          itens: [
            {
              linha: 4,
              celulas: [
                { coluna: 1, valor: "Carla" },
                { coluna: 2, valor: "3º ano A" },
              ],
            },
          ],
        },
        { tipo: "inserirColunas", antesDe: 5, cabecalhoLinha: 1, rotulos: ["12/09"] },
      ],
      { modoCompleto: true },
    );
    expect(criar.ok).toBe(true);
    expect(contexto.aba.getCelula(4, 1).valor).toBe("Carla");
    expect(contexto.aba.getCelula(1, 5).valor).toBe("12/09");
    // A leitura precisa reconhecer o que a integração criou para o modo
    // completo poder remover depois.
    const lidos = ler(contexto);
    expect(lidos.linhasCriadas).toContain(4);
    expect(lidos.colunasCriadas).toContain(5);
    const remover = aplicar(contexto, [{ tipo: "removerLinhas", linhas: [4] }], {
      modoCompleto: true,
    });
    expect(remover.ok).toBe(true);
    expect(remover.dados).toMatchObject({ removidasLinhas: 1 });
    const removerColuna = aplicar(contexto, [{ tipo: "removerColunas", colunas: [5] }], {
      modoCompleto: true,
    });
    expect(removerColuna.ok).toBe(true);
    expect(removerColuna.dados).toMatchObject({ removidasColunas: 1 });
  });

  it("cria, lista e remove aba com marcador", () => {
    const criar = chamar(contexto, {
      acao: "criarAba",
      nome: "3º ano C",
      cabecalho: ["Aluno", "Turma atual"],
    });
    expect(criar.ok).toBe(true);
    expect(contexto.planilha.getSheetByName("3º ano C")?.getCelula(1, 1).valor).toBe("Aluno");
    const remover = chamar(contexto, { acao: "removerAba", aba: "3º ano C" });
    expect(remover.ok).toBe(true);
    expect(contexto.planilha.getSheetByName("3º ano C")).toBeNull();
  });

  it("lista cópias e restaura a mais recente", () => {
    const copias = chamar(contexto, { acao: "listarCopias", aba: "3º ano A" });
    expect(copias.ok).toBe(true);
    const lista = (copias.dados as { copias: { nome: string; criadaEm: string }[] }).copias;
    expect(lista.length).toBeGreaterThanOrEqual(1);
    expect(lista[0]?.criadaEm).toMatch(/^2026-09-26 03:00$/);
    const resposta = chamar(contexto, {
      acao: "restaurarCopia",
      aba: "3º ano A",
      copia: lista[0]?.nome,
    });
    expect(resposta.ok).toBe(true);
    expect(contexto.planilha.getSheetByName("3º ano A")).not.toBeNull();
  });
});

describe("Apps Script: apresentação", () => {
  function organizar(local: Contexto, assinatura?: string) {
    return chamar(local, {
      acao: "organizarAba",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinatura ?? assinaturaDaAba(local.aba),
      colunas: colunasDeApresentacao(["Aluno", "Turma atual", "10/09", "11/09", "Total"]),
    });
  }
  it("aplica estilos sem regravar valores e fórmulas, e reaplica sem duplicar faixas", () => {
    const local = montarContexto();
    expect(organizar(local).ok).toBe(true);
    expect(local.aba.gravacoes).toEqual([]);
    expect(local.aba.getCelula(2, 5).formula).toBe('=CONT.SE(C2:D3;"F")');
    expect(local.aba.larguras.get(1)).toBe(260);
    expect(local.aba.larguras.get(3)).toBe(68);
    expect(local.aba.congeladasLinhas).toBe(1);
    expect(local.aba.estilos).toContainEqual({
      intervalo: "A1",
      metodo: "pesoTexto",
      valor: "bold",
    });
    expect(organizar(local).ok).toBe(true);
    expect(local.aba.bandas).toHaveLength(1);
  });
  it("recusa cabeçalho alterado antes do primeiro estilo", () => {
    const local = montarContexto();
    expect(organizar(local, "antiga").ok).toBe(false);
    expect(local.aba.estilos).toEqual([]);
    expect(local.aba.larguras.size).toBe(0);
  });
  it("preserva faixas manuais e recusa sobreposição antes de formatar", () => {
    const local = montarContexto();
    local.aba.getRange(2, 1, 5, 2).applyRowBanding();
    expect(organizar(local).ok).toBe(false);
    expect(local.aba.bandas).toHaveLength(1);
    expect(local.aba.estilos).toEqual([]);
  });
  it("preserva a coluna auxiliar da escola fora do padrão visual", () => {
    const local = montarContexto();
    local.aba.getRange(1, 6).setValue("Anotação da escola");
    local.aba.getRange(2, 6).setValue("Registro manual");
    local.aba.gravacoes = [];
    expect(organizar(local).ok).toBe(true);
    expect(local.aba.getCelula(2, 6).valor).toBe("Registro manual");
    expect(local.aba.larguras.has(6)).toBe(false);
    expect(local.aba.gravacoes).toEqual([]);
  });
  it("mantém os títulos de saídas legíveis para clientes anteriores sem plano visual", () => {
    const local = montarContexto();
    expect(
      chamar(local, {
        acao: "criarAba",
        nome: "Saídas",
        cabecalho: [
          "Data",
          "Aluno",
          "Turma",
          "Momento",
          "Justificativa",
          "Observação",
          "Liberado por",
        ],
      }).ok,
    ).toBe(true);
    const nova = local.planilha.getSheetByName("Saídas");
    expect(nova?.larguras.get(1)).toBe(110);
    expect(nova?.larguras.get(2)).toBe(260);
    expect(nova?.larguras.get(4)).toBe(160);
  });
  it("cria uma aba com cabeçalho legível e faixas nativas", () => {
    const local = montarContexto();
    expect(chamar(local, { acao: "criarAba", nome: "Nova" }).ok).toBe(true);
    const nova = local.planilha.getSheetByName("Nova");
    expect(nova?.larguras.get(1)).toBe(260);
    expect(nova?.estilos).toContainEqual({ intervalo: "A1", metodo: "corTexto", valor: "#ffffff" });
    expect(nova?.bandas).toHaveLength(1);
  });
});

describe("Apps Script: marcadores de linha e coluna", () => {
  it("cria duas linhas numa aba de saídas vazia, cada uma com marcador", () => {
    const local = montarContexto();
    const saidas = local.planilha.insertSheet("Saídas");
    saidas.getRange(1, 1, 1, 4).setValues([["Data", "Aluno", "Turma", "Momento"]]);
    const resposta = aplicar(
      local,
      [
        {
          tipo: "criarLinhas",
          itens: [
            {
              linha: 2,
              celulas: [
                { coluna: 1, valor: "25/09/2026" },
                { coluna: 2, valor: "Alice" },
              ],
            },
            {
              linha: 3,
              celulas: [
                { coluna: 1, valor: "26/09/2026" },
                { coluna: 2, valor: "Bruno" },
              ],
            },
          ],
        },
      ],
      { aba: saidas },
    );
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ linhasCriadas: 2 });
    expect(saidas.marcadoresDe("frequenciapp.linha", "ROW")).toEqual([2, 3]);
    expect(ler(local, saidas).linhasCriadas).toEqual([2, 3]);
  });

  it("não marca nem grava linha que já tem dado em outra coluna", () => {
    const local = montarContexto();
    local.aba.getCelula(4, 3).valor = "anotação manual";
    const resposta = criarCarla(local);
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ linhasCriadas: 0, puladasOcupadas: 1 });
    expect(local.aba.getCelula(4, 1).valor).toBe("");
    expect(local.aba.marcadoresDe("frequenciapp.linha", "ROW")).toEqual([]);
  });

  it("segue a linha criada quando uma linha manual entra acima dela", () => {
    const local = montarContexto();
    expect(criarCarla(local).ok).toBe(true);
    // Linha manual inserida acima: Bruno desce para 4 e Carla para 5.
    local.aba.insertRowsBefore(2, 1);
    local.aba.getCelula(2, 1).valor = "Manual";
    expect(local.aba.getCelula(4, 1).valor).toBe("Bruno");
    expect(ler(local).linhasCriadas).toEqual([5]);
    const antiga = aplicar(local, [{ tipo: "removerLinhas", linhas: [4] }], {
      modoCompleto: true,
    });
    expect(antiga.ok).toBe(false);
    expect(local.aba.getCelula(4, 1).valor).toBe("Bruno");
    const atual = aplicar(local, [{ tipo: "removerLinhas", linhas: [5] }], { modoCompleto: true });
    expect(atual.ok).toBe(true);
    expect(local.aba.getCelula(4, 1).valor).toBe("Bruno");
    expect(local.aba.getCelula(5, 1).valor).toBe("");
  });

  it("segue a coluna criada quando outra coluna entra antes dela", () => {
    const local = montarContexto();
    const primeira = aplicar(local, [
      { tipo: "inserirColunas", antesDe: 5, cabecalhoLinha: 1, rotulos: ["12/09"] },
    ]);
    expect(primeira.ok).toBe(true);
    const segunda = aplicar(local, [
      { tipo: "inserirColunas", antesDe: 5, cabecalhoLinha: 1, rotulos: ["13/09"] },
    ]);
    expect(segunda.ok).toBe(true);
    expect(ler(local).colunasCriadas).toEqual([5, 6]);
    expect(local.aba.getCelula(1, 6).valor).toBe("12/09");
  });

  it("reconhece o marcador de linha antigo pela localização e ignora marcador de aba", () => {
    const local = montarContexto();
    local.aba.metadados.push({
      chave: "frequenciapp.linha",
      valor: "linha:2",
      tipo: "ROW",
      indice: 3,
    });
    local.aba.metadados.push({ chave: "frequenciapp.linha", valor: "linha:9", tipo: "SHEET" });
    expect(ler(local).linhasCriadas).toEqual([3]);
  });

  it("insere colunas sem posição depois da última coluna do cabeçalho", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [
      { tipo: "inserirColunas", cabecalhoLinha: 1, rotulos: ["12/09", "13/09"] },
    ]);
    expect(resposta.ok).toBe(true);
    const cabecalho = local.aba.getRange(1, 1, 1, 7).getDisplayValues()[0];
    expect(cabecalho).toEqual([
      "Aluno",
      "Turma atual",
      "10/09",
      "11/09",
      "Total",
      "12/09",
      "13/09",
    ]);
    expect(local.aba.getCelula(2, 5).formula).not.toBe("");
    expect(ler(local).colunasCriadas).toEqual([6, 7]);
  });

  it("insere colunas numa aba sem colunas sobrando", () => {
    const local = montarContexto();
    const justa = local.planilha.insertSheet("Justa");
    justa.maxColunas = 2;
    justa.getRange(1, 1, 1, 2).setValues([["Aluno", "Turma atual"]]);
    const resposta = aplicar(
      local,
      [{ tipo: "inserirColunas", cabecalhoLinha: 1, rotulos: ["12/09"] }],
      { aba: justa },
    );
    expect(resposta.ok).toBe(true);
    expect(justa.getCelula(1, 3).valor).toBe("12/09");
    expect(justa.marcadoresDe("frequenciapp.coluna", "COLUMN")).toEqual([3]);
  });
});

describe("Apps Script: escrita e comparação", () => {
  it("nunca regrava célula com fórmula ou ocupada num intervalo misto", () => {
    const local = montarContexto();
    const resposta = chamar(local, {
      acao: "escrever",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(local.aba),
      intervalos: [{ linha: 2, coluna: 3, valores: [["F", "F", "9"]] }],
    });
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ aplicadas: 1, puladasOcupadas: 1, puladasFormula: 1 });
    expect(local.aba.getCelula(2, 5).formula).toBe('=CONT.SE(C2:D3;"F")');
    expect(local.aba.getCelula(2, 4).valor).toBe("F");
    expect(local.aba.gravacoes).toEqual(["D2"]);
  });

  it("agrupa células vazias contíguas numa gravação por trecho", () => {
    const local = montarContexto();
    const resposta = chamar(local, {
      acao: "escrever",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(local.aba),
      intervalos: [
        {
          linha: 3,
          coluna: 3,
          valores: [
            ["F", "P", "0"],
            ["F", "F", "0"],
          ],
        },
      ],
    });
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ aplicadas: 6, puladasOcupadas: 0, puladasFormula: 0 });
    expect(local.aba.gravacoes.sort()).toEqual(["C3", "C4", "D3", "D4", "E3", "E4"]);
  });

  it("completa com vazio a linha de valores mais curta que o intervalo", () => {
    const local = montarContexto();
    const resposta = chamar(local, {
      acao: "escrever",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(local.aba),
      intervalos: [{ linha: 3, coluna: 3, valores: [["F", "P"], ["F"]] }],
    });
    expect(resposta.ok).toBe(true);
    expect(local.aba.getCelula(3, 4).valor).toBe("P");
    expect(local.aba.getCelula(4, 3).valor).toBe("F");
    expect(local.aba.getCelula(4, 4).valor).toBe("");
  });

  it("substitui e limpa célula de data comparando o texto exibido", () => {
    const local = montarContexto();
    local.aba.getCelula(3, 3).valor = new Date(Date.UTC(2026, 8, 25, 12));
    local.aba.getCelula(3, 4).valor = new Date(Date.UTC(2026, 8, 26, 12));
    const resposta = aplicar(
      local,
      [
        { tipo: "substituir", linha: 3, coluna: 3, valor: "F", anterior: "25/09/2026" },
        { tipo: "limpar", linha: 3, coluna: 4, anterior: "26/09/2026" },
      ],
      { modoCompleto: true },
    );
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ substituidas: 1, limpas: 1, puladasOcupadas: 0 });
    expect(local.aba.getCelula(3, 3).valor).toBe("F");
    expect(local.aba.getCelula(3, 4).valor).toBe("");
  });

  it("não substitui data quando o texto exibido mudou", () => {
    const local = montarContexto();
    local.aba.getCelula(3, 3).valor = new Date(Date.UTC(2026, 8, 25, 12));
    const resposta = aplicar(
      local,
      [{ tipo: "substituir", linha: 3, coluna: 3, valor: "F", anterior: "24/09/2026" }],
      { modoCompleto: true },
    );
    expect(resposta.dados).toMatchObject({ substituidas: 0, puladasOcupadas: 1 });
  });
});

describe("Apps Script: erros", () => {
  it("devolve frase, detalhe sem o token e parcial quando o plano quebra no meio", () => {
    const local = montarContexto();
    local.aba.falharEm = "insertColumnsBefore";
    const resposta = aplicar(local, [
      { tipo: "preencher", linha: 3, coluna: 3, valor: "F" },
      { tipo: "inserirColunas", antesDe: 5, cabecalhoLinha: 1, rotulos: ["12/09"] },
    ]);
    expect(resposta.ok).toBe(false);
    expect(resposta.erro).toBe("Não foi possível concluir a operação na planilha.");
    expect(resposta.parcial).toBe(true);
    expect(resposta.detalhe).toContain("Service Spreadsheets failed");
    expect(resposta.detalhe).not.toContain("segredo");
    expect(local.errosRegistrados.length).toBeGreaterThan(0);
    expect(String(local.errosRegistrados[0]?.[0])).toContain("Service Spreadsheets failed");
  });

  it("recusa corpo inválido sem ecoar o conteúdo", () => {
    const local = montarContexto();
    const resposta = local.doPost({ postData: { contents: '{"token":"segredo", acao' } });
    const texto = resposta.getContent();
    expect(texto).not.toContain("segredo");
    expect(JSON.parse(texto)).toMatchObject({ ok: false, erro: "Corpo inválido." });
  });

  it("não marca como parcial a recusa prevista", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [{ tipo: "removerLinhas", linhas: [3] }], {
      modoCompleto: true,
    });
    expect(resposta.ok).toBe(false);
    expect(resposta.parcial).toBeUndefined();
  });
});

describe("Apps Script: cópias e restauração", () => {
  for (const copiaLevaMetadados of [false, true]) {
    const caso = copiaLevaMetadados ? "cópia com metadados" : "cópia sem metadados";

    it(`restaura na própria aba, preservando identidade e marcadores (${caso})`, () => {
      const local = montarContexto({ copiaLevaMetadados });
      const original = local.aba;
      expect(criarCarla(local).ok).toBe(true);
      const remover = aplicar(local, [{ tipo: "removerLinhas", linhas: [4] }], {
        modoCompleto: true,
      });
      expect(remover.ok).toBe(true);
      expect(original.getCelula(4, 1).valor).toBe("");
      const lista = chamar(local, { acao: "listarCopias", aba: "3º ano A" });
      const copias = (lista.dados as { copias: { nome: string }[] }).copias;
      expect(copias).toHaveLength(1);
      const resposta = chamar(local, {
        acao: "restaurarCopia",
        aba: "3º ano A",
        copia: copias[0]?.nome,
      });
      expect(resposta.ok).toBe(true);
      expect(local.planilha.getSheetByName("3º ano A")).toBe(original);
      expect(local.planilha.getSheets()[0]).toBe(original);
      expect(original.isSheetHidden()).toBe(false);
      expect(original.getCelula(4, 1).valor).toBe("Carla");
      expect(original.getCelula(2, 5).formula).toBe('=CONT.SE(C2:D3;"F")');
      expect(original.marcadoresDe("frequenciapp.copia", "SHEET")).toEqual([]);
      expect(ler(local).linhasCriadas).toEqual(copiaLevaMetadados ? [4] : []);
    });

    it(`não deixa a cópia herdar o marcador de aba criada (${caso})`, () => {
      const local = montarContexto({ copiaLevaMetadados });
      expect(chamar(local, { acao: "criarAba", nome: "3º ano C" }).ok).toBe(true);
      const criada = local.planilha.getSheetByName("3º ano C");
      if (!criada) throw new Error("aba ausente");
      criada.getRange(2, 1, 1, 2).setValues([["Dora", "3º ano C"]]);
      const limpar = aplicar(
        local,
        [{ tipo: "limpar", linha: 2, coluna: 2, anterior: "3º ano C" }],
        {
          aba: criada,
          modoCompleto: true,
        },
      );
      expect(limpar.ok).toBe(true);
      const nome = nomesDeCopias(local).find((item) => item.includes("3º ano C"));
      const copia = local.planilha.getSheetByName(nome ?? "");
      expect(copia?.marcadoresDe("frequenciapp.aba", "SHEET")).toEqual([]);
      expect(copia?.marcadoresDe("frequenciapp.copia", "SHEET")).toHaveLength(1);
      expect(chamar(local, { acao: "removerAba", aba: nome }).ok).toBe(false);
      const restaurar = chamar(local, { acao: "restaurarCopia", aba: "3º ano C", copia: nome });
      expect(restaurar.ok).toBe(true);
      expect(criada.marcadoresDe("frequenciapp.aba", "SHEET")).toHaveLength(1);
      expect(criada.marcadoresDe("frequenciapp.copia", "SHEET")).toEqual([]);
      expect(criada.getCelula(2, 2).valor).toBe("3º ano C");
    });
  }

  it("restaura a cópia mais antiga mesmo com o limite de cópias cheio", () => {
    const local = montarContexto();
    const valores = ["P", "F", "A"];
    for (const [indice, valor] of valores.entries()) {
      const anterior = indice === 0 ? "" : (valores[indice - 1] ?? "");
      const resposta = aplicar(
        local,
        [{ tipo: "substituir", linha: 3, coluna: 3, valor, anterior }],
        { modoCompleto: true },
      );
      expect(resposta.ok).toBe(true);
    }
    const lista = chamar(local, { acao: "listarCopias", aba: "3º ano A" });
    const copias = (lista.dados as { copias: { nome: string }[] }).copias;
    expect(copias).toHaveLength(3);
    const maisAntiga = copias[2]?.nome;
    const resposta = chamar(local, { acao: "restaurarCopia", aba: "3º ano A", copia: maisAntiga });
    expect(resposta.ok).toBe(true);
    expect(local.aba.getCelula(3, 3).valor).toBe("");
    expect(nomesDeCopias(local)).toHaveLength(3);
  });

  it("não colide o nome de duas cópias no mesmo instante", () => {
    const local = montarContexto({ carimboFixo: true });
    const primeira = aplicar(local, [{ tipo: "limpar", linha: 2, coluna: 3, anterior: "P" }], {
      modoCompleto: true,
    });
    expect(primeira.ok).toBe(true);
    const segunda = aplicar(
      local,
      [{ tipo: "substituir", linha: 2, coluna: 1, valor: "Alícia", anterior: "Alice" }],
      { modoCompleto: true },
    );
    expect(segunda.ok).toBe(true);
    const nomes = nomesDeCopias(local);
    expect(new Set(nomes).size).toBe(2);
    const lista = chamar(local, { acao: "listarCopias", aba: "3º ano A" });
    const copias = (lista.dados as { copias: { criadaEm: string }[] }).copias;
    expect(copias.map((item) => item.criadaEm)).toEqual(["2026-09-26 03:00", "2026-09-26 03:00"]);
  });

  it("poda as cópias de uma aba sem tocar as de outra com prefixo parecido", () => {
    const local = montarContexto();
    const a = local.planilha.insertSheet("A");
    a.getRange(1, 1, 1, 2).setValues([["Aluno", "Turma atual"]]);
    a.getRange(2, 1, 1, 2).setValues([["Eva", "A"]]);
    const deOutra = [1, 2, 3, 4].map(
      (indice) => `_frequenciapp_backup_A_B_20260101-00000${indice}`,
    );
    for (const nome of deOutra) local.planilha.insertSheet(nome).hideSheet();
    const resposta = aplicar(local, [{ tipo: "limpar", linha: 2, coluna: 2, anterior: "A" }], {
      aba: a,
      modoCompleto: true,
    });
    expect(resposta.ok).toBe(true);
    for (const nome of deOutra) expect(local.planilha.getSheetByName(nome)).not.toBeNull();
    const lista = chamar(local, { acao: "listarCopias", aba: "A" });
    expect((lista.dados as { copias: unknown[] }).copias).toHaveLength(1);
  });
});

describe("Apps Script: token", () => {
  it("aceita só o token idêntico", () => {
    const local = montarContexto();
    for (const token of ["segred", "segredO", "segredo ", "", "segredos"]) {
      const resposta = local.doPost({
        postData: { contents: JSON.stringify({ token, acao: "ping" }) },
      });
      expect(JSON.parse(resposta.getContent()).erro).toBe("Não autorizado.");
    }
    expect(chamar(local, { acao: "ping" }).ok).toBe(true);
    local.definirToken(null);
    expect(chamar(local, { acao: "ping" }).erro).toBe("Não autorizado.");
  });
});

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BRUNO_ID = "22222222-2222-4222-8222-222222222222";
const CARLA_ID = "33333333-3333-4333-8333-333333333333";

function vinculos(contexto: Contexto) {
  return (ler(contexto) as unknown as { alunosDasLinhas: { linha: number; alunoId: string }[] })
    .alunosDasLinhas;
}

describe("Apps Script: código do aluno na linha", () => {
  it("vincula a linha pelo nome conferido e devolve o código na leitura", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [
      {
        tipo: "vincularLinhas",
        itens: [
          { linha: 2, coluna: 1, nome: "Alice", alunoId: ALICE_ID },
          { linha: 3, coluna: 1, nome: "Bruno", alunoId: BRUNO_ID },
        ],
      },
    ]);
    expect(resposta.dados).toMatchObject({ vinculadas: 2, puladasVinculo: 0 });
    expect(vinculos(local)).toEqual([
      { linha: 2, alunoId: ALICE_ID },
      { linha: 3, alunoId: BRUNO_ID },
    ]);
  });

  it("pula o vínculo quando o nome da linha mudou desde a prévia", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [
      {
        tipo: "vincularLinhas",
        itens: [{ linha: 2, coluna: 1, nome: "Bruno", alunoId: BRUNO_ID }],
      },
    ]);
    expect(resposta.dados).toMatchObject({ vinculadas: 0, puladasVinculo: 1 });
    expect(vinculos(local)).toEqual([]);
  });

  it("recusa código fora do formato", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [
      { tipo: "vincularLinhas", itens: [{ linha: 2, coluna: 1, nome: "Alice", alunoId: "x" }] },
    ]);
    expect(resposta.ok).toBe(false);
  });

  it("grava o código na linha criada e o mantém quando uma linha entra acima", () => {
    const local = montarContexto();
    const resposta = aplicar(local, [
      {
        tipo: "criarLinhas",
        itens: [{ linha: 4, alunoId: CARLA_ID, celulas: [{ coluna: 1, valor: "Carla" }] }],
      },
    ]);
    expect(resposta.ok).toBe(true);
    local.aba.insertRowsBefore(2, 1);
    expect(vinculos(local)).toEqual([{ linha: 5, alunoId: CARLA_ID }]);
  });

  it("mantém uma linha por aluno e um aluno por linha", () => {
    const local = montarContexto();
    aplicar(local, [
      {
        tipo: "vincularLinhas",
        itens: [{ linha: 2, coluna: 1, nome: "Alice", alunoId: ALICE_ID }],
      },
    ]);
    aplicar(local, [
      {
        tipo: "vincularLinhas",
        itens: [{ linha: 3, coluna: 1, nome: "Bruno", alunoId: ALICE_ID }],
      },
    ]);
    aplicar(local, [
      {
        tipo: "vincularLinhas",
        itens: [{ linha: 3, coluna: 1, nome: "Bruno", alunoId: BRUNO_ID }],
      },
    ]);
    expect(vinculos(local)).toEqual([{ linha: 3, alunoId: BRUNO_ID }]);
  });
});

/** Aba de uma turma com 35 alunos, sem código nas linhas, como a do 3º C. */
function montarTurmaGrande(contador: Contador): Contexto {
  const local = montarContexto({ contador });
  const nomes = Array.from(
    { length: 35 },
    (_, indice) => `Aluno ${String(indice + 1).padStart(2, "0")}`,
  );
  local.aba.getRange(2, 1, 35, 5).setValues(nomes.map((nome) => [nome, "3º ano C", "", "", ""]));
  return local;
}

/** Envio diário típico: vincular 35 linhas, criar o dia e preencher 35 células. */
function envioDiario(local: Contexto): Resposta {
  const ids = Array.from(
    { length: 35 },
    (_, indice) => `00000000-0000-4000-8000-${String(indice + 1).padStart(12, "0")}`,
  );
  return aplicar(local, [
    {
      tipo: "vincularLinhas",
      itens: ids.map((alunoId, indice) => ({
        linha: indice + 2,
        coluna: 1,
        nome: `Aluno ${String(indice + 1).padStart(2, "0")}`,
        alunoId,
      })),
    },
    { tipo: "inserirColunas", antesDe: 5, cabecalhoLinha: 1, rotulos: ["28/09"] },
    ...ids.map((_, indice) => ({
      tipo: "preencher",
      linha: indice + 2,
      coluna: 5,
      valor: indice % 7 === 0 ? "F" : "P",
    })),
  ]);
}

describe("Apps Script: custo do envio diário", () => {
  // Com a versão 3, o mesmo envio fazia 3.376 chamadas: a vinculação buscava
  // os metadados da aba de novo a cada linha e relia todos eles.
  it("vincula, cria o dia e preenche 35 alunos com poucas chamadas ao serviço", () => {
    const contador: Contador = { total: 0, porMetodo: new Map() };
    const local = montarTurmaGrande(contador);
    contador.total = 0;
    contador.porMetodo.clear();
    const resposta = envioDiario(local);
    expect(resposta.dados).toMatchObject({ vinculadas: 35, colunasCriadas: 1, preenchidas: 35 });
    expect(contador.total).toBeLessThanOrEqual(120);
    expect(contador.porMetodo.get("createDeveloperMetadataFinder")).toBe(1);
    expect(local.aba.marcadoresDe("frequenciapp.aluno", "ROW")).toHaveLength(35);
    expect(local.aba.getCelula(2, 5).valor).toBe("F");
    expect(local.aba.getCelula(3, 5).valor).toBe("P");
    expect(Object.keys((resposta.dados as { tempos: object }).tempos)).toEqual([
      "vincularLinhas",
      "inserirColunas",
      "preencher",
      "gravar",
    ]);
  });

  it("no lote, pula célula com fórmula ou ocupada e grava o resto", () => {
    const local = montarTurmaGrande({ total: 0, porMetodo: new Map() });
    local.aba.getCelula(4, 3).formula = "=1";
    local.aba.getCelula(5, 3).valor = "FJ";
    const resposta = aplicar(
      local,
      [2, 3, 4, 5, 6, 8].map((linha) => ({ tipo: "preencher", linha, coluna: 3, valor: "F" })),
    );
    expect(resposta.dados).toMatchObject({ preenchidas: 4, puladasFormula: 1, puladasOcupadas: 1 });
    expect([2, 3, 4, 5, 6, 7, 8].map((linha) => local.aba.getCelula(linha, 3).valor)).toEqual([
      "F",
      "F",
      "",
      "FJ",
      "F",
      "",
      "F",
    ]);
    expect(local.aba.getCelula(4, 3).formula).toBe("=1");
  });

  it("lê só os blocos de colunas pedidos, com assinatura e última linha", () => {
    const local = montarTurmaGrande({ total: 0, porMetodo: new Map() });
    const resposta = chamar(local, {
      acao: "ler",
      aba: "3º ano A",
      linhaInicial: 1,
      cabecalhoLinha: 1,
      blocos: [
        { coluna: 1, colunas: 1 },
        { coluna: 4, colunas: 2 },
      ],
    });
    const dados = resposta.dados as {
      blocos: { coluna: number; valores: string[][] }[];
      assinatura: string;
      ultimaLinha: number;
    };
    expect(dados.blocos.map((bloco) => [bloco.coluna, bloco.valores[0]])).toEqual([
      [1, ["Aluno"]],
      [4, ["11/09", "Total"]],
    ]);
    expect(dados.ultimaLinha).toBe(36);
    expect(dados.assinatura).toBe(assinaturaDaAba(local.aba));
  });

  it("devolve a estrutura de uma aba só quando pedida", () => {
    const local = montarContexto();
    local.planilha.insertSheet("Outra");
    const toda = chamar(local, { acao: "estrutura" }).dados as { abas: unknown[] };
    const uma = chamar(local, { acao: "estrutura", aba: "3º ano A" }).dados as {
      abas: { nome: string }[];
    };
    expect(toda.abas).toHaveLength(2);
    expect(uma.abas.map((aba) => aba.nome)).toEqual(["3º ano A"]);
  });
});

/**
 * Histórico do script publicado. Qualquer mudança no gas/Codigo.gs muda o
 * hash e exige nova entrada com versão maior, o que obriga a subir a VERSAO
 * e, com ela, o aviso de script atrasado no aplicativo.
 */
const VERSOES_DO_SCRIPT = [
  { versao: 1, sha256: "1fe567b6391975de778c75b285a8a4e6d2b879e340d3079c3b0bc45ece75550b" },
  { versao: 2, sha256: "3b4a451026e87f8eb9634b7ed0b6d520dbf2d08602c8374f261c03df4b9c9faa" },
  { versao: 3, sha256: "b10946c2d7497c2f4b2cf02e53bbf17e9fc5ddad7b801f7e8509ff6f52a0b933" },
  { versao: 4, sha256: "9b2c7ee0a010bb99c925ca96fe935249b211ef71d253a0ed8f6c56c079836404" },
  { versao: 5, sha256: "dbde00f2ea7499695898621542ee5ef8b5acb963127f4d2e30513172a8876576" },
];

describe("Apps Script: versão", () => {
  const codigo = readFileSync(path.resolve("gas/Codigo.gs"), "utf8");
  const versao = Number(codigo.match(/var VERSAO = (\d+)/)?.[1] ?? 0);

  it("mantém a versão do script igual à esperada pelo aplicativo", () => {
    expect(versao).toBe(VERSAO_SCRIPT);
  });

  it("exige versão nova a cada mudança no script", () => {
    const hash = createHash("sha256").update(codigo).digest("hex");
    const ultima = VERSOES_DO_SCRIPT[VERSOES_DO_SCRIPT.length - 1];
    expect(
      ultima,
      "Acrescente { versao, sha256 } em VERSOES_DO_SCRIPT ao mudar o gas/Codigo.gs.",
    ).toEqual({ versao, sha256: hash });
    for (let indice = 1; indice < VERSOES_DO_SCRIPT.length; indice += 1) {
      expect(VERSOES_DO_SCRIPT[indice]?.versao).toBeGreaterThan(
        VERSOES_DO_SCRIPT[indice - 1]?.versao ?? 0,
      );
    }
  });
});
