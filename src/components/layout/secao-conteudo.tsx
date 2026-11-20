"use client";

// Seção de conteúdo em superfície plana, com título, descrição e ações.
import { useId, type ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface SecaoConteudoProps {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}

export function SecaoConteudo({ titulo, descricao, acoes, children }: SecaoConteudoProps) {
  const tituloId = useId();
  const temCabecalho = Boolean(titulo || descricao || acoes);

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={titulo ? tituloId : undefined}
      sx={{ p: { xs: 2, sm: 3 }, boxShadow: "none" }}
    >
      {temCabecalho ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            alignItems: { xs: "stretch", sm: "flex-start" },
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            {titulo ? (
              <Typography id={tituloId} component="h2" variant="h6">
                {titulo}
              </Typography>
            ) : null}
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
      ) : null}
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}
