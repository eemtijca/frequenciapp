"use client";

// Grade responsiva de cartões com 4, 8 e 12 colunas e espaçamento de 16 ou 24.
import { Children, type ReactNode } from "react";
import Grid from "@mui/material/Grid";

export const COLUNAS_GRADE = { xs: 4, sm: 8, md: 12 } as const;

export const TAMANHO_CARTAO = { xs: 4, sm: 4, md: 4, lg: 3 } as const;

export type EspacamentoGrade = 2 | 3;

interface GradeCartoesProps {
  children: ReactNode;
  spacing?: EspacamentoGrade;
}

export function GradeCartoes({ children, spacing = 2 }: GradeCartoesProps) {
  return (
    <Grid container spacing={spacing} columns={COLUNAS_GRADE}>
      {Children.map(children, (filho) => (
        <Grid size={TAMANHO_CARTAO}>{filho}</Grid>
      ))}
    </Grid>
  );
}
