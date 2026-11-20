// Tipografia do tema: Inter carregada pelo next/font, tamanhos do template
// e a utilidade de numerais tabulares para tabelas e indicadores.
import type { CSSProperties } from "react";
import type { TypographyVariantsOptions } from "@mui/material/styles";

export const FAMILIA_INTER = "var(--font-inter), Inter, sans-serif";

export const tipografia: TypographyVariantsOptions = {
  fontFamily: FAMILIA_INTER,
  htmlFontSize: 16,
  fontSize: 14,
  fontWeightLight: 300,
  fontWeightRegular: 400,
  fontWeightMedium: 500,
  fontWeightBold: 700,
  h1: {
    fontSize: "3rem",
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: "-0.5px",
  },
  h2: {
    fontSize: "2.25rem",
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: "-0.25px",
  },
  h3: {
    fontSize: "1.875rem",
    fontWeight: 400,
    lineHeight: 1.2,
  },
  h4: {
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  h5: {
    fontSize: "1.25rem",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  h6: {
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: 1.4,
  },
  subtitle1: {
    fontSize: "1.125rem",
    lineHeight: 1.5,
    letterSpacing: "0.15px",
  },
  subtitle2: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.57,
    letterSpacing: "0.1px",
  },
  body1: {
    fontSize: "0.875rem",
    lineHeight: 1.5,
    letterSpacing: "0.15px",
  },
  body2: {
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: "0.15px",
  },
  button: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: "0.1px",
    textTransform: "none",
  },
  caption: {
    fontSize: "0.75rem",
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: "0.4px",
  },
  overline: {
    fontSize: "0.75rem",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
};

/** Numeração tabular para colunas de valores, datas e contadores. */
export const numeraisTabulares: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};
