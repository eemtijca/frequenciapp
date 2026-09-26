// Interpretação de variáveis de ambiente booleanas e das regras de segurança
// que dependem delas. Puro e testável de forma isolada.
export function booleanoDeAmbiente(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined) return padrao;
  const normalizado = valor.trim().toLowerCase();
  if (normalizado === "") return padrao;
  if (["1", "true", "sim", "verdadeiro"].includes(normalizado)) return true;
  if (["0", "false", "nao", "falso"].includes(normalizado)) return false;
  return padrao;
}

/** Cookie com Secure apenas em produção e enquanto o HTTP não for liberado. */
export function cookiesSegurosDe(ehProducao: boolean, permitirHttp: boolean): boolean {
  return ehProducao && !permitirHttp;
}
