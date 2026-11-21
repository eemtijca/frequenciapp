"use client";

// Rosca de distribuição de faltas em MUI X, com legenda acessível e total no centro.
import { useId } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { PieChart } from "@mui/x-charts/PieChart";
import { CirculoValor } from "@/components/ui/mui/circulo-contagem";
import { ItemLegendaGrafico } from "@/components/ui/mui/item-legenda-grafico";

export interface FatiaGrafico {
  nome: string;
  valor: number;
  detalhe?: string;
  alunos?: number;
  unidadeSingular?: string;
  unidadePlural?: string;
}

const TAMANHO_GRAFICO = 176;
const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

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

interface Props {
  titulo: string;
  fatias: FatiaGrafico[];
  rotuloTotal?: string;
  unidadeSingular?: string;
  unidadePlural?: string;
  vazio?: string;
  tomValores?: "neutro" | "falta";
}

export default function GraficoRosca({
  titulo,
  fatias,
  rotuloTotal = "faltas",
  unidadeSingular = "falta",
  unidadePlural = "faltas",
  vazio = "Nenhuma falta registrada",
  tomValores = "neutro",
}: Props) {
  const descricaoId = useId();
  const tema = useTheme();
  const paleta = tema.vars ?? tema;
  const cores = [
    paleta.palette.primary.main,
    paleta.palette.falta.main,
    paleta.palette.justificada.main,
    paleta.palette.alerta.main,
    paleta.palette.success.main,
    paleta.palette.info.main,
  ];
  const visiveis = fatias.filter((fatia) => fatia.valor > 0);
  const total = visiveis.reduce((soma, fatia) => soma + fatia.valor, 0);
  const rotuloFatia = (fatia: FatiaGrafico) =>
    `${fatia.valor} ${fatia.valor === 1 ? (fatia.unidadeSingular ?? unidadeSingular) : (fatia.unidadePlural ?? unidadePlural)}`;
  const descricao = `${titulo}: ${visiveis
    .map((fatia) => `${fatia.nome}, ${rotuloFatia(fatia)}`)
    .join("; ")}. Total: ${total} ${rotuloTotal}.`;

  if (total === 0) {
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
          {vazio}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2.5}
      sx={{ alignItems: "center", minWidth: 0 }}
    >
      <Box
        role="img"
        tabIndex={0}
        aria-label={titulo}
        aria-describedby={descricaoId}
        data-grafico={titulo}
        sx={{
          position: "relative",
          width: TAMANHO_GRAFICO,
          height: TAMANHO_GRAFICO,
          flexShrink: 0,
        }}
      >
        <PieChart
          series={[
            {
              data: visiveis.map((fatia, indice) => ({
                id: fatia.nome,
                value: fatia.valor,
                label: fatia.nome,
                color: cores[indice % cores.length],
              })),
              innerRadius: "62%",
              outerRadius: "96%",
              paddingAngle: 2,
              valueFormatter: (_valor, contexto) => {
                const fatia = visiveis[contexto.dataIndex];
                return fatia ? rotuloFatia(fatia) : "";
              },
            },
          ]}
          width={TAMANHO_GRAFICO}
          height={TAMANHO_GRAFICO}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          hideLegend
          skipAnimation
          slotProps={{ tooltip: { trigger: "item" } }}
          title={titulo}
          desc={descricao}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: "24%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: "50%",
            backgroundColor: "background.paper",
            pointerEvents: "none",
          }}
        >
          <Typography
            component="strong"
            variant="h5"
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {total}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {rotuloTotal}
          </Typography>
        </Box>
      </Box>
      <Typography id={descricaoId} sx={TEXTO_OCULTO}>
        {descricao}
      </Typography>
      <Stack
        component="ul"
        spacing={0.75}
        aria-label={`Legenda de ${titulo}`}
        sx={{ width: "100%", minWidth: 0, flex: 1, m: 0, p: 0, listStyle: "none" }}
      >
        {visiveis.map((fatia, indice) => (
          <ItemLegendaGrafico
            key={fatia.nome}
            cor={cores[indice % cores.length] ?? paleta.palette.primary.main}
            nome={fatia.nome}
            detalhe={
              fatia.alunos !== undefined ? (
                <Box
                  component="span"
                  role="img"
                  aria-label={fatia.detalhe ?? `${fatia.alunos} alunos`}
                  title={fatia.detalhe ?? `${fatia.alunos} alunos`}
                  sx={{
                    display: "inline-block",
                    mt: 0.5,
                    px: 1,
                    py: 0.5,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    backgroundColor: "action.hover",
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.75rem",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span aria-hidden="true">{fatia.alunos} alunos</span>
                </Box>
              ) : fatia.detalhe ? (
                fatia.detalhe
              ) : null
            }
          >
            <CirculoValor
              texto={String(fatia.valor)}
              rotulo={rotuloFatia(fatia)}
              tom={tomValores}
            />
            <CirculoValor
              texto={percentual.format(fatia.valor / total)}
              rotulo={`${percentual.format(fatia.valor / total)} do total`}
              tom={tomValores}
            />
          </ItemLegendaGrafico>
        ))}
      </Stack>
    </Stack>
  );
}
