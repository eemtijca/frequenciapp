"use client";

// Estado vazio com ícone, título, descrição e ação opcional.
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface EstadoVazioProps {
  icone: ReactNode;
  titulo: string;
  nivelTitulo?: "h2" | "h3";
  descricao: string;
  acao?: ReactNode;
}

export function EstadoVazio({
  icone,
  titulo,
  nivelTitulo = "h2",
  descricao,
  acao,
}: EstadoVazioProps) {
  return (
    <Stack
      component="section"
      spacing={2}
      sx={{ alignItems: "center", textAlign: "center", px: 3, py: 6 }}
    >
      <Box
        aria-hidden="true"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: TOKENS_LAYOUT.alvoToque,
          height: TOKENS_LAYOUT.alvoToque,
          color: "text.secondary",
          "& svg": { fontSize: 32 },
        }}
      >
        {icone}
      </Box>
      <Stack spacing={1} sx={{ alignItems: "center" }}>
        <Typography component={nivelTitulo} variant="h6">
          {titulo}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {descricao}
        </Typography>
      </Stack>
      {acao ? <Box sx={{ mt: 1 }}>{acao}</Box> : null}
    </Stack>
  );
}
