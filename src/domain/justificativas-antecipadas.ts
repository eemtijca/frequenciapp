// Contrato mínimo das justificativas propostas à primeira chamada e comparação de revisões.
export interface RevisaoJustificativaAntecipada {
  id: string;
  revisao: number;
}
export interface JustificativaAntecipada extends RevisaoJustificativaAntecipada {
  alunoId: string;
  turmaId: string;
  justificativa: string;
  observacao: string | null;
}
export function mesmasJustificativasAntecipadas(
  a: readonly RevisaoJustificativaAntecipada[],
  b: readonly RevisaoJustificativaAntecipada[],
): boolean {
  const assinatura = (itens: readonly RevisaoJustificativaAntecipada[]) =>
    JSON.stringify(itens.map((i) => `${i.id}:${i.revisao}`).sort());
  return assinatura(a) === assinatura(b);
}
