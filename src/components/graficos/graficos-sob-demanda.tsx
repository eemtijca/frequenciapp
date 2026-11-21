"use client";

// Limites de carregamento dos gráficos: código separado e esqueleto reservado por visualização.
import { lazy, type ComponentProps } from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GraficoSobDemanda from "./grafico-sob-demanda";

const Rosca = lazy(() => import("@/components/painel/grafico-rosca"));
const Alunos = lazy(() => import("@/components/diretor/grafico-alunos"));
const Semanas = lazy(() => import("@/components/diretor/grafico-semanas"));
const Evolucao = lazy(() => import("@/components/relatorios/grafico-evolucao"));

const TEXTO_OCULTO = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function Espera({ altura }: { altura: number }) {
  return (
    <Box role="status" aria-live="polite" sx={{ width: "100%" }}>
      <Box component="span" sx={TEXTO_OCULTO}>
        Carregando gráfico
      </Box>
      <Skeleton variant="rounded" height={altura} sx={{ width: "100%" }} />
    </Box>
  );
}

export function GraficoRosca(props: ComponentProps<typeof Rosca>) {
  const fatias = props.fatias.filter((fatia) => fatia.valor > 0);
  if (fatias.length === 0)
    return (
      <Box
        sx={{
          display: "flex",
          minHeight: 160,
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: 2,
          textAlign: "center",
          border: 1,
          borderStyle: "dashed",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {props.vazio ?? "Nenhuma falta registrada"}
        </Typography>
      </Box>
    );
  const espera = (
    <Stack
      role="status"
      aria-live="polite"
      direction={{ xs: "column", sm: "row" }}
      spacing={2.5}
      sx={{ alignItems: "center", width: "100%" }}
    >
      <Box component="span" sx={TEXTO_OCULTO}>
        Carregando gráfico
      </Box>
      <Skeleton variant="circular" width={176} height={176} sx={{ flexShrink: 0 }} />
      <Stack spacing={0.75} sx={{ width: "100%", minWidth: 0, flex: 1 }}>
        {fatias.map((fatia) => (
          <Skeleton key={fatia.nome} variant="rounded" height={44} />
        ))}
      </Stack>
    </Stack>
  );
  return (
    <GraficoSobDemanda espera={espera}>
      <Rosca {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoAlunos(props: ComponentProps<typeof Alunos>) {
  return (
    <GraficoSobDemanda espera={<Espera altura={props.alunos.length * 30 + 80} />}>
      <Alunos {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoSemanas(props: ComponentProps<typeof Semanas>) {
  return (
    <GraficoSobDemanda espera={<Espera altura={256} />}>
      <Semanas {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoEvolucao(props: ComponentProps<typeof Evolucao>) {
  return (
    <Box sx={{ mt: 2 }}>
      <GraficoSobDemanda espera={<Espera altura={256} />}>
        <Evolucao {...props} />
      </GraficoSobDemanda>
    </Box>
  );
}
