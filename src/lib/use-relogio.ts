"use client";

// Relógio de minuto do cliente: permite calcular prazos sem ler o relógio
// durante o render, o que a regra react-hooks/purity reprova.
import { useSyncExternalStore } from "react";

const MINUTO_MS = 60_000;

function lerMinuto(): number {
  return Math.floor(Date.now() / MINUTO_MS);
}

function assinarMinuto(aoMudar: () => void): () => void {
  const intervalo = setInterval(aoMudar, MINUTO_MS);
  // Primeiro valor do cliente logo depois da montagem, sem esperar o minuto.
  const alarme = setTimeout(aoMudar, 0);
  return () => {
    clearInterval(intervalo);
    clearTimeout(alarme);
  };
}

/** Minuto corrente desde a época, ou nulo durante a renderização no servidor. */
export function useMinutoCorrente(): number | null {
  return useSyncExternalStore(assinarMinuto, lerMinuto, () => null);
}
