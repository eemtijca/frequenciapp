// Leitura das relações de turma em texto ("RELAÇÃO ATUAL" com a turma atual e,
// por aluno, a turma original) e o casamento com o cadastro. Regras puras.
import { normalizar } from "@/domain/frequencia";

/** Aluno lido de uma relação, na posição em que aparece. */
export interface AlunoDaRelacao {
  nome: string;
  origem: string;
  posicao: number;
  linha: number;
}

/** Uma relação: a turma atual, o total declarado no cabeçalho e os alunos. */
export interface Relacao {
  turma: string;
  totalDeclarado: number | null;
  alunos: AlunoDaRelacao[];
}

export interface LeituraDasRelacoes {
  relacoes: Relacao[];
  erros: string[];
}

// Travessão, meia-risca ou hífen separam os campos das linhas.
const SEPARADOR = "\\s*[\\u2014\\u2013-]\\s*";
const CABECALHO = new RegExp(`^rela[cç][aã]o atual${SEPARADOR}(.+)$`, "i");
const LINHA_ALUNO = new RegExp(`^(.+?)${SEPARADOR}turma original:\\s*(.+)$`, "i");
const TOTAL = /^total de (?:estudantes|alunos):\s*(\d+)/i;

/** Nome como chave de comparação: sem acento, sem caixa e com espaços simples. */
export function chaveDeNome(nome: string): string {
  return normalizar(nome).replace(/\s+/g, " ");
}

/**
 * Rótulo de turma como chave: "3º A", "3º ano A" e "3ª série A" viram
 * "3o a", "3o a" e "3a a". Palavras "ano" e "série" não distinguem turmas.
 */
export function chaveDeTurma(rotulo: string): string {
  return normalizar(rotulo)
    .replace(/\b(ano|serie)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lê uma ou mais relações coladas ou vindas de arquivos. Aceita quebras de
 * linha reais ou escritas como "\n" no texto. Linhas fora do formato que não
 * sejam cabeçalho viram erro com o número da linha.
 */
export function lerRelacoes(texto: string): LeituraDasRelacoes {
  const linhas = texto.replace(/\\n/g, "\n").split(/\r?\n/);
  const relacoes: Relacao[] = [];
  const erros: string[] = [];
  let atual: Relacao | null = null;
  linhas.forEach((bruta, indice) => {
    const linha = bruta.trim();
    if (linha === "") return;
    const cabecalho = CABECALHO.exec(linha);
    if (cabecalho) {
      atual = { turma: (cabecalho[1] ?? "").trim(), totalDeclarado: null, alunos: [] };
      relacoes.push(atual);
      return;
    }
    const total = TOTAL.exec(linha);
    if (total) {
      if (atual) atual.totalDeclarado = Number(total[1]);
      return;
    }
    const aluno = LINHA_ALUNO.exec(linha);
    if (aluno) {
      if (!atual) {
        erros.push(`Linha ${indice + 1}: aluno antes do cabeçalho "RELAÇÃO ATUAL".`);
        return;
      }
      atual.alunos.push({
        nome: (aluno[1] ?? "").replace(/\s+/g, " ").trim(),
        origem: (aluno[2] ?? "").trim(),
        posicao: atual.alunos.length + 1,
        linha: indice + 1,
      });
      return;
    }
    // Linhas de identificação do documento, sem aluno, são ignoradas.
    if (!atual || atual.alunos.length === 0) return;
    erros.push(`Linha ${indice + 1}: fora do formato "NOME, Turma original: turma".`);
  });
  if (relacoes.length === 0)
    erros.push('Nenhuma relação encontrada. Falta a linha "RELAÇÃO ATUAL".');
  return { relacoes, erros };
}

/** O que muda em um aluno já cadastrado. */
export type MudancaDoAluno = "turma" | "origem" | "ordem" | "reativar";

/** Aluno do cadastro, com o necessário para o casamento. */
export interface AlunoCadastrado {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
}

/** Turma do cadastro, com o rótulo completo de exibição. */
export interface TurmaCadastrada {
  id: string;
  rotulo: string;
}

/** Plano de uma linha da relação. */
export interface ItemDoPlano {
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  /** Nulo quando o aluno é novo. */
  alunoId: string | null;
  mudancas: MudancaDoAluno[];
}

export interface PlanoDeImportacao {
  itens: ItemDoPlano[];
  /** Ativos das turmas importadas que não estão em nenhuma relação. */
  desativar: { alunoId: string; nome: string; turmaId: string }[];
  /** Impedem a aplicação: turma desconhecida, homônimo ou nome repetido. */
  bloqueios: string[];
  /** Não impedem: total do cabeçalho diferente da lista. */
  avisos: string[];
  turmas: { turmaId: string; rotulo: string; alunos: number; totalDeclarado: number | null }[];
}

/**
 * Casa as relações com o cadastro pelo nome, dentro das turmas envolvidas.
 * O id do aluno cadastrado é mantido: o histórico de faltas acompanha. A
 * ordem na chamada passa a ser a posição na relação.
 */
export function planejarImportacao(
  leitura: LeituraDasRelacoes,
  turmas: TurmaCadastrada[],
  alunos: AlunoCadastrado[],
): PlanoDeImportacao {
  const bloqueios = [...leitura.erros];
  const avisos: string[] = [];
  const porChave = new Map<string, TurmaCadastrada[]>();
  for (const turma of turmas) {
    const chave = chaveDeTurma(turma.rotulo);
    porChave.set(chave, [...(porChave.get(chave) ?? []), turma]);
  }
  const resolver = (rotulo: string): TurmaCadastrada | null => {
    const achadas = porChave.get(chaveDeTurma(rotulo)) ?? [];
    if (achadas.length === 1) return achadas[0] ?? null;
    bloqueios.push(
      achadas.length === 0
        ? `A turma "${rotulo}" não está cadastrada.`
        : `O rótulo "${rotulo}" corresponde a mais de uma turma.`,
    );
    return null;
  };

  const resumoTurmas: PlanoDeImportacao["turmas"] = [];
  const entradas: { aluno: AlunoDaRelacao; turma: TurmaCadastrada; origem: TurmaCadastrada }[] = [];
  const turmasImportadas = new Set<string>();
  for (const relacao of leitura.relacoes) {
    const turma = resolver(relacao.turma);
    if (!turma) continue;
    if (turmasImportadas.has(turma.id)) {
      bloqueios.push(`A turma ${turma.rotulo} aparece em mais de uma relação.`);
      continue;
    }
    turmasImportadas.add(turma.id);
    resumoTurmas.push({
      turmaId: turma.id,
      rotulo: turma.rotulo,
      alunos: relacao.alunos.length,
      totalDeclarado: relacao.totalDeclarado,
    });
    if (relacao.totalDeclarado !== null && relacao.totalDeclarado !== relacao.alunos.length) {
      avisos.push(
        `${turma.rotulo}: o cabeçalho diz ${relacao.totalDeclarado} e a lista tem ${relacao.alunos.length}.`,
      );
    }
    for (const aluno of relacao.alunos) {
      const origem = resolver(aluno.origem);
      if (origem) entradas.push({ aluno, turma, origem });
    }
  }

  // Casamento só com quem está nas turmas envolvidas, atual ou de origem.
  const envolvidas = new Set([
    ...turmasImportadas,
    ...entradas.map((entrada) => entrada.origem.id),
  ]);
  const candidatos = new Map<string, AlunoCadastrado[]>();
  for (const aluno of alunos) {
    if (!envolvidas.has(aluno.turmaId) && !envolvidas.has(aluno.turmaOriginalId)) continue;
    const chave = chaveDeNome(aluno.nome);
    candidatos.set(chave, [...(candidatos.get(chave) ?? []), aluno]);
  }
  const vistos = new Map<string, number>();
  for (const entrada of entradas) {
    const chave = chaveDeNome(entrada.aluno.nome);
    vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
  }

  const itens: ItemDoPlano[] = [];
  const usados = new Set<string>();
  for (const { aluno, turma, origem } of entradas) {
    const chave = chaveDeNome(aluno.nome);
    if ((vistos.get(chave) ?? 0) > 1) {
      bloqueios.push(`${aluno.nome} aparece mais de uma vez nas relações.`);
      continue;
    }
    const achados = candidatos.get(chave) ?? [];
    if (achados.length > 1) {
      bloqueios.push(`${aluno.nome} corresponde a mais de um aluno cadastrado.`);
      continue;
    }
    const cadastrado = achados[0];
    const mudancas: MudancaDoAluno[] = [];
    if (cadastrado) {
      usados.add(cadastrado.id);
      if (cadastrado.turmaId !== turma.id) mudancas.push("turma");
      if (cadastrado.turmaOriginalId !== origem.id) mudancas.push("origem");
      if (cadastrado.ordem !== aluno.posicao) mudancas.push("ordem");
      if (!cadastrado.ativo) mudancas.push("reativar");
    }
    itens.push({
      nome: cadastrado?.nome ?? aluno.nome,
      turmaId: turma.id,
      turmaOriginalId: origem.id,
      ordem: aluno.posicao,
      alunoId: cadastrado?.id ?? null,
      mudancas,
    });
  }

  const desativar = alunos
    .filter((aluno) => aluno.ativo && turmasImportadas.has(aluno.turmaId) && !usados.has(aluno.id))
    .map((aluno) => ({ alunoId: aluno.id, nome: aluno.nome, turmaId: aluno.turmaId }));

  return { itens, desativar, bloqueios: [...new Set(bloqueios)], avisos, turmas: resumoTurmas };
}
