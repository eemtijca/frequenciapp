"use client";

// Ausência por aluno em barras horizontais ordenadas, com ênfase: quem
// alcança o limite de risco em vermelho, os demais em grafite, e o limite
// marcado por uma linha. Identidade nunca só pela cor: o rótulo diz "em risco".
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EstatisticaAluno } from "@/domain/estatisticas-diretor";
import { ESTILO_TOOLTIP, escalaPercentual } from "@/components/graficos/estilo-graficos";
import { CirculoValor } from "@/components/ui/circulo-contagem";

interface Props {
  alunos: EstatisticaAluno[];
  limiteRisco: number;
}

const ALTURA_BARRA = 30;
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length <= 2) return nome;
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

export default function GraficoAlunos({ alunos, limiteRisco }: Props) {
  const dados = alunos.map((aluno) => ({
    ...aluno,
    rotulo: nomeCurto(aluno.nome),
    valor: Math.round(aluno.taxa * 1000) / 10,
  }));
  const escala = escalaPercentual(
    Math.max(limiteRisco + 5, ...dados.map((item) => item.valor), 10),
  );
  const emRisco = alunos.filter((aluno) => aluno.emRisco).length;

  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Ausência por aluno. ${emRisco} de ${alunos.length} alcançam o limite de ${limiteRisco}%.`}
        style={{ height: dados.length * ALTURA_BARRA + 56 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 20, right: 36, bottom: 4, left: 4 }}
            barCategoryGap={6}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, escala.teto]}
              ticks={escala.marcas}
              tickFormatter={(valor: number) => `${valor}%`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="rotulo"
              width={112}
              tick={{ fontSize: 12, fill: "var(--foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...ESTILO_TOOLTIP}
              formatter={(
                _valor: unknown,
                _nome: unknown,
                item: { payload?: EstatisticaAluno },
              ) => {
                const aluno = item.payload;
                if (!aluno) return ["", ""];
                const dias = `${aluno.ausencias} de ${aluno.diasComChamada} dias`;
                return [
                  <span key="valores" className="inline-flex items-center gap-1 align-middle">
                    <CirculoValor
                      texto={percentual.format(aluno.taxa)}
                      rotulo={`${percentual.format(aluno.taxa)} de ausência`}
                    />
                    <CirculoValor texto={dias} rotulo={`ausente em ${dias} com chamada`} />
                  </span>,
                  aluno.emRisco ? "Ausência (em risco)" : "Ausência",
                ];
              }}
              labelFormatter={(
                _rotulo: unknown,
                itens: readonly { payload?: EstatisticaAluno }[],
              ) => itens[0]?.payload?.nome ?? ""}
            />
            <ReferenceLine
              x={limiteRisco}
              stroke="var(--falta)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `limite ${limiteRisco}%`,
                position: "top",
                fontSize: 11,
                fill: "var(--falta-texto)",
              }}
            />
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={20}>
              {dados.map((item) => (
                <Cell key={item.alunoId} fill={item.emRisco ? "var(--falta)" : "var(--chart-3)"} />
              ))}
              <LabelList
                dataKey="valor"
                position="right"
                formatter={(valor: unknown) => `${Number(valor)}%`}
                style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-falta size-2.5 rounded-sm" />
          em risco (a partir de {limiteRisco}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-chart-3 size-2.5 rounded-sm" />
          abaixo do limite
        </span>
      </figcaption>
    </figure>
  );
}
