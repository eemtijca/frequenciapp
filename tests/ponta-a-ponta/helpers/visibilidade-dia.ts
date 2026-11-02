export type MedidaTexto = {
  texto: string;
  alfaTexto: number | null;
  estilos: { display: string; visibility: string; opacity: number }[];
  caixas: { largura: number; altura: number; corte: number }[];
};

// Cada trecho é um nó de texto medido, não apenas textContent do invólucro.
// A checagem não mede contraste nem detecta sobreposição por outros elementos.
export function varianteDoDiaLegivel(trechos: MedidaTexto[], esperado: string): boolean {
  return (
    esperado.trim().length > 0 &&
    trechos.length > 0 &&
    trechos
      .map((trecho) => trecho.texto)
      .join("")
      .trim() === esperado &&
    trechos.every(
      ({ estilos, caixas, alfaTexto }) =>
        estilos.length > 0 &&
        estilos.every(
          (css) =>
            css.display !== "none" &&
            css.visibility === "visible" &&
            Number.isFinite(css.opacity) &&
            css.opacity >= 0 &&
            css.opacity <= 1,
        ) &&
        alfaTexto !== null &&
        Number.isFinite(alfaTexto) &&
        alfaTexto >= 0 &&
        alfaTexto <= 1 &&
        // Limiar conservador de opacidade, não uma medição de contraste WCAG.
        estilos.reduce((opacidade, css) => opacidade * css.opacity, alfaTexto) >= 0.95 &&
        caixas.length > 0 &&
        caixas.every(
          (caixa) =>
            caixa.largura > 0 &&
            caixa.altura > 0 &&
            Number.isFinite(caixa.corte) &&
            caixa.corte <= 0.5,
        ),
    )
  );
}
