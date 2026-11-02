"use client";

// Rosca de distribuição de faltas com a paleta do app e legenda acessível.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CSSProperties } from "react";
import { CirculoValor } from "@/components/ui/circulo-contagem";
import { ItemLegendaGrafico } from "@/components/ui/item-legenda-grafico";

export interface FatiaGrafico {
  nome: string;
  valor: number;
  detalhe?: string;
  alunos?: number;
  unidadeSingular?: string;
  unidadePlural?: string;
}

// Tons do próprio tema: verde institucional, verde claro e grafite. O
// vermelho fica reservado ao sentido de falta e erro.
const CORES = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--primary)"];
const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

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
  const visiveis = fatias.filter((fatia) => fatia.valor > 0);
  const total = visiveis.reduce((soma, fatia) => soma + fatia.valor, 0);
  const rotuloFatia = (fatia: FatiaGrafico) =>
    `${fatia.valor} ${fatia.valor === 1 ? (fatia.unidadeSingular ?? unidadeSingular) : (fatia.unidadePlural ?? unidadePlural)}`;

  if (total === 0) {
    return (
      <div className="superficie text-muted-foreground flex min-h-40 items-center justify-center border-dashed px-4 text-center text-sm shadow-none">
        {vazio}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div
        className="relative size-44 shrink-0"
        role="img"
        aria-label={titulo}
        data-grafico={titulo}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visiveis}
              dataKey="valor"
              nameKey="nome"
              innerRadius="62%"
              outerRadius="96%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {visiveis.map((fatia, indice) => (
                <Cell
                  key={fatia.nome}
                  className="grafico-fatia"
                  fill={CORES[indice % CORES.length]}
                  style={{ "--cor-fatia": CORES[indice % CORES.length] } as CSSProperties}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="superficie text-foreground max-w-44 px-3 py-2 text-xs break-words whitespace-normal">
                    {payload.map((item) => (
                      <p key={String(item.name)} className="numerais-tabulares">
                        {String(item.name)}: {rotuloFatia(item.payload as FatiaGrafico)}
                      </p>
                    ))}
                  </div>
                ) : null
              }
              wrapperStyle={{ opacity: 1, zIndex: 30, pointerEvents: "none" }}
              allowEscapeViewBox={{ x: false, y: true }}
              offset={12}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        <span
          aria-hidden="true"
          className="superficie pointer-events-none absolute inset-[24%] flex flex-col items-center justify-center rounded-full"
        >
          <strong className="numerais-tabulares text-2xl font-semibold">{total}</strong>
          <span className="text-muted-foreground text-[11px]">{rotuloTotal}</span>
        </span>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {visiveis.map((fatia, indice) => (
          <ItemLegendaGrafico
            key={fatia.nome}
            cor={CORES[indice % CORES.length] ?? "var(--primary)"}
            nome={fatia.nome}
            detalhe={
              fatia.alunos !== undefined ? (
                <span
                  role="img"
                  aria-label={fatia.detalhe ?? `${fatia.alunos} alunos`}
                  title={fatia.detalhe ?? `${fatia.alunos} alunos`}
                  className="numerais-tabulares bg-secondary text-muted-foreground border-border mt-1 block w-fit min-w-10 rounded-[6px] border px-2 py-1 text-center text-xs leading-none whitespace-nowrap"
                >
                  <span aria-hidden="true">{fatia.alunos} alunos</span>
                </span>
              ) : fatia.detalhe ? (
                <span className="text-muted-foreground block text-xs">{fatia.detalhe}</span>
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
      </ul>
    </div>
  );
}
