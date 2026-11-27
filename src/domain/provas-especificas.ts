// Provas específicas (Enem, vestibulares e similares): regras puras de cadastro e de frequência, compartilhadas com a interface.
import { ehDiaValido } from "@/domain/frequencia";

/** Limites iguais aos das colunas do banco. */
export const LIMITE_NOME_PROVA_ESPECIFICA = 120;
export const LIMITE_LOCAL_PROVA_ESPECIFICA = 120;

/** Alunos de uma vez em uma prova, folgado para a escola inteira. */
export const LIMITE_PARTICIPANTES_PROVA = 3000;

/** Marca de um participante: presente, ausente ou ainda sem registro. */
export type MarcaDaProva = boolean | null;

export interface ProvaEspecifica {
  id: string;
  nome: string;
  /** Local de realização; nulo quando não foi informado. */
  local: string | null;
  /** Data civil YYYY-MM-DD. */
  dia: string;
  total: number;
  presentes: number;
  ausentes: number;
}

export interface ParticipanteDaProva {
  alunoId: string;
  nome: string;
  turmaId: string;
  presente: MarcaDaProva;
}

/** Prova aberta com a lista de participantes usada pela tela de frequência. */
export interface DetalheDaProva {
  prova: ProvaEspecifica;
  participantes: ParticipanteDaProva[];
}

export interface DadosDaProvaEspecifica {
  nome: string;
  local: string | null;
  dia: string;
}

/** Remove espaços das pontas e transforma o local vazio em nulo. */
export function normalizarProvaEspecifica(dados: {
  nome: string;
  local?: string | null;
  dia: string;
}): DadosDaProvaEspecifica {
  const local = (dados.local ?? "").trim();
  return { nome: dados.nome.trim(), local: local === "" ? null : local, dia: dados.dia };
}

/**
 * Confere uma prova antes de gravar. A data pode ser passada, para registrar depois,
 * e pode cair no domingo, como o Enem. Devolve a mensagem do primeiro problema ou nulo.
 */
export function problemaNaProvaEspecifica(prova: DadosDaProvaEspecifica): string | null {
  if (!prova.nome) return "Informe o nome da prova.";
  if (prova.nome.length > LIMITE_NOME_PROVA_ESPECIFICA)
    return `O nome deve ter no máximo ${LIMITE_NOME_PROVA_ESPECIFICA} caracteres.`;
  if (prova.local !== null && prova.local.length > LIMITE_LOCAL_PROVA_ESPECIFICA)
    return `O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`;
  if (!ehDiaValido(prova.dia)) return "Data da prova inválida.";
  return null;
}

/** Contagens da frequência de uma lista de marcas. */
export function resumirMarcas(marcas: readonly MarcaDaProva[]): {
  total: number;
  presentes: number;
  ausentes: number;
  pendentes: number;
} {
  let presentes = 0;
  let ausentes = 0;
  for (const marca of marcas) {
    if (marca === true) presentes += 1;
    else if (marca === false) ausentes += 1;
  }
  return {
    total: marcas.length,
    presentes,
    ausentes,
    pendentes: marcas.length - presentes - ausentes,
  };
}

/** Atualiza a marca de um aluno e recalcula os contadores, sem tocar nos demais. */
export function comMarca(
  detalhe: DetalheDaProva,
  alunoId: string,
  marca: MarcaDaProva,
): DetalheDaProva {
  const participantes = detalhe.participantes.map((item) =>
    item.alunoId === alunoId ? { ...item, presente: marca } : item,
  );
  const contagem = resumirMarcas(participantes.map((item) => item.presente));
  return {
    prova: { ...detalhe.prova, presentes: contagem.presentes, ausentes: contagem.ausentes },
    participantes,
  };
}
