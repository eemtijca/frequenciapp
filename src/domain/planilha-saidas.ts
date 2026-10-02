// Planilha de saídas: esquema da aba única de registro, detecção de colunas
// por rótulo e plano conservador de acrescentar, corrigir e remover linhas.
// Regras puras, compartilhadas pelo servidor, pela interface e pelos testes.
import {
  assinarAba,
  colunasDoIntervalo,
  dataDoRotulo,
  hashTexto,
  letraColuna,
  type AbaBruta,
  type LeituraAba,
} from "@/domain/planilha";
import { normalizar, rotuloData } from "@/domain/frequencia";

/** Colunas reconhecidas no cabeçalho da aba de saídas. */
export type AtributoSaida =
  "data" | "aluno" | "turma" | "momento" | "justificativa" | "observacao" | "liberadoPor";

const ROTULOS_ATRIBUTO: { atributo: AtributoSaida; rotulos: string[] }[] = [
  { atributo: "data", rotulos: ["data", "dia"] },
  { atributo: "aluno", rotulos: ["aluno", "aluna", "nome", "estudante", "nome do aluno"] },
  { atributo: "turma", rotulos: ["turma", "turma atual", "classe"] },
  {
    atributo: "momento",
    rotulos: ["momento", "horario", "aula", "momento da saida"],
  },
  {
    atributo: "justificativa",
    rotulos: ["justificativa", "motivo", "justificativa da saida"],
  },
  {
    atributo: "observacao",
    rotulos: ["observacao", "texto", "detalhe", "comentario", "descricao"],
  },
  {
    atributo: "liberadoPor",
    rotulos: ["liberado por", "responsavel", "liberado", "responsavel pela liberacao"],
  },
];

export interface ColunaSaida {
  indice: number;
  letra: string;
  rotulo: string;
  formula?: boolean;
  /** Ausente em coluna de texto que a integração apenas preserva. */
  atributo?: AtributoSaida;
}

export interface AbaSaidaEsquema {
  nome: string;
  oculta: boolean;
  criada?: boolean;
  bloqueio?: string;
  totalLinhas: number;
  totalColunas: number;
  cabecalho: number;
  colunas: ColunaSaida[];
  ultimaLinhaDados: number;
  ultimaColunaDados: number;
  mesclagens: string[];
  assinatura: string;
}

/** Cabeçalho padrão da aba de saídas, usado ao criar a aba pelo aplicativo. */
export const CABECALHO_SAIDAS = [
  "Data",
  "Aluno",
  "Turma",
  "Momento",
  "Justificativa",
  "Observação",
  "Liberado por",
];

/** Saída pronta para a planilha, com rótulos já resolvidos no aplicativo. */
export interface SaidaPlanilha {
  id: string;
  alunoId: string;
  nome: string;
  turma: string;
  dia: string;
  momento: string;
  justificativa: string;
  observacao: string;
  liberadoPor: string;
}

export interface CelulaSaida {
  linha: number;
  coluna: number;
  celula: string;
  valor: string;
  anterior: string;
  saidaId: string;
  alunoNome: string;
  dia: string;
  campo: AtributoSaida;
}

export interface LinhaNovaSaida {
  saidaId: string;
  nome: string;
  dia: string;
  linha: number;
  celulas: { coluna: number; valor: string }[];
}

export interface RemocaoSaida {
  linha: number;
  nome: string;
  dia: string;
}

export interface ResumoPlanoSaidas {
  criar: number;
  preencher: number;
  substituir: number;
  remover: number;
  puladasOcupadas: number;
  puladasFormula: number;
  ambiguidades: number;
}

export interface OpcoesPlanoSaidas {
  modo: "conservador" | "completo";
  de: string;
  ate: string;
  anoReferencia: number;
  /** Linhas candidatas marcadas na prévia para remoção. */
  removerLinhas?: number[];
}

export interface PlanoSaidas {
  aba: string;
  assinatura: string;
  planoHash: string;
  criar: LinhaNovaSaida[];
  preencher: CelulaSaida[];
  substituir: CelulaSaida[];
  remover: RemocaoSaida[];
  candidatosRemocao: RemocaoSaida[];
  bloqueado?: boolean;
  resumo: ResumoPlanoSaidas;
  avisos: string[];
}

const RESUMO_ZERADO: ResumoPlanoSaidas = {
  criar: 0,
  preencher: 0,
  substituir: 0,
  remover: 0,
  puladasOcupadas: 0,
  puladasFormula: 0,
  ambiguidades: 0,
};

function textoLimpo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function rotuloNormalizado(rotulo: string): string {
  return normalizar(rotulo)
    .replace(/[.:*()]/g, "")
    .trim();
}

function atributoDoRotulo(rotulo: string): AtributoSaida | null {
  const alvo = rotuloNormalizado(rotulo);
  if (alvo === "") return null;
  for (const item of ROTULOS_ATRIBUTO) {
    if (item.rotulos.includes(alvo)) return item.atributo;
  }
  return null;
}

/**
 * Linha do cabeçalho: a que concentra mais rótulos reconhecidos entre as dez
 * primeiras, com peso maior para aluno e data.
 */
export function detectarLinhaCabecalhoSaida(valores: string[][]): number {
  let melhor = 0;
  let melhorPontuacao = -1;
  const limite = Math.min(10, valores.length);
  for (let linha = 0; linha < limite; linha += 1) {
    const celulas = valores[linha] ?? [];
    let pontuacao = 0;
    for (const celula of celulas) {
      const atributo = atributoDoRotulo(textoLimpo(celula));
      if (!atributo) continue;
      pontuacao += atributo === "aluno" || atributo === "data" ? 2 : 1;
    }
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhor = linha;
    }
  }
  return melhor + 1;
}

function detectarUltimaLinhaDados(
  valores: string[][],
  linhaCabecalho: number,
  colunas: number[],
): number {
  for (let linha = valores.length - 1; linha >= linhaCabecalho; linha -= 1) {
    const celulas = valores[linha] ?? [];
    if (colunas.some((coluna) => textoLimpo(celulas[coluna - 1]) !== "")) return linha + 1;
  }
  return linhaCabecalho;
}

function detectarUltimaColunaDados(valores: string[][], linhaCabecalho: number): number {
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

/**
 * Esquema da aba única de saídas: cabeçalho, colunas por atributo, limites e
 * assinatura. A falta de Aluno ou Data, ou mesclagem sobre coluna mapeada,
 * bloqueia a escrita.
 */
export function detectarEsquemaSaida(aba: AbaBruta): AbaSaidaEsquema {
  const valores = aba.valores;
  const linhaCabecalho = detectarLinhaCabecalhoSaida(valores);
  const cabecalho = valores[linhaCabecalho - 1] ?? [];
  const colunas: ColunaSaida[] = [];
  const usados = new Set<AtributoSaida>();
  for (let indice = 0; indice < cabecalho.length; indice += 1) {
    const numero = indice + 1;
    const rotulo = textoLimpo(cabecalho[indice]);
    const encontrado = atributoDoRotulo(rotulo);
    const atributo = encontrado && !usados.has(encontrado) ? encontrado : null;
    if (atributo) usados.add(atributo);
    colunas.push({
      indice: numero,
      letra: letraColuna(numero),
      rotulo,
      ...(atributo ? { atributo } : {}),
    });
  }
  const faltando = (["aluno", "data"] as const).filter((atributo) => !usados.has(atributo));
  const mesclagens = (aba.mesclagens ?? []).filter(
    (intervalo) => colunasDoIntervalo(intervalo).length > 1,
  );
  const mapeadas = new Set(
    colunas.filter((coluna) => coluna.atributo).map((coluna) => coluna.indice),
  );
  const mesclagemSobreMapeada = mesclagens.find((intervalo) =>
    colunasDoIntervalo(intervalo).some((indice) => mapeadas.has(indice)),
  );
  const bloqueio =
    faltando.length > 0
      ? `A aba de saídas precisa das colunas Aluno e Data. Ajuste o cabeçalho na planilha.`
      : mesclagemSobreMapeada
        ? `A mesclagem ${mesclagemSobreMapeada} cobre uma coluna de saída. Ajuste o cabeçalho na planilha.`
        : undefined;
  const colunasDeDados = colunas.filter((coluna) => coluna.atributo).map((coluna) => coluna.indice);
  const ultimaLinhaDados = detectarUltimaLinhaDados(valores, linhaCabecalho, colunasDeDados);
  const ultimaColunaDados = detectarUltimaColunaDados(valores, linhaCabecalho);
  return {
    nome: aba.nome,
    oculta: Boolean(aba.oculta),
    criada: Boolean(aba.criada),
    ...(bloqueio ? { bloqueio } : {}),
    totalLinhas: aba.linhas ?? valores.length,
    totalColunas: aba.colunas ?? Math.max(cabecalho.length, ultimaColunaDados),
    cabecalho: linhaCabecalho,
    colunas,
    ultimaLinhaDados,
    ultimaColunaDados,
    mesclagens,
    assinatura: assinarAba(aba.nome, cabecalho, mesclagens),
  };
}

function chaveSaida(nome: string, dia: string): string {
  return `${normalizar(nome)}|${dia}`;
}

/**
 * Reconhece a última linha de dados a partir da leitura atual. O esquema salvo
 * pode estar defasado depois de um envio, e a linha nova não pode ser criada
 * duas vezes.
 */
export function atualizarLimitesSaida(
  esquema: AbaSaidaEsquema,
  conteudo: LeituraAba,
): AbaSaidaEsquema {
  const colunas = esquema.colunas
    .filter((coluna) => coluna.atributo)
    .map((coluna) => coluna.indice);
  let ultima = esquema.cabecalho;
  for (let indice = conteudo.valores.length - 1; indice >= 0; indice -= 1) {
    const linha = conteudo.linhaInicial + indice;
    if (linha <= esquema.cabecalho) break;
    const celulas = conteudo.valores[indice] ?? [];
    if (colunas.some((coluna) => textoLimpo(celulas[coluna - conteudo.colunaInicial]) !== "")) {
      ultima = linha;
      break;
    }
  }
  return { ...esquema, ultimaLinhaDados: ultima };
}

interface LinhaExistenteSaida {
  linha: number;
  nome: string;
  dia: string;
}

function mapearLinhasSaida(
  esquema: AbaSaidaEsquema,
  conteudo: LeituraAba,
  anoReferencia: number,
): Map<string, LinhaExistenteSaida[]> {
  const porChave = new Map<string, LinhaExistenteSaida[]>();
  const colunaAluno = esquema.colunas.find((coluna) => coluna.atributo === "aluno")?.indice;
  const colunaData = esquema.colunas.find((coluna) => coluna.atributo === "data")?.indice;
  if (!colunaAluno || !colunaData) return porChave;
  for (let linha = esquema.cabecalho + 1; linha <= esquema.ultimaLinhaDados; linha += 1) {
    const relativa = linha - conteudo.linhaInicial;
    const nome = textoLimpo(conteudo.valores[relativa]?.[colunaAluno - conteudo.colunaInicial]);
    if (nome === "") continue;
    const brutoData = textoLimpo(conteudo.valores[relativa]?.[colunaData - conteudo.colunaInicial]);
    const dia = brutoData === "" ? null : dataDoRotulo(brutoData, anoReferencia);
    if (!dia) continue;
    const chave = chaveSaida(nome, dia);
    const lista = porChave.get(chave) ?? [];
    lista.push({ linha, nome, dia });
    porChave.set(chave, lista);
  }
  return porChave;
}

function formatarValor(atributo: AtributoSaida, saida: SaidaPlanilha): string {
  switch (atributo) {
    case "data":
      return rotuloData(saida.dia);
    case "aluno":
      return saida.nome;
    case "turma":
      return saida.turma;
    case "momento":
      return saida.momento;
    case "justificativa":
      return saida.justificativa;
    case "observacao":
      return saida.observacao;
    case "liberadoPor":
      return saida.liberadoPor;
  }
}

/**
 * Planeja o envio das saídas para a aba única. No modo conservador só célula
 * vazia entra; divergência em linha criada pela integração só é corrigida no
 * modo completo, junto com a remoção das linhas marcadas sem saída no período.
 */
export function planejarSaidas(
  esquema: AbaSaidaEsquema,
  saidas: SaidaPlanilha[],
  conteudo: LeituraAba,
  opcoes: OpcoesPlanoSaidas,
): PlanoSaidas {
  const modoCompleto = opcoes.modo === "completo";
  const colunasMapeadas = esquema.colunas.filter(
    (coluna): coluna is ColunaSaida & { atributo: AtributoSaida } => Boolean(coluna.atributo),
  );
  const vazio = (avisos: string[] = [], bloqueado = false) => {
    const plano: Omit<PlanoSaidas, "planoHash"> = {
      aba: esquema.nome,
      assinatura: esquema.assinatura,
      criar: [],
      preencher: [],
      substituir: [],
      remover: [],
      candidatosRemocao: [],
      ...(bloqueado ? { bloqueado: true } : {}),
      resumo: { ...RESUMO_ZERADO },
      avisos,
    };
    return { ...plano, planoHash: hashTexto(JSON.stringify(plano)) };
  };
  if (esquema.bloqueio || colunasMapeadas.length === 0) {
    return vazio([esquema.bloqueio ?? "A aba de saídas não tem colunas reconhecidas."], true);
  }

  const avisos: string[] = [];
  const porChave = mapearLinhasSaida(esquema, conteudo, opcoes.anoReferencia);
  const linhasCriadas = new Set(conteudo.linhasCriadas ?? []);
  const criar: LinhaNovaSaida[] = [];
  const preencher: CelulaSaida[] = [];
  const substituir: CelulaSaida[] = [];
  let puladasOcupadas = 0;
  let puladasFormula = 0;
  let ambiguidades = 0;
  let proximaLinha = Math.max(esquema.ultimaLinhaDados, esquema.cabecalho) + 1;
  const ordenadas = saidas
    .slice()
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome, "pt-BR"));

  for (const saida of ordenadas) {
    const chave = chaveSaida(saida.nome, saida.dia);
    const existentes = porChave.get(chave) ?? [];
    if (existentes.length > 1) {
      ambiguidades += 1;
      avisos.push(
        `O aluno ${saida.nome} tem mais de uma linha em ${rotuloData(saida.dia)}. Ajuste a planilha.`,
      );
      continue;
    }
    const existente = existentes[0];
    if (!existente) {
      const celulas = colunasMapeadas
        .map((coluna) => ({
          coluna: coluna.indice,
          valor: formatarValor(coluna.atributo, saida),
        }))
        .filter((item) => item.valor !== "");
      criar.push({
        saidaId: saida.id,
        nome: saida.nome,
        dia: saida.dia,
        linha: proximaLinha,
        celulas,
      });
      proximaLinha += 1;
      continue;
    }
    for (const coluna of colunasMapeadas) {
      const valor = formatarValor(coluna.atributo, saida);
      if (valor === "") continue;
      const relativaLinha = existente.linha - conteudo.linhaInicial;
      const relativaColuna = coluna.indice - conteudo.colunaInicial;
      const atual = textoLimpo(conteudo.valores[relativaLinha]?.[relativaColuna]);
      if (atual === valor) continue;
      const comFormula = Boolean(conteudo.formula[relativaLinha]?.[relativaColuna]);
      if (comFormula) {
        puladasFormula += 1;
        continue;
      }
      const base = {
        linha: existente.linha,
        coluna: coluna.indice,
        celula: `${letraColuna(coluna.indice)}${existente.linha}`,
        valor,
        anterior: atual,
        saidaId: saida.id,
        alunoNome: saida.nome,
        dia: saida.dia,
        campo: coluna.atributo,
      };
      if (atual === "") {
        preencher.push(base);
      } else if (modoCompleto && linhasCriadas.has(existente.linha)) {
        substituir.push(base);
      } else {
        puladasOcupadas += 1;
      }
    }
  }

  // Candidatos à remoção: linhas marcadas pela integração, no período enviado,
  // sem saída correspondente no aplicativo.
  const chavesAtuais = new Set(saidas.map((saida) => chaveSaida(saida.nome, saida.dia)));
  const candidatosRemocao: RemocaoSaida[] = [];
  const colunaAluno = esquema.colunas.find((coluna) => coluna.atributo === "aluno")?.indice;
  if (modoCompleto && colunaAluno) {
    for (const linha of conteudo.linhasCriadas ?? []) {
      const relativa = linha - conteudo.linhaInicial;
      const nome = textoLimpo(conteudo.valores[relativa]?.[colunaAluno - conteudo.colunaInicial]);
      if (nome === "") continue;
      const colunaData = esquema.colunas.find((coluna) => coluna.atributo === "data")?.indice;
      const brutoData =
        colunaData === undefined
          ? ""
          : textoLimpo(conteudo.valores[relativa]?.[colunaData - conteudo.colunaInicial]);
      const dia = brutoData === "" ? null : dataDoRotulo(brutoData, opcoes.anoReferencia);
      if (!dia) continue;
      if (dia < opcoes.de || dia > opcoes.ate) continue;
      if (chavesAtuais.has(chaveSaida(nome, dia))) continue;
      candidatosRemocao.push({ linha, nome, dia });
    }
  }
  const pedidas = new Set(opcoes.removerLinhas ?? []);
  const remover = candidatosRemocao.filter((item) => pedidas.has(item.linha));

  const resumo: ResumoPlanoSaidas = {
    criar: criar.length,
    preencher: preencher.length,
    substituir: substituir.length,
    remover: remover.length,
    puladasOcupadas,
    puladasFormula,
    ambiguidades,
  };
  const plano: Omit<PlanoSaidas, "planoHash"> = {
    aba: esquema.nome,
    assinatura: esquema.assinatura,
    criar,
    preencher,
    substituir,
    remover,
    candidatosRemocao,
    resumo,
    avisos,
  };
  return { ...plano, planoHash: hashTexto(JSON.stringify(plano)) };
}

/**
 * O envio automático ao registrar só acrescenta: cria linhas e preenche
 * células vazias. Plano bloqueado, substituição ou remoção ficam para o envio
 * manual com prévia.
 */
export function saidasEnviaveisSozinhas(plano: PlanoSaidas): boolean {
  return !plano.bloqueado && plano.substituir.length === 0 && plano.remover.length === 0;
}

/** Há algo a gravar no plano das saídas? */
export function saidasTemNovidade(plano: PlanoSaidas): boolean {
  return plano.criar.length + plano.preencher.length > 0;
}
