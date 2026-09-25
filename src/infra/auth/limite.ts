// Limitador de tentativas em memória, por chave. Basta para instância única;
// várias instâncias exigem armazenamento compartilhado (docs/seguranca.md).
// O mapa tem teto e expurgo para não crescer sem limite com e-mails aleatórios.
const JANELA_MS = 15 * 60 * 1000;
const MAXIMO_TENTATIVAS = 10;
const TETO_CHAVES = 5000;

const tentativas = new Map<string, { contagem: number; expira: number }>();

/** Remove entradas vencidas e, se ainda houver excesso, as mais antigas. */
function limpar(): void {
  const agora = Date.now();
  for (const [chave, registro] of tentativas) {
    if (registro.expira < agora) tentativas.delete(chave);
  }
  if (tentativas.size <= TETO_CHAVES) return;
  for (const chave of tentativas.keys()) {
    tentativas.delete(chave);
    if (tentativas.size <= TETO_CHAVES) break;
  }
}

/** Registra uma tentativa e devolve false quando exceder o limite. */
export function limiteDeTentativas(chave: string, maximo = MAXIMO_TENTATIVAS): boolean {
  if (tentativas.size >= TETO_CHAVES) limpar();
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || registro.expira < agora) {
    tentativas.set(chave, { contagem: 1, expira: agora + JANELA_MS });
    return true;
  }
  registro.contagem += 1;
  return registro.contagem <= maximo;
}

/** Limpa as tentativas de uma chave após sucesso. */
export function limparTentativas(chave: string): void {
  tentativas.delete(chave);
}
