"use client";

// Formulário em grade de uma ou duas colunas, com ações alinhadas à direita.
import { Children, type ReactNode } from "react";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

export type ColunasFormulario = 1 | 2;

export const TAMANHO_CAMPO = {
  uma: { xs: 12 },
  duas: { xs: 12, md: 6 },
} as const;

interface FormularioPadraoProps {
  children: ReactNode;
  acoes?: ReactNode;
  colunas?: ColunasFormulario;
}

export function FormularioPadrao({ children, acoes, colunas = 2 }: FormularioPadraoProps) {
  const tamanho = TAMANHO_CAMPO[colunas === 1 ? "uma" : "duas"];

  return (
    <Grid container spacing={3}>
      {Children.map(children, (filho) => (
        <Grid size={tamanho}>{filho}</Grid>
      ))}
      {acoes ? (
        <Grid size={12}>
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}
          >
            {acoes}
          </Stack>
        </Grid>
      ) : null}
    </Grid>
  );
}
