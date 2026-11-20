"use client";

// Cabeçalho de etapa dos cards de planilha: número quando pendente, check
// quando concluída, com resumo e ações ao lado.
import type { ReactNode } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type EstadoEtapa = "pendente" | "atual" | "concluida";

export function EtapaPlanilha({
  numero,
  titulo,
  estado,
  resumo,
  acoes,
  children,
}: {
  numero?: number;
  titulo: string;
  estado: EstadoEtapa;
  resumo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const concluida = estado === "concluida";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1, sm: 2 }}
        sx={{ alignItems: { sm: "flex-start" }, minWidth: 0 }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "flex-start", flex: 1, minWidth: 0 }}
        >
          {numero !== undefined ? (
            <Box
              aria-hidden="true"
              sx={(tema) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                width: 24,
                height: 24,
                marginTop: 0.25,
                borderRadius: "50%",
                fontSize: "0.75rem",
                fontWeight: 600,
                ...(concluida
                  ? {
                      color: tema.vars.palette.primary.main,
                      backgroundColor: `color-mix(in srgb, ${tema.vars.palette.primary.main} 12%, transparent)`,
                    }
                  : estado === "atual"
                    ? {
                        color: tema.vars.palette.primary.contrastText,
                        backgroundColor: tema.vars.palette.primary.main,
                      }
                    : {
                        color: tema.vars.palette.text.secondary,
                        backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 8%, transparent)`,
                      }),
              })}
            >
              {concluida ? <CheckRoundedIcon sx={{ fontSize: 16 }} /> : numero}
            </Box>
          ) : null}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0, flex: 1 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: estado === "pendente" ? "text.secondary" : undefined }}
            >
              {titulo}
            </Typography>
            {resumo ? (
              <Stack
                direction="row"
                spacing={0.5}
                useFlexGap
                sx={{ flexWrap: "wrap", alignItems: "center", color: "text.secondary" }}
              >
                {resumo}
              </Stack>
            ) : null}
          </Box>
        </Stack>
        {acoes ? (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              flexShrink: 0,
              paddingLeft: numero !== undefined ? { xs: 4.5, sm: 0 } : 0,
            }}
          >
            {acoes}
          </Stack>
        ) : null}
      </Stack>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          paddingLeft: numero !== undefined ? { xs: 0, sm: 4.5 } : 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
