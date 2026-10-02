// Pausas compartilhadas entre leituras de uma organização, sem repetir escritas.
import { AsyncLocalStorage } from "node:async_hooks";

type ContextoLeituras = { pausas: number; aguardando?: Promise<void> };
const contexto = new AsyncLocalStorage<ContextoLeituras>();
const MINUTO = 60_000;
const MAXIMO_PAUSAS = 2;

/** Cada aba tem seu orçamento; requisições simultâneas compartilham a pausa. */
export function comPausasDeLeituraGoogle<T>(acao: () => Promise<T>): Promise<T> {
  return contexto.run({ pausas: 0 }, acao);
}

/** Respeita Retry-After em segundos ou data; sem indicação, aguarda um minuto. */
function esperaDaResposta(resposta: Response): number {
  const indicado = resposta.headers.get("Retry-After");
  if (!indicado) return MINUTO;
  const segundos = Number(indicado);
  const espera = Number.isFinite(segundos) ? segundos * 1_000 : Date.parse(indicado) - Date.now();
  return Number.isFinite(espera) && espera >= 0 ? Math.max(1_000, espera) : MINUTO;
}

/** Só HTTP 429 de leitura permite espera; outros erros seguem para conferência. */
export async function aguardarLimiteDeLeituraGoogle(resposta: Response): Promise<boolean> {
  const atual = contexto.getStore();
  if (resposta.status !== 429 || !atual) return false;
  if (atual.aguardando) {
    await resposta.body?.cancel();
    await atual.aguardando;
    return true;
  }
  const espera = esperaDaResposta(resposta);
  if (atual.pausas >= MAXIMO_PAUSAS || espera > MINUTO) return false;
  // Reserva antes de iniciar a espera para unir recusas das leituras paralelas.
  atual.pausas += 1;
  atual.aguardando = new Promise<void>((resolver) => setTimeout(resolver, espera)).finally(() => {
    atual.aguardando = undefined;
  });
  await resposta.body?.cancel();
  await atual.aguardando;
  return true;
}
