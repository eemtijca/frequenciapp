"use client";

// Ausência da turma por semana no MUI X: linha da taxa com o limite de risco
// ou barras empilhadas de faltas e justificadas, com legenda e descrição.
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LineChart } from "@mui/x-charts/LineChart";
import { rotuloDataCurta } from "@/domain/frequencia";
import type { EstatisticaSemana } from "@/domain/estatisticas-diretor";
import { escalaPercentual } from "@/components/graficos/estilo-graficos";

interface Props {
  semanas: EstatisticaSemana[];
  limiteRisco: number;
  separarJustificadas: boolean;
}

interface SemanaNoGrafico {
  semana: EstatisticaSemana;
  rotulo: string;
  valor: number;
}

const ALTURA_GRAFICO = 224;
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function contarDias(valor: number | null): string {
  if (valor === null) return "";
  if (valor === 0) return "nenhum dia";
  return `${valor} ${valor === 1 ? "dia" : "dias"}`;
}

export default function GraficoSemanas({ semanas, limiteRisco, separarJustificadas }: Props) {
  const tema = useTheme();
  const paleta = tema.vars.palette;
  const dados: SemanaNoGrafico[] = semanas
    .filter((semana) => semana.alunoDias > 0)
    .map((semana) => ({
      semana,
      rotulo: rotuloDataCurta(semana.inicio),
      valor: semana.taxa * 100,
    }));
  if (dados.length === 0) {
    return (
      <Typography
        variant="body2"
        sx={{ px: 2, py: 3, textAlign: "center", color: "text.secondary" }}
      >
        Sem chamada registrada nas semanas do período.
      </Typography>
    );
  }
  const primeiro = dados[0]?.rotulo ?? "";
  const ultimo = dados[dados.length - 1]?.rotulo ?? "";
  const descricao = `Ausência da turma por semana, de ${primeiro} a ${ultimo}.`;
  const rotulos = dados.map((item) => item.rotulo);
  const estiloEixo = { fontSize: 11, fill: paleta.text.secondary };

  if (separarJustificadas) {
    return (
      <Box
        component="figure"
        sx={{ display: "flex", flexDirection: "column", gap: 1, m: 0, minWidth: 0 }}
      >
        <Box
          role="img"
          aria-label={`${descricao} Faltas e faltas justificadas empilhadas.`}
          sx={{ width: "100%", minWidth: 0 }}
        >
          <BarChart
            title="Ausência da turma por semana"
            desc={`${descricao} Faltas e faltas justificadas empilhadas.`}
            height={ALTURA_GRAFICO}
            hideLegend
            skipAnimation
            borderRadius={4}
            grid={{ horizontal: true }}
            margin={{ top: 8, right: 36, bottom: 0, left: 0 }}
            series={[
              {
                label: "Faltas",
                data: dados.map((item) => item.semana.faltas ?? 0),
                color: paleta.falta.main,
                stack: "a",
                valueFormatter: contarDias,
              },
              {
                label: "Faltas justificadas",
                data: dados.map((item) => item.semana.justificadas ?? 0),
                color: paleta.justificada.main,
                stack: "a",
                valueFormatter: contarDias,
              },
            ]}
            xAxis={[
              {
                scaleType: "band",
                data: rotulos,
                tickLabelStyle: estiloEixo,
                valueFormatter: (valor, contexto) =>
                  contexto.location === "tooltip" ? `Semana de ${valor}` : String(valor),
              },
            ]}
            yAxis={[{ min: 0, tickLabelStyle: estiloEixo }]}
            slotProps={{ tooltip: { trigger: "axis" } }}
            sx={{ width: "100%" }}
          />
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
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                backgroundColor: paleta.falta.main,
              }}
            />
            <Typography variant="caption">faltas</Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                backgroundColor: paleta.justificada.main,
              }}
            />
            <Typography variant="caption">faltas justificadas</Typography>
          </Stack>
          <Typography variant="caption">semanas pela segunda-feira</Typography>
        </Stack>
      </Box>
    );
  }

  const escala = escalaPercentual(
    Math.max(limiteRisco + 5, ...dados.map((item) => item.valor), 10),
  );
  const descricaoLinha = `${descricao} Limite de risco em ${limiteRisco}%.`;
  return (
    <Box
      component="figure"
      sx={{ display: "flex", flexDirection: "column", gap: 1, m: 0, minWidth: 0 }}
    >
      <Box role="img" aria-label={descricaoLinha} sx={{ width: "100%", minWidth: 0 }}>
        <LineChart
          title="Ausência da turma por semana"
          desc={descricaoLinha}
          height={ALTURA_GRAFICO}
          hideLegend
          skipAnimation
          grid={{ horizontal: true }}
          margin={{ top: 8, right: 36, bottom: 0, left: 0 }}
          series={[
            {
              label: "Ausência",
              data: dados.map((item) => item.valor),
              color: paleta.text.secondary,
              curve: "monotoneX",
              valueFormatter: (valor) => (valor === null ? "" : percentual.format(valor / 100)),
            },
          ]}
          xAxis={[
            {
              scaleType: "point",
              data: rotulos,
              tickLabelStyle: estiloEixo,
              valueFormatter: (valor, contexto) =>
                contexto.location === "tooltip" ? `Semana de ${valor}` : String(valor),
            },
          ]}
          yAxis={[
            {
              min: 0,
              max: escala.teto,
              tickNumber: Math.max(2, Math.round(escala.teto / 10) + 1),
              valueFormatter: (valor: number) => `${valor}%`,
              tickLabelStyle: estiloEixo,
            },
          ]}
          slotProps={{ tooltip: { trigger: "axis" } }}
          sx={{ width: "100%" }}
        >
          <ChartsReferenceLine
            y={limiteRisco}
            label={`limite ${limiteRisco}%`}
            labelAlign="end"
            lineStyle={{
              stroke: paleta.falta.main,
              strokeDasharray: "4 3",
              strokeWidth: 1.5,
            }}
            labelStyle={{ fill: paleta.falta.texto, fontSize: 11 }}
          />
        </LineChart>
      </Box>
      <Typography component="figcaption" variant="caption" sx={{ color: "text.secondary" }}>
        Semanas pela segunda-feira; ausência sobre os dias com chamada de cada aluno.
      </Typography>
    </Box>
  );
}
