"use client";

// Evolução da infrequência em MUI X, carregada sob demanda e com limites visuais.
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";
import { LineChart } from "@mui/x-charts/LineChart";

interface Props {
  evolucao: { rotulo: string; valor: number | null }[];
  limiares?: { atencao: number; critica: number };
  rotuloAcessivel?: string;
}

export default function GraficoEvolucao({
  evolucao,
  limiares,
  rotuloAcessivel = "Infrequência por dia, em porcentagem. Valores disponíveis em Ver dados diários.",
}: Props) {
  const tema = useTheme();
  const rotulos = evolucao.map((item) => item.rotulo);
  const valores = evolucao.map((item) => item.valor);
  const estiloEixo = { fontSize: 11, fill: tema.vars.palette.text.secondary };

  return (
    <Box role="img" aria-label={rotuloAcessivel} sx={{ width: "100%", minWidth: 0 }}>
      <LineChart
        height={256}
        hideLegend
        skipAnimation
        grid={{ horizontal: true }}
        margin={{ top: 12, right: 36, bottom: 0, left: 0 }}
        series={[
          {
            data: valores,
            label: "Infrequência",
            color: tema.vars.palette.text.secondary,
            connectNulls: false,
            curve: "linear",
            valueFormatter: (valor) =>
              valor === null ? "Sem registro" : `${valor.toLocaleString("pt-BR")}%`,
          },
        ]}
        xAxis={[
          {
            scaleType: "point",
            data: rotulos,
            tickLabelStyle: estiloEixo,
          },
        ]}
        yAxis={[
          {
            min: 0,
            max: 100,
            valueFormatter: (valor: number) => `${valor}%`,
            tickLabelStyle: estiloEixo,
          },
        ]}
        sx={{ width: "100%" }}
      >
        {limiares ? (
          <>
            <ChartsReferenceLine
              y={limiares.atencao * 100}
              lineStyle={{
                stroke: tema.vars.palette.alerta.main,
                strokeDasharray: "4 4",
              }}
            />
            <ChartsReferenceLine
              y={limiares.critica * 100}
              lineStyle={{
                stroke: tema.vars.palette.falta.main,
                strokeDasharray: "4 4",
              }}
            />
          </>
        ) : null}
      </LineChart>
    </Box>
  );
}
