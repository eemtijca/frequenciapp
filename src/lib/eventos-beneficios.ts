// Aviso entre telas: a Gestão altera as regras de frequência dos benefícios e a Chamada, que fica montada, relê os alertas.
const EVENTO = "beneficios-frequencia-mudaram";

/** Anuncia que a configuração dos benefícios mudou. */
export function avisarBeneficiosMudaram(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Escuta mudanças na configuração dos benefícios; devolve a função que encerra a escuta. */
export function ouvirBeneficiosMudaram(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
}
