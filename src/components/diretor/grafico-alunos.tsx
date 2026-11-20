"use client";

// Ausência por aluno em barras horizontais no MUI X, com o limite de risco
// marcado, legenda escrita e a mesma leitura na tabela alternativa.
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { ChartsTooltipContainer, useItemTooltip } from "@mui/x-charts/ChartsTooltip";
import type { EstatisticaAluno } from "@/domain/estatisticas-diretor";
import { escalaPercentual } from "@/components/graficos/estilo-graficos";
import { CirculoValor } from "@/components/ui/mui/circulo-contagem";

interface Props {
  alunos: EstatisticaAluno[];
  limiteRisco: number;
}

interface AlunoNoGrafico {
  aluno: EstatisticaAluno;
  rotulo: string;
  valor: number;
}

const ALTURA_BARRA = 30;
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const percentualBarra = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length <= 2) return nome;
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

function TooltipAluno({ dados }: { dados: AlunoNoGrafico[] }) {
  const item = useItemTooltip<"bar">();
  const aluno = item ? dados[item.identifier.dataIndex]?.aluno : undefined;
  if (!aluno) return null;
  const taxa = percentual.format(aluno.taxa);
  const dias = `${aluno.ausencias} de ${aluno.diasComChamada} dias`;
  return (
    <ChartsTooltipContainer trigger="item" anchor="node" position="right">
      <Paper role="tooltip" variant="outlined" sx={{ minWidth: 180, maxWidth: 260, p: 1.5 }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {aluno.nome}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <CirculoValor
              texto={taxa}
              rotulo={`${taxa} de ausência`}
              tom={aluno.emRisco ? "falta" : "neutro"}
            />
            <Typography variant="body2">{dias}</Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {aluno.emRisco ? "Em risco" : "Abaixo do limite"}
          </Typography>
        </Stack>
      </Paper>
    </ChartsTooltipContainer>
  );
}

export default function GraficoAlunos({ alunos, limiteRisco }: Props) {
  const tema = useTheme();
  const paleta = tema.vars.palette;
  const corRisco = paleta.falta.main;
  const corNeutra = paleta.text.secondary;
  const dados: AlunoNoGrafico[] = useMemo(
    () =>
      alunos.map((aluno) => ({
        aluno,
        rotulo: nomeCurto(aluno.nome),
        valor: aluno.taxa * 100,
      })),
    [alunos],
  );
  const slotTooltip = useMemo(() => () => <TooltipAluno dados={dados} />, [dados]);
  const escala = escalaPercentual(
    Math.max(limiteRisco + 5, ...dados.map((item) => item.valor), 10),
  );
  const emRisco = alunos.filter((aluno) => aluno.emRisco).length;
  const descricao = `Ausência por aluno. ${emRisco} de ${alunos.length} alcançam o limite de ${limiteRisco}%.`;
  const altura = Math.max(160, dados.length * ALTURA_BARRA + 56);

  return (
    <Box
      component="figure"
      sx={{ display: "flex", flexDirection: "column", gap: 1, m: 0, minWidth: 0 }}
    >
      <Box role="img" aria-label={descricao} sx={{ width: "100%", minWidth: 0 }}>
        <BarChart
          title="Ausência por aluno"
          desc={descricao}
          height={altura}
          layout="horizontal"
          hideLegend
          skipAnimation
          borderRadius={4}
          grid={{ vertical: true }}
          margin={{ top: 24, right: 44, bottom: 4, left: 4 }}
          series={[
            {
              label: "Ausência",
              data: dados.map((item) => item.valor),
              barLabel: (item) =>
                item.value === null ? null : `${percentualBarra.format(item.value)}%`,
              barLabelPlacement: "outside",
              valueFormatter: (valor) =>
                valor === null ? "" : `${percentualBarra.format(valor)}%`,
            },
          ]}
          xAxis={[
            {
              min: 0,
              max: escala.teto,
              tickNumber: Math.max(2, Math.round(escala.teto / 10) + 1),
              valueFormatter: (valor: number) => `${valor}%`,
              tickLabelStyle: { fontSize: 11, fill: paleta.text.secondary },
              colorMap: {
                type: "piecewise",
                thresholds: [limiteRisco],
                colors: [corNeutra, corRisco],
              },
            },
          ]}
          yAxis={[
            {
              scaleType: "band",
              data: dados.map((item) => item.rotulo),
              width: 112,
              tickLabelStyle: { fontSize: 12, fill: paleta.text.primary },
            },
          ]}
          slotProps={{ tooltip: { trigger: "item" } }}
          slots={{ tooltip: slotTooltip }}
          sx={{ width: "100%" }}
        >
          <ChartsReferenceLine
            x={limiteRisco}
            label={`limite ${limiteRisco}%`}
            labelAlign="start"
            lineStyle={{ stroke: corRisco, strokeDasharray: "4 3", strokeWidth: 1.5 }}
            labelStyle={{ fill: paleta.falta.texto, fontSize: 11 }}
          />
        </BarChart>
      </Box>
      <Stack
        component="figcaption"
        direction="row"
        useFlexGap
        spacing={2}
        sx={{ alignItems: "center", flexWrap: "wrap", color: "text.secondary" }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Box
            aria-hidden="true"
            sx={{ width: 10, height: 10, borderRadius: "2px", backgroundColor: corRisco }}
          />
          <Typography variant="caption">em risco (a partir de {limiteRisco}%)</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Box
            aria-hidden="true"
            sx={{ width: 10, height: 10, borderRadius: "2px", backgroundColor: corNeutra }}
          />
          <Typography variant="caption">abaixo do limite</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
