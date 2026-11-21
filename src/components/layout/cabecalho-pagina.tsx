"use client";

// Cabeçalho de página com título, descrição curta e ações, sem largura própria.
import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ESPACO_COMPOSICAO } from "@/theme/layout";

interface CabecalhoPaginaProps {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}

export function CabecalhoPagina({ titulo, descricao, acoes }: CabecalhoPaginaProps) {
  return (
    <Stack
      component="header"
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{
        alignItems: { xs: "stretch", sm: "flex-start" },
        justifyContent: "space-between",
        mb: { xs: 2, sm: 3 },
      }}
    >
      <Stack spacing={ESPACO_COMPOSICAO.tituloDescricao} useFlexGap sx={{ minWidth: 0 }}>
        <Typography component="h1" variant="h4">
          {titulo}
        </Typography>
        {descricao ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {descricao}
          </Typography>
        ) : null}
      </Stack>
      {acoes ? (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: "wrap",
            flexShrink: 0,
            justifyContent: { xs: "flex-start", sm: "flex-end" },
          }}
        >
          {acoes}
        </Stack>
      ) : null}
    </Stack>
  );
}
