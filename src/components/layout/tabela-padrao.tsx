"use client";

// Tabela padrão com legenda, rolagem, primeira coluna fixa opcional e números alinhados à direita.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface TabelaPadraoProps {
  caption?: string;
  children: ReactNode;
  primeiraColunaFixa?: boolean;
  compacta?: boolean;
  /** Nome da região rolável; quando definido, inclui o contêiner na navegação por Tab. */
  rotuloRolagem?: string;
}

export function TabelaPadrao({
  caption,
  children,
  primeiraColunaFixa = false,
  compacta = false,
  rotuloRolagem,
}: TabelaPadraoProps) {
  return (
    <TableContainer
      component={Paper}
      variant={compacta ? "elevation" : "outlined"}
      role={rotuloRolagem ? "region" : undefined}
      aria-label={rotuloRolagem}
      tabIndex={rotuloRolagem ? 0 : undefined}
      sx={(tema) => ({
        width: "100%",
        overflowX: "auto",
        boxShadow: "none",
        ...(rotuloRolagem && {
          "&:focus-visible": {
            outline: `${TOKENS_LAYOUT.campo.foco}px solid ${tema.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      })}
    >
      <Table
        aria-label={caption ? undefined : "Tabela de dados"}
        size={compacta ? "small" : "medium"}
        sx={(tema) => ({
          ...(compacta && {
            tableLayout: "fixed",
            "& .MuiTableCell-root": { px: 0.5, whiteSpace: "normal", overflowWrap: "anywhere" },
            "& .MuiTableCell-head": { height: "auto", typography: "caption", fontWeight: 600 },
            "& .MuiTableRow-root:last-child .MuiTableCell-body": { borderBottom: 0 },
          }),
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
            sx={{
              captionSide: "bottom",
              p: compacta ? 0.5 : 2,
              color: "text.secondary",
              typography: compacta ? "caption" : "body2",
            }}
          >
            {caption}
          </Box>
        ) : null}
        {children}
      </Table>
    </TableContainer>
  );
}
