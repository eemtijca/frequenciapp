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
  compacto?: boolean;
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
  compacto = false,
}: CabecalhoPaginaProps) {
  return (
    <Stack
      component="header"
      direction={{ xs: "column", sm: "row" }}
      spacing={compacto ? 1.5 : 2}
      useFlexGap={compacto || undefined}
      sx={{
        alignItems: compacto
          ? { xs: "flex-start", sm: "center" }
          : { xs: "stretch", sm: "flex-start" },
        justifyContent: "space-between",
        ...(compacto ? { flexWrap: "wrap" } : { mb: { xs: 2, sm: 3 } }),
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
            ...(compacto && { maxWidth: "100%" }),
            justifyContent: { xs: "flex-start", sm: "flex-end" },
          }}
        >
          {acoes}
        </Stack>
      ) : null}
    </Stack>
  );
}
