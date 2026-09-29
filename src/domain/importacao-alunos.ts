// Relação de alunos em CSV: o schema padrão, a leitura com validação por
// linha, a exportação no mesmo formato e o casamento com o cadastro. Regras puras.
import { normalizar } from "@/domain/frequencia";

/**
 * Schema da relação de alunos. Uma linha por aluno, com cabeçalho fixo nesta
 * ordem. Separador ponto e vírgula (a vírgula também é aceita na leitura),
 * UTF-8 com ou sem BOM e aspas duplas para campos com separador ou aspas.
 */
export const COLUNAS_RELACAO = ["turma_atual", "ordem", "nome", "turma_original"] as const;
export const CABECALHO_RELACAO = COLUNAS_RELACAO.join(";");
/** Descrição curta de cada coluna, para a ajuda da interface e a documentação. */
export const AJUDA_COLUNAS_RELACAO: Record<(typeof COLUNAS_RELACAO)[number], string> = {
  turma_atual: "turma em que o aluno faz a chamada, como cadastrada (3º ano A ou 3º A)",
  ordem: "posição do aluno na chamada da turma, de 1 em diante, sem repetir",
  nome: "nome do aluno, de 2 a 100 caracteres",
  turma_original: "turma original do aluno, pela qual a frequência é consolidada",
};
const MAXIMO_LINHAS = 5000;

/** Aluno lido de uma relação, na posição em que aparece. */
export interface AlunoDaRelacao {
  nome: string;
  origem: string;
  posicao: number;
  linha: number;
}

/** Uma relação: a turma atual e os alunos, na ordem da chamada. */
export interface Relacao {
  turma: string;
  alunos: AlunoDaRelacao[];
}

export interface LeituraDasRelacoes {
  relacoes: Relacao[];
  erros: string[];
}

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

/** Campo seguro para CSV: sem fórmula e com aspas quando precisa. */
function campo(valor: string): string {
  const semFormula = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[";\r\n]/.test(semFormula) ? `"${semFormula.replace(/"/g, '""')}"` : semFormula;
}

/** Desfaz a proteção contra fórmula aplicada na exportação. */
function semProtecao(valor: string): string {
  return /^'[=+\-@]/.test(valor) ? valor.slice(1) : valor;
}

/** Registros do CSV com aspas duplas, separador dado e o número da linha de cada um. */
function registros(texto: string, separador: string): { campos: string[]; linha: number }[] {
  const saida: { campos: string[]; linha: number }[] = [];
  let campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  let linha = 1;
  let inicio = 1;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice] ?? "";
    if (entreAspas) {
      if (caractere === '"' && texto[indice + 1] === '"') {
        atual += '"';
        indice += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        if (caractere === "\n") linha += 1;
        atual += caractere;
      }
      continue;
    }
    if (caractere === '"' && atual === "") {
      entreAspas = true;
    } else if (caractere === separador) {
      campos.push(atual);
      atual = "";
    } else if (caractere === "\n" || caractere === "\r") {
      if (caractere === "\r" && texto[indice + 1] === "\n") indice += 1;
      campos.push(atual);
      saida.push({ campos, linha: inicio });
      campos = [];
      atual = "";
      linha += 1;
      inicio = linha;
    } else {
      atual += caractere;
    }
  }
  if (atual !== "" || campos.length > 0) {
    campos.push(atual);
    saida.push({ campos, linha: inicio });
  }
  return saida.filter((registro) => registro.campos.some((valor) => valor.trim() !== ""));
}

/**
 * Lê a relação em CSV pelo schema padrão. Cada linha fora do padrão vira erro
 * com o número da linha e a coluna, para a interface mostrar o que corrigir.
 */
export function lerRelacaoCsv(texto: string): LeituraDasRelacoes {
  const limpo = texto.replace(/^\uFEFF/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const separador = primeira.includes(";") ? ";" : ",";
  const todos = registros(limpo, separador);
  const [cabecalho, ...linhas] = todos;
  if (!cabecalho) return { relacoes: [], erros: ["O arquivo está vazio."] };
  const nomes = cabecalho.campos.map((valor) => valor.trim().toLowerCase());
  if (nomes.join(";") !== CABECALHO_RELACAO) {
    return {
      relacoes: [],
      erros: [
        `Linha 1: o cabeçalho precisa ser exatamente ${CABECALHO_RELACAO}. Veio ${nomes.join(";") || "vazio"}.`,
      ],
    };
  }
  if (linhas.length === 0) return { relacoes: [], erros: ["O arquivo não tem nenhum aluno."] };
  if (linhas.length > MAXIMO_LINHAS) {
    return { relacoes: [], erros: [`O arquivo tem mais de ${MAXIMO_LINHAS} alunos.`] };
  }

  const erros: string[] = [];
  const porTurma = new Map<
    string,
    { turma: string; itens: (AlunoDaRelacao & { ordem: number })[] }
  >();
  for (const { campos, linha } of linhas) {
    if (campos.length !== COLUNAS_RELACAO.length) {
      erros.push(`Linha ${linha}: esperadas 4 colunas, encontradas ${campos.length}.`);
      continue;
    }
    const [turma = "", ordemTexto = "", nomeBruto = "", origem = ""] = campos.map((valor) =>
      semProtecao(valor.trim()),
    );
    const nome = nomeBruto.replace(/\s+/g, " ");
    const ordem = Number(ordemTexto);
    const problemas: string[] = [];
    if (turma === "") problemas.push("turma_atual vazia");
    if (!/^\d{1,4}$/.test(ordemTexto.trim()) || ordem < 1) {
      problemas.push("ordem precisa ser um número inteiro de 1 a 9999");
    }
    if (nome.length < 2 || nome.length > 100)
      problemas.push("nome precisa ter de 2 a 100 caracteres");
    if (origem === "") problemas.push("turma_original vazia");
    if (problemas.length > 0) {
      erros.push(`Linha ${linha}: ${problemas.join("; ")}.`);
      continue;
    }
    const chave = chaveDeTurma(turma);
    const grupo = porTurma.get(chave) ?? { turma, itens: [] };
    if (grupo.itens.some((item) => item.ordem === ordem)) {
      erros.push(`Linha ${linha}: a ordem ${ordem} já foi usada na turma ${grupo.turma}.`);
      continue;
    }
    grupo.itens.push({ nome, origem, posicao: 0, linha, ordem });
    porTurma.set(chave, grupo);
  }

  const relacoes: Relacao[] = [...porTurma.values()].map((grupo) => ({
    turma: grupo.turma,
    alunos: grupo.itens
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ nome, origem, linha }, indice) => ({ nome, origem, linha, posicao: indice + 1 })),
  }));
  return { relacoes, erros };
}

/** Linha da relação exportada: turmas pelo rótulo completo de exibição. */
export interface LinhaDaRelacao {
  turmaAtual: string;
  ordem: number;
  nome: string;
  turmaOriginal: string;
}

/**
 * Relação no mesmo schema da importação, com BOM e CRLF para o Excel pt-BR.
 * A ordem é renumerada de 1 em diante por turma: reimportar o arquivo não
 * muda nada.
 */
export function relacaoParaCsv(linhas: LinhaDaRelacao[]): string {
  const contagem = new Map<string, number>();
  const corpo = linhas.map((linha) => {
    const ordem = (contagem.get(linha.turmaAtual) ?? 0) + 1;
    contagem.set(linha.turmaAtual, ordem);
    return [linha.turmaAtual, String(ordem), linha.nome, linha.turmaOriginal].map(campo).join(";");
  });
  return `\uFEFF${[CABECALHO_RELACAO, ...corpo].join("\r\n")}\r\n`;
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
  desistenteEm?: Date | null;
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
  /** Não impedem a aplicação, mas pedem conferência. */
  avisos: string[];
  turmas: { turmaId: string; rotulo: string; alunos: number }[];
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
    resumoTurmas.push({ turmaId: turma.id, rotulo: turma.rotulo, alunos: relacao.alunos.length });
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
      bloqueios.push(`${aluno.nome} aparece mais de uma vez no arquivo.`);
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
    .filter(
      (aluno) =>
        aluno.ativo &&
        !aluno.desistenteEm &&
        turmasImportadas.has(aluno.turmaId) &&
        !usados.has(aluno.id),
    )
    .map((aluno) => ({ alunoId: aluno.id, nome: aluno.nome, turmaId: aluno.turmaId }));

  return { itens, desativar, bloqueios: [...new Set(bloqueios)], avisos, turmas: resumoTurmas };
}
