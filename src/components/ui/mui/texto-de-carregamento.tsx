// Mantém a descrição da espera para leitores de tela, sem ocupá-la no layout.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";

export const ESTILO_TEXTO_OCULTO = {
  position: "absolute",
  width: "1px",
  height: "1px",
  p: 0,
  m: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export function IndicadorDeCarregamento({ texto }: { texto: string }) {
  return (
    <Box role="status" sx={{ py: 0.75 }}>
      <LinearProgress aria-hidden="true" sx={{ width: 80, maxWidth: "100%" }} />
      <TextoDeCarregamento>{texto}</TextoDeCarregamento>
    </Box>
  );
}

export function TextoDeCarregamento({
  children,
  anunciar,
}: {
  children: ReactNode;
  anunciar?: boolean;
}) {
  return (
    <Box component="span" role={anunciar ? "status" : undefined} sx={ESTILO_TEXTO_OCULTO}>
      {children}
    </Box>
  );
}
