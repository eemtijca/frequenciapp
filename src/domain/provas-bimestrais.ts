// Horário temporário das provas bimestrais por turma e data: regras puras compartilhadas com a interface.
import { diaDaSemanaIso, ehDiaValido, ehHoraValida } from "@/domain/frequencia";

/** Limite do nome da disciplina, igual à coluna do banco. */
export const LIMITE_DISCIPLINA_PROVA = 80;

/** Turmas de uma vez em um cadastro, folgado para uma série inteira ou para a escola. */
export const LIMITE_TURMAS_PROVA = 60;

export interface ProvaBimestral {
  id: string;
  turmaId: string;
  /** Data civil YYYY-MM-DD. */
  dia: string;
  inicio: string;
  fim: string;
  disciplina: string;
}

export interface DadosDaProva {
  dia: string;
  inicio: string;
  fim: string;
  disciplina: string;
}

/**
 * Confere uma prova antes de gravar: data real de hoje em diante e fora do domingo,
 * horários válidos com o fim depois do início e disciplina preenchida. Devolve a
 * mensagem do primeiro problema ou nulo.
 */
export function problemaNaProva(prova: DadosDaProva, hoje: string): string | null {
  if (!ehDiaValido(prova.dia)) return "Data da prova inválida.";
  if (prova.dia < hoje) return "A data da prova já passou.";
  if (diaDaSemanaIso(prova.dia) === 7) return "Domingo não tem aula.";
  if (!ehHoraValida(prova.inicio)) return "Horário de início inválido.";
  if (!ehHoraValida(prova.fim)) return "Horário de fim inválido.";
  if (prova.inicio >= prova.fim) return "O horário de fim deve ser posterior ao de início.";
  const disciplina = prova.disciplina.trim();
  if (!disciplina) return "Informe a disciplina da prova.";
  if (disciplina.length > LIMITE_DISCIPLINA_PROVA)
    return `A disciplina deve ter no máximo ${LIMITE_DISCIPLINA_PROVA} caracteres.`;
  return null;
}

/** Duas janelas do mesmo dia se sobrepõem quando uma começa antes de a outra terminar. */
export function janelasSeSobrepoem(
  a: { inicio: string; fim: string },
  b: { inicio: string; fim: string },
): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** Provas da turma de hoje em diante, em ordem de data e de início. */
export function proximasProvasDaTurma(
  provas: readonly ProvaBimestral[],
  turmaId: string | undefined,
  hoje: string,
): ProvaBimestral[] {
  return provas
    .filter((prova) => prova.turmaId === turmaId && prova.dia >= hoje)
    .sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        a.inicio.localeCompare(b.inicio) ||
        a.disciplina.localeCompare(b.disciplina, "pt-BR"),
    );
}

/** Agrupa provas já ordenadas por data, para o cartão de cada dia. */
export function provasPorDia(
  provas: readonly ProvaBimestral[],
): { dia: string; provas: ProvaBimestral[] }[] {
  const grupos: { dia: string; provas: ProvaBimestral[] }[] = [];
  for (const prova of provas) {
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === prova.dia) ultimo.provas.push(prova);
    else grupos.push({ dia: prova.dia, provas: [prova] });
  }
  return grupos;
}
