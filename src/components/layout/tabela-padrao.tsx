"use client";

// Tabela padrão com contêiner de superfície, legenda, primeira coluna fixa
// opcional e números alinhados à direita.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";

interface TabelaPadraoProps {
  caption?: string;
  children: ReactNode;
  primeiraColunaFixa?: boolean;
}

export function TabelaPadrao({ caption, children, primeiraColunaFixa = false }: TabelaPadraoProps) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{ width: "100%", overflowX: "auto", boxShadow: "none" }}
    >
      <Table
        aria-label={caption ? undefined : "Tabela de dados"}
        sx={(tema) => ({
          "& .MuiTableCell-root.MuiTableCell-alignRight, & .MuiTableCell-root[data-numero='true']":
            {
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            },
          ...(primeiraColunaFixa
            ? {
                "& .MuiTableCell-root:first-of-type": {
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  backgroundColor: tema.vars.palette.background.paper,
                },
                "& .MuiTableHead .MuiTableCell-root:first-of-type": {
                  zIndex: 3,
                },
              }
            : {}),
        })}
      >
        {caption ? (
          <Box
            component="caption"
            sx={{ captionSide: "bottom", p: 2, color: "text.secondary", typography: "body2" }}
          >
            {caption}
          </Box>
        ) : null}
        {children}
      </Table>
    </TableContainer>
  );
}
