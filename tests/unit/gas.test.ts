// Apps Script: roteamento, token, escrita conservadora, marcadores, cópias e
// restauração. O Codigo.gs roda em vm com dublês das APIs do Google.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeAll, describe, expect, it } from "vitest";
import { VERSAO_SCRIPT } from "@/domain/planilha";

interface Celula {
  valor: string;
  formula: string;
}

interface Metadado {
  chave: string;
  linha?: number;
  coluna?: number;
}

class AbaFalsa {
  nome: string;
  oculta = false;
  congeladasLinhas = 0;
  congeladasColunas = 0;
  mesclagens: string[] = [];
  celulas: Celula[][] = [];
  metadados: Metadado[] = [];
  maxLinhas = 500;
  maxColunas = 60;
  dono: PlanilhaFalsa;

  constructor(nome: string, dono: PlanilhaFalsa) {
    this.nome = nome;
    this.dono = dono;
  }

  private garantir(linha: number, coluna: number) {
    while (this.celulas.length < linha) {
      this.celulas.push(
        Array.from({ length: this.maxColunas }, () => ({ valor: "", formula: "" })),
      );
    }
    const fileira = this.celulas[linha - 1];
    if (fileira && fileira.length < coluna) {
      while (fileira.length < coluna) fileira.push({ valor: "", formula: "" });
    }
  }

  getCelula(linha: number, coluna: number): Celula {
    this.garantir(linha, coluna);
    return this.celulas[linha - 1]?.[coluna - 1] ?? { valor: "", formula: "" };
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
  isSheetHidden() {
    return this.oculta;
  }
  hideSheet() {
    this.oculta = true;
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
  getMergedRanges() {
    return this.mesclagens.map((intervalo) => ({
      getA1Notation: () => intervalo,
    }));
  }
  getLastRow() {
    let ultima = 0;
    for (let linha = 0; linha < this.celulas.length; linha += 1) {
      const fileira = this.celulas[linha] ?? [];
      if (fileira.some((celula) => celula.valor !== "" || celula.formula !== ""))
        ultima = linha + 1;
    }
    return ultima;
  }
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
    return this.maxLinhas;
  }
  getMaxColumns() {
    return this.maxColunas;
  }

  getRange(linha: number, coluna: number, linhas = 1, colunas = 1): FaixaFalsa {
    return new FaixaFalsa(this, linha, coluna, linhas, colunas);
  }

  insertColumnsBefore(coluna: number, quantidade: number) {
    for (const fileira of this.celulas) {
      fileira.splice(
        coluna - 1,
        0,
        ...Array.from({ length: quantidade }, () => ({ valor: "", formula: "" })),
      );
    }
    this.maxColunas += quantidade;
    return this;
  }
  insertColumnsAfter(coluna: number, quantidade: number) {
    return this.insertColumnsBefore(coluna + 1, quantidade);
  }
  deleteColumn(coluna: number) {
    for (const fileira of this.celulas) fileira.splice(coluna - 1, 1);
    this.maxColunas -= 1;
    this.metadados = this.metadados.filter(
      (item) => item.coluna === undefined || item.coluna !== coluna,
    );
    return this;
  }
  deleteRow(linha: number) {
    this.celulas.splice(linha - 1, 1);
    this.maxLinhas -= 1;
    this.metadados = this.metadados.filter(
      (item) => item.linha === undefined || item.linha !== linha,
    );
    return this;
  }
  copyTo(planilha: PlanilhaFalsa) {
    const copia = new AbaFalsa("Cópia", planilha);
    copia.celulas = this.celulas.map((fileira) => fileira.map((celula) => ({ ...celula })));
    copia.mesclagens = this.mesclagens.slice();
    copia.metadados = [];
    planilha.abas.push(copia);
    return copia;
  }
  addDeveloperMetadata(chave: string, _valor: string) {
    this.metadados.push({ chave });
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
          .filter((item) => item.chave === chave)
          .map((item) => ({
            getLocation: () => ({
              getRow: () => item.linha ?? null,
              getColumn: () => item.coluna ?? null,
            }),
          })),
    };
    return finder;
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

  getValue() {
    return this.aba.getCelula(this.linha, this.coluna).valor;
  }
  getFormula() {
    return this.aba.getCelula(this.linha, this.coluna).formula;
  }
  setValue(valor: unknown) {
    const celula = this.aba.getCelula(this.linha, this.coluna);
    celula.valor = String(valor);
    celula.formula = "";
    return this;
  }
  clearContent() {
    const celula = this.aba.getCelula(this.linha, this.coluna);
    celula.valor = "";
    celula.formula = "";
    return this;
  }
  getValues() {
    const saida: string[][] = [];
    for (let l = 0; l < this.linhas; l += 1) {
      const fileira: string[] = [];
      for (let c = 0; c < this.colunas; c += 1) {
        fileira.push(String(this.aba.getCelula(this.linha + l, this.coluna + c).valor));
      }
      saida.push(fileira);
    }
    return saida;
  }
  getDisplayValues() {
    return this.getValues();
  }
  getFormulas() {
    const saida: string[][] = [];
    for (let l = 0; l < this.linhas; l += 1) {
      const fileira: string[] = [];
      for (let c = 0; c < this.colunas; c += 1) {
        fileira.push(this.aba.getCelula(this.linha + l, this.coluna + c).formula);
      }
      saida.push(fileira);
    }
    return saida;
  }
  setValues(valores: unknown[][]) {
    for (let l = 0; l < valores.length; l += 1) {
      const fileira = valores[l] ?? [];
      for (let c = 0; c < fileira.length; c += 1) {
        const celula = this.aba.getCelula(this.linha + l, this.coluna + c);
        celula.valor = String(fileira[c] ?? "");
        celula.formula = "";
      }
    }
    return this;
  }
  addDeveloperMetadata(chave: string, _valor: string) {
    this.aba.metadados.push({ chave, linha: this.linha, coluna: this.coluna });
    return this;
  }
}

class PlanilhaFalsa {
  nome: string;
  abas: AbaFalsa[] = [];
  constructor(nome: string) {
    this.nome = nome;
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
    this.abas = this.abas.filter((item) => item !== aba);
  }
}

interface Contexto {
  doPost(evento: { postData: { contents: string } }): { getContent(): string };
  aba: AbaFalsa;
  planilha: PlanilhaFalsa;
  definirToken(valor: string | null): void;
  proximoCarimbo(): string;
}

function montarContexto(): Contexto {
  const planilha = new PlanilhaFalsa("Frequência 2026");
  const aba = planilha.insertSheet("3º ano A");
  const cabecalho = ["Aluno", "Turma atual", "10/09", "11/09", "Total"];
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aba.getRange(2, 1, 2, 5).setValues([
    ["Alice", "3º ano A", "P", "", ""],
    ["Bruno", "3º ano A", "", "", ""],
  ]);
  aba.getCelula(2, 5).formula = '=CONT.SE(C2:D3;"F")';
  const propriedades = new Map<string, string>();
  propriedades.set("FREQUENCIAPP_TOKEN", "segredo");
  let carimbo = 0;
  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (chave: string) => propriedades.get(chave) ?? null,
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => planilha,
      openById: () => planilha,
      flush: () => undefined,
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
      formatDate: () => {
        carimbo += 1;
        return `20260926-0300${String(carimbo).padStart(2, "0")}`;
      },
    },
    console,
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
    definirToken: (valor) => {
      if (valor === null) propriedades.delete("FREQUENCIAPP_TOKEN");
      else propriedades.set("FREQUENCIAPP_TOKEN", valor);
    },
    proximoCarimbo: () => {
      carimbo += 1;
      return `20260926-0300${String(carimbo).padStart(2, "0")}`;
    },
  };
}

function chamar(contexto: Contexto, corpo: Record<string, unknown>) {
  const resposta = contexto.doPost({
    postData: { contents: JSON.stringify({ token: "segredo", versao: 1, ...corpo }) },
  });
  return JSON.parse(resposta.getContent()) as {
    ok: boolean;
    erro?: string;
    dados?: Record<string, unknown>;
  };
}

function assinaturaDaAba(aba: AbaFalsa): string {
  const largura = Math.max(aba.getLastColumn(), 1);
  const cabecalho = aba.getRange(1, 1, 1, largura).getDisplayValues()[0] ?? [];
  // Mesmo cálculo do domínio e do script.
  let a = 0x811c9dc5;
  let b = 0x1000193;
  const texto = JSON.stringify([aba.getName(), cabecalho.map((v) => String(v).trim()), []]);
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    a ^= codigo;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ codigo, 0x85ebca6b) + indice) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
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
    const resposta = chamar(contexto, {
      acao: "aplicar",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      operacoes: [{ tipo: "limpar", linha: 2, coluna: 3, anterior: "P" }],
    });
    expect(resposta.ok).toBe(false);
    expect(contexto.aba.getCelula(2, 3).valor).toBe("P");
  });

  it("substitui no modo completo e cria cópia antes de operação destrutiva", () => {
    const resposta = chamar(contexto, {
      acao: "aplicar",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      modoCompleto: true,
      operacoes: [
        { tipo: "limpar", linha: 2, coluna: 3, anterior: "P" },
        { tipo: "substituir", linha: 2, coluna: 4, valor: "F", anterior: "P" },
      ],
    });
    expect(resposta.ok).toBe(true);
    expect(resposta.dados).toMatchObject({ limpas: 1, substituidas: 1 });
    expect(contexto.aba.getCelula(2, 3).valor).toBe("");
    expect(contexto.aba.getCelula(2, 4).valor).toBe("F");
    const copias = contexto.planilha
      .getSheets()
      .filter((item) => item.nome.startsWith("_frequenciapp_backup_"));
    expect(copias.length).toBeGreaterThanOrEqual(1);
  });

  it("recusa remoção de linha sem marcador da integração", () => {
    const resposta = chamar(contexto, {
      acao: "aplicar",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      modoCompleto: true,
      operacoes: [{ tipo: "removerLinhas", linhas: [3] }],
    });
    expect(resposta.ok).toBe(false);
    expect(contexto.planilha.getSheetByName("3º ano A")?.getCelula(3, 1).valor).toBe("Bruno");
  });

  it("remove linha marcada e insere coluna com marcador", () => {
    const criar = chamar(contexto, {
      acao: "aplicar",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      modoCompleto: true,
      operacoes: [
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
        {
          tipo: "inserirColunas",
          antesDe: 5,
          cabecalhoLinha: 1,
          rotulos: ["12/09"],
        },
      ],
    });
    expect(criar.ok).toBe(true);
    expect(contexto.aba.getCelula(4, 1).valor).toBe("Carla");
    expect(contexto.aba.getCelula(1, 5).valor).toBe("12/09");
    const remover = chamar(contexto, {
      acao: "aplicar",
      aba: "3º ano A",
      cabecalhoLinha: 1,
      assinatura: assinaturaDaAba(contexto.aba),
      modoCompleto: true,
      operacoes: [{ tipo: "removerLinhas", linhas: [4] }],
    });
    expect(remover.ok).toBe(true);
    expect(remover.dados).toMatchObject({ removidasLinhas: 1 });
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
    const lista = (copias.dados as { copias: { nome: string }[] }).copias;
    expect(lista.length).toBeGreaterThanOrEqual(1);
    const resposta = chamar(contexto, {
      acao: "restaurarCopia",
      aba: "3º ano A",
      copia: lista[0]?.nome,
    });
    expect(resposta.ok).toBe(true);
    expect(contexto.planilha.getSheetByName("3º ano A")).not.toBeNull();
  });

  it("mantém a versão do script igual à esperada pelo aplicativo", () => {
    const codigo = readFileSync(path.resolve("gas/Codigo.gs"), "utf8");
    const encontrada = Number(codigo.match(/var VERSAO = (\d+)/)?.[1] ?? 0);
    expect(encontrada).toBe(VERSAO_SCRIPT);
  });
});
