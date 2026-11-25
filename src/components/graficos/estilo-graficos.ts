// Estilo e escala compartilhados sem carregar a biblioteca dos gráficos.
import type { Theme } from "@mui/material/styles";

/** Eixo percentual com teto e marcas redondas, de 10 em 10 ou de 20 em 20. */
export function escalaPercentual(maximo: number): { teto: number; marcas: number[] } {
  const passo = maximo <= 50 ? 10 : 20;
  const teto = Math.max(passo, Math.ceil(maximo / passo) * passo);
  const marcas: number[] = [];
  for (let marca = 0; marca <= teto; marca += passo) marcas.push(marca);
  return { teto, marcas };
}

/** Estilo do tooltip de gráficos sobre Recharts com os tokens do tema ativo. */
export function estiloTooltipGrafico(tema: Theme) {
  const paleta = tema.vars.palette;
  return {
    contentStyle: {
      background: paleta.background.paper,
      backgroundColor: paleta.background.paper,
      border: `1px solid ${paleta.divider}`,
      borderRadius: tema.shape.borderRadius,
      boxShadow: tema.shadows[8],
      fontFamily: tema.typography.fontFamily ?? "inherit",
      color: paleta.text.primary,
      fontSize: "0.75rem",
      opacity: 1,
    },
    wrapperStyle: { opacity: 1, zIndex: 30 },
    cursor: { fill: paleta.action.hover, opacity: 0.5 },
  };
}
