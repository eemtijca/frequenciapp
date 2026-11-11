// Supervisiona somente filhos dos testes sintéticos, com espera limitada e cleanup próprio.
export async function comPrazo(promessa, prazo = 3000) {
  let timer;
  try {
    return await Promise.race([
      promessa,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Prazo de espera esgotado.")), prazo);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function aguardarPronto(filho, prazo = 3000) {
  return new Promise((resolve, reject) => {
    const terminar = (erro, valor) => {
      clearTimeout(timer);
      filho.off("message", mensagem);
      filho.off("error", falha);
      filho.off("exit", saiu);
      if (erro) reject(erro);
      else resolve(valor);
    };
    const mensagem = (valor) => terminar(null, valor);
    const falha = (erro) => terminar(erro);
    const saiu = (codigo, sinal) =>
      terminar(new Error(`filho terminou antes da migração: ${codigo}/${sinal}`));
    const timer = setTimeout(
      () => terminar(new Error("Prazo de prontidão do filho esgotado.")),
      prazo,
    );
    filho.once("message", mensagem);
    filho.once("error", falha);
    filho.once("exit", saiu);
  });
}

export async function encerrarFilho(filho, prazo = 3000) {
  if (filho.exitCode !== null || filho.signalCode !== null) {
    return { codigo: filho.exitCode, sinal: filho.signalCode };
  }
  return await new Promise((resolve, reject) => {
    const terminar = (erro, valor) => {
      clearTimeout(timer);
      filho.off("exit", saiu);
      filho.off("error", falha);
      if (erro) reject(erro);
      else resolve(valor);
    };
    const saiu = (codigo, sinal) => terminar(null, { codigo, sinal });
    const falha = (erro) => terminar(erro);
    const timer = setTimeout(
      () => terminar(new Error("Prazo de encerramento do filho esgotado.")),
      prazo,
    );
    filho.once("exit", saiu);
    filho.once("error", falha);
    if (!filho.kill("SIGKILL")) terminar(new Error("Não foi possível encerrar o filho sintético."));
  });
}
