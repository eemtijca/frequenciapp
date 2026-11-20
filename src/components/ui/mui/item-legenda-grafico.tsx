// Item de legenda de gráfico com ponto de cor, nome, detalhe e valores.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

export interface ItemLegendaGraficoProps {
  /** Cor da série, aceitando token CSS ou cor literal. */
  cor: string;
  nome: string;
  detalhe?: ReactNode;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

/** Linha de legenda com marcador de cor, nome e detalhe, seguida pelos valores. */
export function ItemLegendaGrafico({ cor, nome, detalhe, children, sx }: ItemLegendaGraficoProps) {
  return (
    <Stack
      component="li"
      direction="row"
      spacing={1}
      useFlexGap
      sx={[
        (theme) => ({
          alignItems: "center",
          minWidth: 0,
          padding: 1,
          borderRadius: `${theme.shape.borderRadius}px`,
          backgroundColor: theme.vars.palette.action.hover,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          width: 10,
          height: 10,
          flexShrink: 0,
          borderRadius: "50%",
          backgroundColor: cor,
        }}
      />
      <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          component="span"
          variant="body2"
          sx={{ display: "block", overflowWrap: "anywhere" }}
        >
          {nome}
        </Typography>
        {detalhe ? (
          <Typography
            component="span"
            variant="caption"
            sx={{ display: "block", color: "text.secondary" }}
          >
            {detalhe}
          </Typography>
        ) : null}
      </Box>
      {children ? (
        <Box
          component="span"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}
        >
          {children}
        </Box>
      ) : null}
    </Stack>
  );
}
