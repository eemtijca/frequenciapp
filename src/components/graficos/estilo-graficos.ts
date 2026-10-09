// Estilo e escala compartilhados sem carregar a biblioteca dos gráficos.
/** Eixo percentual com teto e marcas redondas, de 10 em 10 ou de 20 em 20. */
export function escalaPercentual(maximo: number): { teto: number; marcas: number[] } {
  const passo = maximo <= 50 ? 10 : 20;
  const teto = Math.max(passo, Math.ceil(maximo / passo) * passo);
  const marcas: number[] = [];
  for (let marca = 0; marca <= teto; marca += passo) marcas.push(marca);
  return { teto, marcas };
}

export const ESTILO_TOOLTIP = {
  contentStyle: {
    background: "var(--popover)",
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "1.125rem",
    boxShadow: "0 8px 24px #00000014, inset 0 1px 0 #ffffff14",
    fontFamily: "var(--font-sans)",
    color: "var(--popover-foreground)",
    fontSize: "0.75rem",
    opacity: 1,
  },
  wrapperStyle: { opacity: 1, zIndex: 30 },
  cursor: { fill: "var(--muted)", opacity: 0.5 },
} as const;
