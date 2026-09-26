"use client";

// Rosca de distribuição de faltas com a paleta do app e legenda acessível.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface FatiaGrafico {
  nome: string;
  valor: number;
  detalhe?: string;
}

// Tons do próprio tema: verde institucional, verde claro e grafite. O
// vermelho fica reservado ao sentido de falta e erro.
const CORES = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--primary)"];

interface Props {
  titulo: string;
  fatias: FatiaGrafico[];
  rotuloTotal?: string;
  vazio?: string;
}

export default function GraficoRosca({
  titulo,
  fatias,
  rotuloTotal = "faltas",
  vazio = "Nenhuma falta registrada",
}: Props) {
  const visiveis = fatias.filter((fatia) => fatia.valor > 0);
  const total = visiveis.reduce((soma, fatia) => soma + fatia.valor, 0);
  const percentual = new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  });

  if (total === 0) {
    return (
      <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm">
        {vazio}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-40 shrink-0" role="img" aria-label={titulo}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visiveis}
              dataKey="valor"
              nameKey="nome"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {visiveis.map((fatia, indice) => (
                <Cell key={fatia.nome} fill={CORES[indice % CORES.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(valor: unknown, nome: unknown) => {
                const total = Number(valor) || 0;
                return [`${total} ${total === 1 ? "falta" : "faltas"}`, String(nome ?? "")];
              }}
              contentStyle={{
                background: "var(--popover)",
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--popover-foreground)",
                fontSize: "0.75rem",
                opacity: 1,
              }}
              wrapperStyle={{ opacity: 1, zIndex: 30, pointerEvents: "none" }}
              allowEscapeViewBox={{ x: true, y: true }}
              offset={12}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <strong className="numerais-tabulares text-2xl font-semibold">{total}</strong>
          <span className="text-muted-foreground text-[11px]">{rotuloTotal}</span>
        </span>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {visiveis.map((fatia, indice) => (
          <li key={fatia.nome} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: CORES[indice % CORES.length] }}
            />
            <span className="min-w-0 flex-1 truncate">
              {fatia.nome}
              {fatia.detalhe && (
                <span className="text-muted-foreground ml-1 text-xs">{fatia.detalhe}</span>
              )}
            </span>
            <span className="numerais-tabulares text-muted-foreground shrink-0 text-xs">
              {fatia.valor} · {percentual.format(fatia.valor / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
