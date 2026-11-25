"use client";

// Rodapé de ações com alinhamento à direita, área segura e fixação opcional.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { TOKENS_LAYOUT } from "@/theme/layout";

export interface PainelAcoesProps {
  children: ReactNode;
  rotulo: string;
  fixo?: boolean;
  sx?: SxProps<Theme>;
}

/** Barra de ações do rodapé, presa à janela quando a tela pede salvamento fixo. */
export function PainelAcoes({ children, rotulo, fixo = false, sx }: PainelAcoesProps) {
  const espaco = `${TOKENS_LAYOUT.cartao.padding}px`;

  return (
    <Box
      component="footer"
      aria-label={rotulo}
      data-fixo={fixo ? "true" : "false"}
      sx={[
        (theme) => ({
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 2,
          width: "100%",
          paddingTop: espaco,
          paddingBottom: `calc(${espaco} + env(safe-area-inset-bottom, 0px))`,
          paddingLeft: `calc(${espaco} + env(safe-area-inset-left, 0px))`,
          paddingRight: `calc(${espaco} + env(safe-area-inset-right, 0px))`,
          backgroundColor: theme.vars.palette.background.paper,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          ...(fixo
            ? {
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: theme.zIndex.appBar,
                boxShadow: theme.shadows[8],
              }
            : {}),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
