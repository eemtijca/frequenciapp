"use client";

// Evolução mensal isolada para carregar a biblioteca somente perto da área visível.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ESTILO_TOOLTIP } from "@/components/graficos/estilo-graficos";
const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" };
interface Props {
  evolucao: { rotulo: string; valor: number | null }[];
}
export default function GraficoEvolucao({ evolucao }: Props) {
  return (
    <div
      role="img"
      aria-label="Infrequência por dia, em porcentagem. Valores disponíveis em Ver dados diários."
      className="h-64 min-w-0"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={evolucao} margin={{ top: 12, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="rotulo" tick={EIXO} minTickGap={24} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(valor: number) => `${valor}%`}
            tick={EIXO}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            {...ESTILO_TOOLTIP}
            formatter={(valor: unknown) => [
              `${Number(valor).toLocaleString("pt-BR")}%`,
              "Infrequência",
            ]}
          />
          <Line
            dataKey="valor"
            name="Infrequência"
            type="linear"
            connectNulls={false}
            stroke="var(--chart-3)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
