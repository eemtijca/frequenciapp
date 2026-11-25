"use client";

// Estrutura principal de página: coluna flexível com altura total e áreas seguras.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";

interface LayoutPaginaProps {
  children: ReactNode;
  semGaveta?: boolean;
  className?: string;
}

export function LayoutPagina({ children, semGaveta = false, className }: LayoutPaginaProps) {
  return (
    <Box
      component="main"
      className={className}
      data-sem-gaveta={semGaveta ? "true" : undefined}
      sx={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
      }}
    >
      {children}
    </Box>
  );
}
