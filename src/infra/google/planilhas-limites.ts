// Pausas e fila das leituras do Google: uma de cada vez, com espera
// exponencial, jitter e Retry-After, sem repetir escritas.
import { AsyncLocalStorage } from "node:async_hooks";

type ContextoLeituras = { pausas: number; aguardando?: Promise<void> };
const contexto = new AsyncLocalStorage<ContextoLeituras>();
const MINUTO = 60_000;
const MAXIMO_PAUSAS = 5;
const TETO_PADRAO_LEITURAS_POR_MINUTO = 45;

/** Teto local por minuto; o CI eleva o valor porque o dublê não aplica cota. */
function tetoDeLeiturasPorMinuto(): number {
  const configurado = Number(process.env.GOOGLE_LEITURAS_POR_MINUTO);
  return Number.isInteger(configurado) && configurado > 0
    ? configurado
    : TETO_PADRAO_LEITURAS_POR_MINUTO;
}

const TETO_LEITURAS_POR_MINUTO = tetoDeLeiturasPorMinuto();
const instantesDeLeitura: number[] = [];
let filaDeLeitura: Promise<void> = Promise.resolve();

/** Cada operação tem seu orçamento; requisições simultâneas compartilham a pausa. */
export function comPausasDeLeituraGoogle<T>(acao: () => Promise<T>): Promise<T> {
  if (contexto.getStore()) return acao();
  return contexto.run({ pausas: 0 }, acao);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Espera antes de repetir uma leitura recusada. Sem Retry-After, a espera
 * dobra a cada pausa e ganha uma folga aleatória. Acima de um minuto, ou
 * esgotadas as pausas, a leitura não espera.
 */
export function esperaDoLimite(
  pausasJaFeitas: number,
  retryAfterMs: number | "ausente",
  aleatorio = 0,
): number | null {
  if (pausasJaFeitas >= MAXIMO_PAUSAS) return null;
  if (retryAfterMs !== "ausente") {
    if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) return MINUTO;
    if (retryAfterMs > MINUTO) return null;
    return Math.max(1_000, Math.floor(retryAfterMs));
  }
  const base = Math.min(32_000, 2_000 * 2 ** pausasJaFeitas);
  const folgaMaxima = Math.min(1_000, Math.floor(base / 4));
  const fracao = Math.min(1, Math.max(0, aleatorio));
  return base + Math.floor(fracao * folgaMaxima);
}

function prazoDoCabecalho(resposta: Response): number | "ausente" {
  const indicado = resposta.headers.get("Retry-After");
  if (indicado === null) return "ausente";
  const segundos = Number(indicado);
  if (Number.isFinite(segundos)) return segundos * 1_000;
  const instante = Date.parse(indicado);
  if (Number.isFinite(instante)) return instante - Date.now();
  return MINUTO;
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
  const espera = esperaDoLimite(atual.pausas, prazoDoCabecalho(resposta), Math.random());
  if (espera === null) return false;
  atual.pausas += 1;
  atual.aguardando = dormir(espera).finally(() => {
    atual.aguardando = undefined;
  });
  await resposta.body?.cancel();
  await atual.aguardando;
  return true;
}

async function aguardarJanela(): Promise<void> {
  const agora = Date.now();
  while (instantesDeLeitura.length > 0 && (instantesDeLeitura[0] ?? 0) <= agora - MINUTO) {
    instantesDeLeitura.shift();
  }
  // A espera vale para envio, prévia e organização. Fora desse contexto a
  // leitura segue na fila, sem segurar as demais operações do processo.
  if (contexto.getStore() && instantesDeLeitura.length >= TETO_LEITURAS_POR_MINUTO) {
    const maisAntigo = instantesDeLeitura[0];
    if (maisAntigo !== undefined) {
      const espera = maisAntigo + MINUTO - Date.now() + 50;
      if (espera > 0) await dormir(espera);
    }
    return aguardarJanela();
  }
  instantesDeLeitura.push(Date.now());
}

/** Serializa as leituras do processo e segura o ritmo abaixo da cota por minuto. */
export function emFilaDeLeituraGoogle<T>(acao: () => Promise<T>): Promise<T> {
  const vez = filaDeLeitura.then(async () => {
    await aguardarJanela();
    return acao();
  });
  filaDeLeitura = vez.then(
    () => undefined,
    () => undefined,
  );
  return vez;
}

/** Limpa o orçamento em memória. Uso exclusivo dos testes. */
export function reiniciarOrcamentoDeLeituraGoogle(): void {
  instantesDeLeitura.length = 0;
  filaDeLeitura = Promise.resolve();
}

export function ehLimiteGoogle(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : "";
  return mensagem.includes("limitou as leituras") || mensagem.includes("limitou o envio");
}
