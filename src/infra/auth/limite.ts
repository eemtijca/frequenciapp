// Limitador de tentativas em memória, por chave. Basta para instância única;
// várias instâncias exigem armazenamento compartilhado (docs/seguranca.md).
const JANELA_MS = 15 * 60 * 1000;
const MAXIMO_TENTATIVAS = 10;

const tentativas = new Map<string, { contagem: number; expira: number }>();

/** Registra uma tentativa e devolve false quando exceder o limite. */
export function limiteDeTentativas(chave: string): boolean {
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || registro.expira < agora) {
    tentativas.set(chave, { contagem: 1, expira: agora + JANELA_MS });
    return true;
  }
  registro.contagem += 1;
  if (registro.contagem > MAXIMO_TENTATIVAS) return false;
  return true;
}

/** Limpa as tentativas de uma chave após sucesso. */
export function limparTentativas(chave: string): void {
  tentativas.delete(chave);
}
