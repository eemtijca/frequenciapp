// Aviso entre telas: a Gestão altera a ordem do almoço e a aba Horários, que fica montada, relê a ordem.
const EVENTO = "ordem-almoco-mudou";

/** Anuncia que a ordem do almoço mudou. */
export function avisarOrdemAlmocoMudou(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Escuta mudanças na ordem do almoço; devolve a função que encerra a escuta. */
export function ouvirOrdemAlmocoMudou(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}
