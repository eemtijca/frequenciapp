// Executa ações independentes em ordem e preserva o primeiro erro, inclusive ao fechar.
export async function executarLimpezas(
  acoes: (() => Promise<unknown>)[],
  finalizar?: () => Promise<unknown>,
): Promise<void> {
  let falhou = false;
  let primeiroErro: unknown;
  const executar = async (acao: () => Promise<unknown>) => {
    try {
      await acao();
    } catch (erro) {
      if (!falhou) {
        falhou = true;
        primeiroErro = erro;
      }
    }
  };
  try {
    for (const acao of acoes) await executar(acao);
  } finally {
    if (finalizar) await executar(finalizar);
  }
  if (falhou) throw primeiroErro;
}
