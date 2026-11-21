"use client";

// Grade responsiva de cartões com 4, 8 e 12 colunas e espaçamento de 16 ou 24.
import { Children, Fragment, type ReactNode } from "react";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";

export const COLUNAS_GRADE = { xs: 4, sm: 8, md: 12 } as const;

export const TAMANHO_CARTAO = { xs: 4, sm: 4, md: 4, lg: 3 } as const;

export type EspacamentoGrade = 2 | 3;

interface GradeCartoesProps {
  children: ReactNode;
  spacing?: EspacamentoGrade;
  dupla?: boolean;
}

export function GradeCartoes({ children, spacing = 2, dupla = false }: GradeCartoesProps) {
  return (
    <Grid container spacing={spacing} columns={COLUNAS_GRADE}>
      {Children.map(children, (filho, indice) => (
        <Fragment>
          {dupla && indice === 1 && (
            <Divider
              aria-hidden="true"
              sx={{
                alignSelf: "stretch",
                width: { xs: "100%", md: "1px" },
                borderBottomWidth: { xs: 1, md: 0 },
                borderInlineStartWidth: { xs: 0, md: 1 },
              }}
            />
          )}
          <Grid size={dupla ? { xs: 4, sm: 8, md: "grow" } : TAMANHO_CARTAO}>{filho}</Grid>
        </Fragment>
      ))}
    </Grid>
  );
}
