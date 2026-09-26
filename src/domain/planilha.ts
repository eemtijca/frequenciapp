// Planilha: dataframe da turma de origem, esquema da planilha, detecção de
// layout, planejamento conservador de sincronização e exportação CSV. Regras
// puras, compartilhadas pelo servidor, pela interface e pelos testes.
import {
  montarGrade,
  normalizar,
  type Aluno,
  type Frequencia,
  type Horario,
  type Marca,
} from "@/domain/frequencia";

export const FRASE_MODO_COMPLETO = "EDITAR PLANILHA";
export const DURACOES_MODO_COMPLETO = [5, 15, 30, 60] as const;
export type DuracaoModoCompleto = (typeof DURACOES_MODO_COMPLETO)[number];

/** Endpoint aceito: Web App do Google. Fora de produção o teste aceita local. */
export function validarEndpoint(valor: string, permitirLocal: boolean): string | null {
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return "Informe uma URL válida, começando por https://.";
  }
  const local =
    permitirLocal &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (!local) {
    if (url.protocol !== "https:") return "O endereço da planilha precisa usar https.";
    if (url.hostname !== "script.google.com") {
      return "O endereço precisa ser o aplicativo da Web publicado no Google Apps Script.";
    }
    if (!/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)) {
      return "O endereço precisa terminar em /exec, como no Apps Script.";
    }
  }
  return null;
}

/** Hash estável e curto o bastante para assinatura de esquema e de plano. */
export function hashTexto(texto: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const codigo = texto.charCodeAt(indice);
    a ^= codigo;
    a = Math.imul(a, 0x01000193) >>> 0;
    b = (Math.imul(b ^ codigo, 0x85ebca6b) + indice) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- dataframe

/** Linha da planilha da turma de origem: aluno, turma atual e marcas por dia. */
export interface LinhaTurmaPlanilha {
  alunoId: string;
  nome: string;
  turmaAtual: string;
  marcas: Record<string, Marca | undefined>;
}

export interface TurmaPlanilha {
  turmaOriginalId: string;
  rotulo: string;
  dias: string[];
  linhas: LinhaTurmaPlanilha[];
}

/** Monta o dataframe da turma de origem a partir da mesma grade da interface. */
export function montarTurmaPlanilha(
  turmaOriginalId: string,
  rotulo: string,
  alunos: Aluno[],
  frequencias: Frequencia[],
  horarios: Horario[],
  dias: string[],
  rotuloDaTurma: (id: string) => string,
): TurmaPlanilha {
  const ativos = alunos.filter((aluno) => aluno.ativo && aluno.turmaOriginalId === turmaOriginalId);
  const grade = montarGrade(ativos, frequencias, dias, horarios);
  return {
    turmaOriginalId,
    rotulo,
    dias,
    linhas: grade.linhas.map((linha) => ({
      alunoId: linha.aluno.id,
      nome: linha.aluno.nome,
      turmaAtual: rotuloDaTurma(linha.aluno.turmaId),
      marcas: linha.marcas,
    })),
  };
}

/** DataFrame a partir das linhas da Grade da interface, sem recalcular marcas. */
export function turmaPlanilhaDaGrade(
  turmaOriginalId: string,
  rotulo: string,
  dias: string[],
  linhas: { aluno: Aluno; marcas: Record<string, Marca | undefined> }[],
  rotuloDaTurma: (id: string) => string,
): TurmaPlanilha {
  return {
    turmaOriginalId,
    rotulo,
    dias,
    linhas: linhas.map((linha) => ({
      alunoId: linha.aluno.id,
      nome: linha.aluno.nome,
      turmaAtual: rotuloDaTurma(linha.aluno.turmaId),
      marcas: linha.marcas,
    })),
  };
}

/** Nome de arquivo estável para o CSV, sem acento nem espaço. */
export function nomeArquivoCsv(turma: TurmaPlanilha): string {
  const turmaSegura = normalizar(turma.rotulo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const primeiro = turma.dias[0] ?? "periodo";
  const ultimo = turma.dias[turma.dias.length - 1] ?? primeiro;
  return `frequenciapp-grade-${turmaSegura || "turma"}-${primeiro}-a-${ultimo}.csv`;
}

/** Data curta dd/mm a partir de AAAA-MM-DD. */
function dataCurta(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${numero}/${mes}`;
}

/** Campo CSV seguro: sem fórmula e com escape de aspas, quebras e ponto e vírgula. */
export function campoCsv(valor: string): string {
  const semFormula = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[";\r\n]/.test(semFormula) ? `"${semFormula.replace(/"/g, '""')}"` : semFormula;
}

/** CSV da turma de origem, com BOM e ponto e vírgula para o Excel pt-BR. */
export function paraCsv(turma: TurmaPlanilha): string {
  const cabecalho = [
    "Aluno",
    "Turma atual",
    ...turma.dias.map(dataCurta),
    "Faltas",
    "Justificadas",
    "Total (F + FJ)",
  ];
  const linhas = turma.linhas.map((linha) => {
    let faltas = 0;
    let justificadas = 0;
    const marcas = turma.dias.map((dia) => {
      const marca = linha.marcas[dia];
      if (marca === "F") faltas += 1;
      if (marca === "FJ") justificadas += 1;
      return marca ?? "";
    });
    return [
      linha.nome,
      linha.turmaAtual,
      ...marcas,
      String(faltas),
      String(justificadas),
      String(faltas + justificadas),
    ];
  });
  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map((valor) => campoCsv(valor)).join(";"))
    .join("\r\n");
  return `\uFEFF${corpo}\r\n`;
}

// ------------------------------------------------------------------ esquema

export type TipoColuna = "aluno" | "dia" | "total" | "turma" | "texto" | "numero";

export interface ColunaEsquema {
  indice: number;
  letra: string;
  rotulo: string;
  tipo: TipoColuna;
  data?: string;
  formula?: boolean;
  oculta?: boolean;
}

export interface AbaEsquema {
  nome: string;
  oculta: boolean;
  /** Verdadeiro quando a aba foi criada pela integração (marcador). */
  criada?: boolean;
  totalLinhas: number;
  totalColunas: number;
  congeladas: { linhas: number; colunas: number };
  mesclagens: string[];
  cabecalho: number;
  colunas: ColunaEsquema[];
  ultimaLinhaDados: number;
  ultimaColunaDados: number;
  assinatura: string;
}

export interface PlanilhaEsquema {
  nome: string;
  url: string;
  fuso: string;
  versao: number;
  abas: AbaEsquema[];
}

/** Leitura bruta de uma aba, como o Apps Script devolve. */
export interface AbaBruta {
  nome: string;
  valores: string[][];
  formulas?: string[][];
  linhas?: number;
  colunas?: number;
  oculta?: boolean;
  criada?: boolean;
  congeladasLinhas?: number;
  congeladasColunas?: number;
  mesclagens?: string[];
}

/** Leitura de conteúdo da aba, com posição e marcação de fórmula. */
export interface LeituraAba {
  nome: string;
  valores: string[][];
  formula: boolean[][];
  linhaInicial: number;
  colunaInicial: number;
  linhasCriadas?: number[];
  colunasCriadas?: number[];
}

const ROTULOS_ALUNO = new Set(["aluno", "aluna", "nome", "estudante", "nome do aluno"]);
const ROTULOS_TURMA = new Set(["turma", "turma atual", "atual", "classe"]);
const ROTULOS_TOTAL = new Set(["total", "faltas", "total de faltas", "faltas totais"]);

function textoLimpo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function cabeComoAluno(rotulo: string): boolean {
  return ROTULOS_ALUNO.has(normalizar(rotulo).replace(/[.:*]/g, "").trim());
}

function cabeComoTurma(rotulo: string): boolean {
  return ROTULOS_TURMA.has(normalizar(rotulo).replace(/[.:*]/g, "").trim());
}

function cabeComoTotal(rotulo: string): boolean {
  const limpo = normalizar(rotulo)
    .replace(/[.:*()]/g, "")
    .trim();
  return ROTULOS_TOTAL.has(limpo) || limpo.startsWith("total");
}

/** Data reconhecida no cabeçalho: dd/mm, dd/mm/aa, dd/mm/aaaa ou ISO. */
export function dataDoRotulo(rotulo: string, anoReferencia: number): string | null {
  const valor = rotulo.trim().replace(/\s/g, "");
  let partes: RegExpMatchArray | null = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (partes) return `${partes[1]}-${partes[2]}-${partes[3]}`;
  partes = valor.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!partes) return null;
  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  const anoTexto = partes[3] ?? String(anoReferencia);
  const ano = anoTexto.length === 2 ? Number(`20${anoTexto}`) : Number(anoTexto);
  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(ano)) return null;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  if (data.getUTCDate() !== dia || data.getUTCMonth() !== mes - 1) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function letraColuna(indice: number): string {
  let valor = indice;
  let letra = "";
  while (valor > 0) {
    const resto = (valor - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    valor = Math.floor((valor - 1) / 26);
  }
  return letra;
}

/**
 * Linha do cabeçalho: a que concentra rótulos entre as dez primeiras, com peso
 * maior para "aluno" e para datas reconhecidas.
 */
export function detectarLinhaCabecalho(valores: string[][], anoReferencia: number): number {
  let melhor = 0;
  let melhorPontuacao = -1;
  const limite = Math.min(10, valores.length);
  for (let linha = 0; linha < limite; linha += 1) {
    const celulas = valores[linha] ?? [];
    let pontuacao = 0;
    for (const celula of celulas) {
      const texto = textoLimpo(celula);
      if (texto === "") continue;
      if (cabeComoAluno(texto)) pontuacao += 3;
      else if (cabeComoTotal(texto) || cabeComoTurma(texto)) pontuacao += 2;
      else if (dataDoRotulo(texto, anoReferencia)) pontuacao += 2;
      else pontuacao += 0.25;
    }
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhor = linha;
    }
  }
  return melhor + 1;
}

/**
 * Esquema de uma aba: cabeçalho, colunas com tipo e data, coluna de total,
 * última linha de dados e assinatura para detectar deriva. Mesclagens que
 * cobrem mais de uma coluna de dia ficam registradas para o ajuste manual.
 */
export function detectarEsquema(aba: AbaBruta, anoReferencia: number): AbaEsquema {
  const valores = aba.valores;
  const linhaCabecalho = detectarLinhaCabecalho(valores, anoReferencia);
  const cabecalho = valores[linhaCabecalho - 1] ?? [];
  const colunas: ColunaEsquema[] = [];

  const primeiraColunaTexto = definirColunaAluno(valores, linhaCabecalho);
  const totalPorFormula = colunasComFormula(aba, linhaCabecalho);

  for (let indice = 0; indice < cabecalho.length; indice += 1) {
    const numero = indice + 1;
    const rotulo = textoLimpo(cabecalho[indice]);
    const data = rotulo === "" ? null : dataDoRotulo(rotulo, anoReferencia);
    const temFormula = totalPorFormula.has(numero);
    let tipo: TipoColuna = "texto";
    if (numero === primeiraColunaTexto) tipo = "aluno";
    else if (data) tipo = "dia";
    else if (cabeComoTurma(rotulo)) tipo = "turma";
    else if (cabeComoTotal(rotulo) || temFormula) tipo = "total";
    else if (rotulo !== "" && ehNumeroNaColuna(valores, linhaCabecalho, indice)) tipo = "numero";
    else if (rotulo === "" && ehNumeroNaColuna(valores, linhaCabecalho, indice)) tipo = "numero";
    colunas.push({
      indice: numero,
      letra: letraColuna(numero),
      rotulo,
      tipo,
      ...(data ? { data } : {}),
      ...(temFormula ? { formula: true } : {}),
      ...(aba.oculta ? { oculta: true } : {}),
    });
  }

  const ultimaLinhaDados = detectarUltimaLinha(valores, linhaCabecalho, primeiraColunaTexto);
  const ultimaColunaDados = detectarUltimaColuna(valores, linhaCabecalho);
  const mesclagens = (aba.mesclagens ?? []).filter((intervalo) => intervaloCobreColunas(intervalo));
  const assinatura = assinarAba(aba.nome, cabecalho, mesclagens);
  return {
    nome: aba.nome,
    oculta: Boolean(aba.oculta),
    criada: Boolean(aba.criada),
    totalLinhas: aba.linhas ?? valores.length,
    totalColunas: aba.colunas ?? Math.max(cabecalho.length, ultimaColunaDados),
    congeladas: {
      linhas: aba.congeladasLinhas ?? 0,
      colunas: aba.congeladasColunas ?? 0,
    },
    mesclagens,
    cabecalho: linhaCabecalho,
    colunas,
    ultimaLinhaDados,
    ultimaColunaDados,
    assinatura,
  };
}

function definirColunaAluno(valores: string[][], linhaCabecalho: number): number {
  const cabecalho = valores[linhaCabecalho - 1] ?? [];
  const porRotulo = cabecalho.findIndex((celula) => cabeComoAluno(textoLimpo(celula)));
  if (porRotulo >= 0) return porRotulo + 1;
  const largura = Math.max(cabecalho.length, 1);
  for (let coluna = 0; coluna < largura; coluna += 1) {
    let texto = 0;
    let total = 0;
    for (let linha = linhaCabecalho; linha < valores.length; linha += 1) {
      const valor = textoLimpo(valores[linha]?.[coluna]);
      if (valor === "") continue;
      total += 1;
      if (!/^\s*[0-9]+([.,][0-9]+)?\s*$/.test(valor)) texto += 1;
    }
    if (total >= 2 && texto / total >= 0.6) return coluna + 1;
  }
  return 1;
}

function colunasComFormula(aba: AbaBruta, linhaCabecalho: number): Set<number> {
  const comFormula = new Set<number>();
  const formulas = aba.formulas;
  if (!formulas) return comFormula;
  for (let linha = linhaCabecalho - 1; linha < formulas.length; linha += 1) {
    const celulas = formulas[linha] ?? [];
    for (let coluna = 0; coluna < celulas.length; coluna += 1) {
      if (textoLimpo(celulas[coluna]) !== "") comFormula.add(coluna + 1);
    }
  }
  return comFormula;
}

function ehNumeroNaColuna(valores: string[][], linhaCabecalho: number, coluna: number): boolean {
  let numero = 0;
  let total = 0;
  for (let linha = linhaCabecalho; linha < valores.length; linha += 1) {
    const valor = textoLimpo(valores[linha]?.[coluna]);
    if (valor === "") continue;
    total += 1;
    if (/^-?[0-9]+([.,][0-9]+)?$/.test(valor)) numero += 1;
  }
  return total > 0 && numero === total;
}

function detectarUltimaLinha(
  valores: string[][],
  linhaCabecalho: number,
  colunaAluno: number,
): number {
  for (let linha = valores.length - 1; linha >= linhaCabecalho; linha -= 1) {
    if (textoLimpo(valores[linha]?.[colunaAluno - 1]) !== "") return linha + 1;
  }
  return linhaCabecalho;
}

function detectarUltimaColuna(valores: string[][], linhaCabecalho: number): number {
  let ultima = 0;
  for (let linha = linhaCabecalho - 1; linha < valores.length; linha += 1) {
    const celulas = valores[linha] ?? [];
    for (let coluna = celulas.length - 1; coluna >= 0; coluna -= 1) {
      if (textoLimpo(celulas[coluna]) !== "") {
        if (coluna + 1 > ultima) ultima = coluna + 1;
        break;
      }
    }
  }
  return ultima;
}

function intervaloCobreColunas(intervalo: string): boolean {
  const partes = intervalo.split(":");
  if (partes.length !== 2) return false;
  const primeira = partes[0] ?? "";
  const segunda = partes[1] ?? "";
  const letra1 = primeira.replace(/[^A-Za-z]/g, "").toUpperCase();
  const letra2 = segunda.replace(/[^A-Za-z]/g, "").toUpperCase();
  return letra1 !== "" && letra2 !== "" && letra1 !== letra2;
}

/** Assinatura de uma aba: nome, cabeçalho e mesclagens. Igual à do script. */
export function assinarAba(nome: string, cabecalho: string[], mesclagens: string[]): string {
  return hashTexto(JSON.stringify([nome, cabecalho.map(textoLimpo), mesclagens.slice().sort()]));
}

/** Assinatura da planilha inteira, usada para detectar deriva de esquema. */
export function assinarEsquema(abas: AbaEsquema[]): string {
  return hashTexto(
    JSON.stringify(
      abas
        .map((aba) => [aba.nome, aba.cabecalho, aba.colunas.map((coluna) => coluna.rotulo)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR")),
    ),
  );
}

// ------------------------------------------------------------------ plano

export interface OpcoesPlano {
  modo: "conservador" | "completo";
  permitirInserirColunas: boolean;
  permitirNovosAlunos: boolean;
  substituirDivergencias?: boolean;
  limparCelulas?: string[];
  removerLinhas?: number[];
  removerColunas?: number[];
}

export interface CelulaPlano {
  linha: number;
  coluna: number;
  celula: string;
  valor: string;
  anterior: string;
  alunoId: string;
  alunoNome: string;
  dia: string;
}

export interface ColunaNovaPlano {
  dia: string;
  rotulo: string;
  /** Índice final da coluna depois das inserções. */
  indice: number;
  /** Letra da coluna Total antes da qual inserir; nulo quando acrescenta ao fim. */
  antesDe: string | null;
}

export interface AlunoNovoPlano {
  alunoId: string;
  nome: string;
  turmaAtual: string;
  linha: number;
}

export interface RemocaoPlano {
  linha: number;
  nome: string;
}

export interface ColunaCriada {
  coluna: number;
  letra: string;
  rotulo: string;
  data?: string;
}

export interface ResumoPlano {
  preencher: number;
  substituir: number;
  limpar: number;
  novasColunas: number;
  novosAlunos: number;
  removerLinhas: number;
  removerColunas: number;
  puladasFormula: number;
  puladasOcupadas: number;
  ambiguidades: number;
}

export interface PlanoSincronizacao {
  turmaOriginalId: string;
  rotulo: string;
  aba: string;
  assinatura: string;
  planoHash: string;
  preencher: CelulaPlano[];
  substituir: CelulaPlano[];
  limpar: CelulaPlano[];
  novasColunas: ColunaNovaPlano[];
  novosAlunos: AlunoNovoPlano[];
  removerLinhas: RemocaoPlano[];
  removerColunas: ColunaCriada[];
  candidatosRemocaoLinhas: RemocaoPlano[];
  candidatosRemocaoColunas: ColunaCriada[];
  resumo: ResumoPlano;
  avisos: string[];
}

function celulaA1(linha: number, coluna: number): string {
  return `${letraColuna(coluna)}${linha}`;
}

function marcaCombinam(atual: string, desejada: Marca): boolean {
  return atual.trim().toUpperCase() === desejada;
}

interface LinhaExistente {
  linha: number;
  nome: string;
  chave: string;
}

interface MapaLinhas {
  porChave: Map<string, LinhaExistente>;
  contagens: Map<string, number>;
}

function mapearLinhas(conteudo: LeituraAba, esquema: AbaEsquema): MapaLinhas {
  const porChave = new Map<string, LinhaExistente>();
  const contagens = new Map<string, number>();
  const colunaAluno = esquema.colunas.find((coluna) => coluna.tipo === "aluno")?.indice ?? 1;
  const colunaRelativa = colunaAluno - conteudo.colunaInicial;
  for (let linha = esquema.cabecalho + 1; linha <= esquema.ultimaLinhaDados; linha += 1) {
    const relativa = linha - conteudo.linhaInicial;
    const bruto = conteudo.valores[relativa]?.[colunaRelativa] ?? "";
    const nome = textoLimpo(bruto);
    if (nome === "") continue;
    const chave = normalizar(nome);
    contagens.set(chave, (contagens.get(chave) ?? 0) + 1);
    if (!porChave.has(chave)) porChave.set(chave, { linha, nome, chave });
  }
  return { porChave, contagens };
}

/**
 * Planeja a sincronização de uma turma de origem em uma aba. No modo
 * conservador apenas células vazias entram no plano; divergências viram
 * aviso. Operações destrutivas exigem o modo completo e listas explícitas.
 */
export function planejarSincronizacao(
  esquema: AbaEsquema,
  turma: TurmaPlanilha,
  conteudo: LeituraAba,
  opcoes: OpcoesPlano,
): PlanoSincronizacao {
  const modoCompleto = opcoes.modo === "completo";
  const colunasDia = new Map<string, ColunaEsquema>();
  let colunaTotal: ColunaEsquema | null = null;
  let colunaTurma: ColunaEsquema | null = null;
  for (const coluna of esquema.colunas) {
    if (coluna.tipo === "dia" && coluna.data) colunasDia.set(coluna.data, coluna);
    if (coluna.tipo === "total" && !colunaTotal) colunaTotal = coluna;
    if (coluna.tipo === "turma" && !colunaTurma) colunaTurma = coluna;
  }

  const novasColunas: ColunaNovaPlano[] = [];
  const avisos: string[] = [];
  const baseInsercao = colunaTotal?.indice ?? esquema.ultimaColunaDados + 1;
  const diasComMarca = new Set(
    turma.dias.filter((dia) => turma.linhas.some((linha) => Boolean(linha.marcas[dia]))),
  );
  let posicaoNova = baseInsercao;
  for (const dia of turma.dias) {
    if (colunasDia.has(dia) || !diasComMarca.has(dia)) continue;
    if (!opcoes.permitirInserirColunas) {
      avisos.push(`O dia ${dia} não tem coluna na planilha.`);
      continue;
    }
    novasColunas.push({
      dia,
      rotulo: dataCurta(dia),
      indice: posicaoNova,
      antesDe: colunaTotal?.letra ?? null,
    });
    posicaoNova += 1;
  }

  const { porChave: linhasExistentes, contagens: contagemNomes } = mapearLinhas(conteudo, esquema);
  const celulasPreencher: CelulaPlano[] = [];
  const celulasSubstituir: CelulaPlano[] = [];
  const celulasLimpar: CelulaPlano[] = [];
  const novosAlunos: AlunoNovoPlano[] = [];
  const limparPedidas = new Set(opcoes.limparCelulas ?? []);
  let puladasFormula = 0;
  let puladasOcupadas = 0;
  let ambiguidades = 0;

  const colunasDiaCompletas = new Map(colunasDia);
  const diasNovos = new Set<string>();
  for (const nova of novasColunas) {
    diasNovos.add(nova.dia);
    colunasDiaCompletas.set(nova.dia, {
      indice: nova.indice,
      letra: "",
      rotulo: nova.rotulo,
      tipo: "dia",
      data: nova.dia,
    });
  }

  let linhaNovo = Math.max(esquema.ultimaLinhaDados, esquema.cabecalho) + 1;
  for (const linha of turma.linhas) {
    const chave = normalizar(linha.nome);
    const existente = linhasExistentes.get(chave);
    let numeroLinha = existente?.linha ?? 0;
    if (!existente) {
      if (!opcoes.permitirNovosAlunos) {
        avisos.push(`O aluno ${linha.nome} não tem linha na planilha.`);
        continue;
      }
      novosAlunos.push({
        alunoId: linha.alunoId,
        nome: linha.nome,
        turmaAtual: linha.turmaAtual,
        linha: linhaNovo,
      });
      numeroLinha = linhaNovo;
      linhaNovo += 1;
    } else if ((contagemNomes.get(chave) ?? 0) > 1) {
      ambiguidades += 1;
      avisos.push(`O nome ${linha.nome} aparece mais de uma vez na planilha.`);
      continue;
    }
    for (const dia of turma.dias) {
      const marca = linha.marcas[dia];
      const coluna = colunasDiaCompletas.get(dia);
      if (!coluna || coluna.indice === 0) continue;
      const relativaLinha = numeroLinha - conteudo.linhaInicial;
      const relativaColuna = coluna.indice - conteudo.colunaInicial;
      // Coluna nova ainda não existe: o destino nasce vazio e sem fórmula,
      // independentemente do que ocupa a posição antes da inserção.
      const novaLinha = diasNovos.has(dia);
      const atual = novaLinha ? "" : textoLimpo(conteudo.valores[relativaLinha]?.[relativaColuna]);
      const comFormula = novaLinha
        ? false
        : Boolean(conteudo.formula[relativaLinha]?.[relativaColuna]);
      const celula = celulaA1(numeroLinha, coluna.indice);
      if (marca) {
        if (atual === "") {
          if (comFormula) {
            puladasFormula += 1;
            continue;
          }
          celulasPreencher.push({
            linha: numeroLinha,
            coluna: coluna.indice,
            celula,
            valor: marca,
            anterior: "",
            alunoId: linha.alunoId,
            alunoNome: linha.nome,
            dia,
          });
        } else if (!marcaCombinam(atual, marca)) {
          if (comFormula) {
            puladasFormula += 1;
          } else if (modoCompleto && opcoes.substituirDivergencias) {
            celulasSubstituir.push({
              linha: numeroLinha,
              coluna: coluna.indice,
              celula,
              valor: marca,
              anterior: atual,
              alunoId: linha.alunoId,
              alunoNome: linha.nome,
              dia,
            });
          } else {
            puladasOcupadas += 1;
          }
        }
      } else if (modoCompleto && atual !== "" && limparPedidas.has(celula) && !comFormula) {
        celulasLimpar.push({
          linha: numeroLinha,
          coluna: coluna.indice,
          celula,
          valor: "",
          anterior: atual,
          alunoId: linha.alunoId,
          alunoNome: linha.nome,
          dia,
        });
      }
    }
  }

  const linhasCriadas = new Set(conteudo.linhasCriadas ?? []);
  const removerLinhas: RemocaoPlano[] =
    modoCompleto && opcoes.removerLinhas
      ? opcoes.removerLinhas
          .filter((linha) => linhasCriadas.has(linha))
          .map((linha) => {
            const relativa = linha - conteudo.linhaInicial;
            const colunaAluno =
              esquema.colunas.find((coluna) => coluna.tipo === "aluno")?.indice ?? 1;
            const bruto = conteudo.valores[relativa]?.[colunaAluno - conteudo.colunaInicial] ?? "";
            return { linha, nome: textoLimpo(bruto) };
          })
          .filter((item) => item.nome !== "")
      : [];
  const colunasCriadas = new Set(conteudo.colunasCriadas ?? []);
  const candidatosRemocaoColunas: ColunaCriada[] = (conteudo.colunasCriadas ?? []).map((coluna) => {
    const encontrada = esquema.colunas.find((item) => item.indice === coluna);
    return {
      coluna,
      letra: letraColuna(coluna),
      rotulo: encontrada?.rotulo ?? letraColuna(coluna),
      ...(encontrada?.data ? { data: encontrada.data } : {}),
    };
  });
  const removerColunas =
    modoCompleto && opcoes.removerColunas
      ? opcoes.removerColunas
          .filter((coluna) => colunasCriadas.has(coluna))
          .map((coluna) => {
            const encontrada = esquema.colunas.find((item) => item.indice === coluna);
            return {
              coluna,
              letra: letraColuna(coluna),
              rotulo: encontrada?.rotulo ?? letraColuna(coluna),
              ...(encontrada?.data ? { data: encontrada.data } : {}),
            };
          })
      : [];

  // Linhas criadas pela integração para alunos que não estão mais na turma
  // ativa: candidatas à remoção, sempre listadas e desmarcadas por padrão.
  const nomesDaTurma = new Set(turma.linhas.map((linha) => normalizar(linha.nome)));
  const colunaAlunoIndice = esquema.colunas.find((coluna) => coluna.tipo === "aluno")?.indice ?? 1;
  const candidatosRemocaoLinhas: RemocaoPlano[] = [];
  for (const linha of conteudo.linhasCriadas ?? []) {
    const relativa = linha - conteudo.linhaInicial;
    const bruto = conteudo.valores[relativa]?.[colunaAlunoIndice - conteudo.colunaInicial] ?? "";
    const nome = textoLimpo(bruto);
    if (nome !== "" && !nomesDaTurma.has(normalizar(nome))) {
      candidatosRemocaoLinhas.push({ linha, nome });
    }
  }

  const resumo: ResumoPlano = {
    preencher: celulasPreencher.length,
    substituir: celulasSubstituir.length,
    limpar: celulasLimpar.length,
    novasColunas: novasColunas.length,
    novosAlunos: novosAlunos.length,
    removerLinhas: removerLinhas.length,
    removerColunas: removerColunas.length,
    puladasFormula,
    puladasOcupadas,
    ambiguidades,
  };
  const plano: Omit<PlanoSincronizacao, "planoHash"> = {
    turmaOriginalId: turma.turmaOriginalId,
    rotulo: turma.rotulo,
    aba: esquema.nome,
    assinatura: esquema.assinatura,
    preencher: celulasPreencher,
    substituir: celulasSubstituir,
    limpar: celulasLimpar,
    novasColunas,
    novosAlunos,
    removerLinhas,
    removerColunas,
    candidatosRemocaoLinhas,
    candidatosRemocaoColunas,
    resumo,
    avisos,
  };
  return { ...plano, planoHash: hashTexto(JSON.stringify(plano)) };
}
