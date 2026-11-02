/** Executa todas as etapas e relata em conjunto erros de limpeza independentes. */
export async function limparIndependentemente(etapas: (() => Promise<unknown>)[]): Promise<void> {
  const erros: unknown[] = [];
  for (const etapa of etapas) {
    try {
      await etapa();
    } catch (erro) {
      erros.push(erro);
    }
  }
  if (erros.length) throw new AggregateError(erros, "Falha na limpeza da fixture.");
}
