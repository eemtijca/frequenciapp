// Ordem das turmas no almoço por dia da semana: regras puras de validação e de leitura, compartilhadas com a interface.
import { ehHoraValida } from "@/domain/frequencia";

/** Dias com ordem de almoço: de segunda (1) a sábado (6); domingo não tem aula. */
export const DIAS_ORDEM_ALMOCO = [1, 2, 3, 4, 5, 6] as const;

/** Limite de turmas na ordem de um dia, folgado para o cadastro da escola. */
export const LIMITE_TURMAS_ORDEM_ALMOCO = 200;

/** Turma na ordem do almoço de um dia; o horário é opcional. */
export interface ItemOrdemAlmoco {
  turmaId: string;
  /** Posição a partir de 1, na ordem em que as turmas vão ao almoço. */
  posicao: number;
  /** Horário da turma no almoço, em HH:MM, ou nulo quando a escola só define a ordem. */
  inicio: string | null;
}

export interface OrdemAlmocoDoDia {
  diaSemana: number;
  itens: ItemOrdemAlmoco[];
}

export function ehDiaOrdemAlmoco(valor: number): boolean {
  return (DIAS_ORDEM_ALMOCO as readonly number[]).includes(valor);
}

/**
 * Confere a lista de um dia antes de gravar: sem turma repetida, horário em HH:MM e
 * horários na mesma ordem das turmas. Devolve a mensagem do primeiro problema ou nulo.
 */
export function problemaNaOrdemAlmoco(
  itens: readonly { turmaId: string; inicio: string | null }[],
): string | null {
  const vistas = new Set<string>();
  let anterior: string | null = null;
  for (const [indice, item] of itens.entries()) {
    if (vistas.has(item.turmaId)) return "A mesma turma aparece duas vezes na ordem.";
    vistas.add(item.turmaId);
    if (item.inicio === null) continue;
    if (!ehHoraValida(item.inicio)) return `Horário inválido na ${indice + 1}ª posição.`;
    if (anterior !== null && item.inicio < anterior) {
      return `O horário da ${indice + 1}ª posição vem antes do horário da posição anterior.`;
    }
    anterior = item.inicio;
  }
  return null;
}

/** Itens do dia em ordem, renumerados a partir de 1 (a exclusão de uma turma deixa lacunas). */
export function itensEmOrdem(itens: readonly ItemOrdemAlmoco[]): ItemOrdemAlmoco[] {
  return [...itens]
    .sort((a, b) => a.posicao - b.posicao)
    .map((item, indice) => ({ ...item, posicao: indice + 1 }));
}

/** Ordem de um dia da semana, vazia quando a escola não definiu. */
export function ordemDoDia(
  dias: readonly OrdemAlmocoDoDia[],
  diaSemana: number,
): ItemOrdemAlmoco[] {
  return itensEmOrdem(dias.find((dia) => dia.diaSemana === diaSemana)?.itens ?? []);
}
