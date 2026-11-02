// Limites em pixels CSS, conforme getBoundingClientRect.
export interface Limites {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Tolera apenas arredondamento subpixel, não uma fração arbitrária da área.
const TOLERANCIA_PX = 0.5;

export function contidoNosLimites(elemento: Limites, area: Limites): boolean {
  return (
    elemento.right > elemento.left &&
    elemento.bottom > elemento.top &&
    elemento.left >= area.left - TOLERANCIA_PX &&
    elemento.top >= area.top - TOLERANCIA_PX &&
    elemento.right <= area.right + TOLERANCIA_PX &&
    elemento.bottom <= area.bottom + TOLERANCIA_PX
  );
}
