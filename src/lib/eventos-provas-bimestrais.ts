// Aviso entre telas: a Gestão altera o horário de provas e a aba Horários, que fica montada, relê as provas.
const EVENTO = "provas-bimestrais-mudaram";

/** Anuncia que o horário de provas mudou. */
export function avisarProvasBimestraisMudaram(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Escuta mudanças no horário de provas; devolve a função que encerra a escuta. */
export function ouvirProvasBimestraisMudaram(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}
