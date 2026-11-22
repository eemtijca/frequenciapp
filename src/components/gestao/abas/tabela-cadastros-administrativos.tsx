// Apresenta a mesma lista de cadastros em colunas ou em registros empilhados.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  caption: string;
  identidade: string;
  children: ReactNode;
}

export function TabelaCadastrosAdministrativos({ caption, identidade, children }: Props) {
  return (
    <Box
      sx={{
        minWidth: 0,
        containerType: "inline-size",
        "& tbody th": { overflowWrap: "anywhere" },
        [`@container (width < ${TOKENS_LAYOUT.breakpoints.sm}px)`]: {
          "& table": { tableLayout: "fixed" },
          "& table > caption, & table > thead": {
            position: "absolute",
            width: "1px",
            height: "1px",
            p: 0,
            overflow: "hidden",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
          },
          "& table > tbody, & tbody > tr, & tbody > tr > *": { display: "block" },
          // A altura do tema é para linhas de tabela, não para registros empilhados.
          "& table > tbody > tr.MuiTableRow-root": { height: "auto" },
          "& tbody > tr:not(:last-child)": { borderBottom: 1, borderColor: "divider" },
          "& tbody > tr > th": { pb: 0, border: 0 },
          "& tbody > tr > td": { pt: 0.5, pb: 1, border: 0 },
        },
      }}
    >
      <TabelaPadrao caption={caption}>
        <TableHead role="rowgroup">
          <TableRow role="row">
            <TableCell role="columnheader" scope="col">
              {identidade}
            </TableCell>
            <TableCell role="columnheader" scope="col" align="right">
              Ações
            </TableCell>
          </TableRow>
        </TableHead>
        {children}
      </TabelaPadrao>
    </Box>
  );
}
