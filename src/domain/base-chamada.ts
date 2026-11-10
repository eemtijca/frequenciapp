// Seleciona a base imutável por criação; alterações de colegas não mudam a
// precedência e o identificador desempata chamadas criadas no mesmo instante.

/** Forma mínima de uma chamada para comparar a precedência da base. */
export interface BaseChamada {
  id: string;
  criadoEm: Date;
}

/** Regra de ordenação estrutural aceita pelas consultas Prisma. */
export type OrdemBaseChamada = { criadoEm?: "desc"; id?: "asc" };

/** Ordem estável compartilhada por todas as consultas de lista histórica. */
export const ORDEM_BASE_CHAMADA: OrdemBaseChamada[] = [{ criadoEm: "desc" }, { id: "asc" }];

/** Compara duas chamadas: a mais recente por criação vence, o id desempata. */
export function compararBases(a: BaseChamada, b: BaseChamada): number {
  const instante = b.criadoEm.getTime() - a.criadoEm.getTime();
  return instante || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Escolhe a primeira base na ordem estável, sem alterar a lista recebida. */
export function escolherBase<T extends BaseChamada>(chamadas: readonly T[]): T | undefined {
  return chamadas.slice().sort(compararBases)[0];
}
