"use client";

// Área de conteúdo centralizada com as larguras de leitura, gestão e exceção.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import { TOKENS_LAYOUT } from "@/theme/layout";

export type LarguraConteudo = "leitura" | "gestao" | "larga";

export const LARGURAS_CONTEUDO = {
  leitura: TOKENS_LAYOUT.largura.leitura,
  gestao: TOKENS_LAYOUT.largura.gestao,
  larga: TOKENS_LAYOUT.largura.excepcional,
} as const satisfies Record<LarguraConteudo, number>;

interface LayoutConteudoProps {
  children: ReactNode;
  largura?: LarguraConteudo;
}

export function LayoutConteudo({ children, largura = "gestao" }: LayoutConteudoProps) {
  return (
    <Box
      sx={{
        boxSizing: "border-box",
        width: "100%",
        maxWidth: LARGURAS_CONTEUDO[largura],
        mx: "auto",
        p: { xs: 2, sm: 3, lg: 4 },
      }}
    >
      {children}
    </Box>
  );
}
