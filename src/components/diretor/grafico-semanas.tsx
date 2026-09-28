"use client";

// Ausência da turma por semana. Sem justificativas liberadas, uma linha da
// taxa semanal com o limite de risco; com elas, barras empilhadas de faltas e
// faltas justificadas por semana, nas cores validadas para daltonismo.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rotuloDataCurta } from "@/domain/frequencia";
import type { EstatisticaSemana } from "@/domain/estatisticas-diretor";
import { ESTILO_TOOLTIP, escalaPercentual } from "@/components/diretor/grafico-alunos";
import { CirculoValor } from "@/components/ui/circulo-contagem";

interface Props {
  semanas: EstatisticaSemana[];
  limiteRisco: number;
  separarJustificadas: boolean;
}

const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

export default function GraficoSemanas({ semanas, limiteRisco, separarJustificadas }: Props) {
  const dados = semanas
    .filter((semana) => semana.alunoDias > 0)
    .map((semana) => ({
      ...semana,
      rotulo: rotuloDataCurta(semana.inicio),
      valor: Math.round(semana.taxa * 1000) / 10,
    }));
  if (dados.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
        Sem chamada registrada nas semanas do período.
      </p>
    );
  }
  const descricao = `Ausência da turma por semana, de ${dados[0]?.rotulo} a ${dados[dados.length - 1]?.rotulo}.`;

  if (separarJustificadas) {
    return (
      <figure className="flex flex-col gap-2">
        <div
          role="img"
          aria-label={`${descricao} Faltas e faltas justificadas empilhadas.`}
          className="h-56"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={EIXO} axisLine={false} tickLine={false} />
              <Tooltip
                {...ESTILO_TOOLTIP}
                labelFormatter={(rotulo: unknown) => `Semana de ${String(rotulo)}`}
                formatter={(valor: unknown, nome: unknown) => [
                  `${Number(valor)} ${Number(valor) === 1 ? "dia" : "dias"}`,
                  String(nome),
                ]}
              />
              <Bar
                dataKey="faltas"
                name="Faltas"
                stackId="a"
                fill="var(--falta)"
                isAnimationActive={false}
                maxBarSize={36}
              />
              <Bar
                dataKey="justificadas"
                name="Faltas justificadas"
                stackId="a"
                fill="var(--justificada)"
                stroke="var(--card)"
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-falta size-2.5 rounded-sm" />
            faltas
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-justificada size-2.5 rounded-sm" />
            faltas justificadas
          </span>
          <span>semanas pela segunda-feira</span>
        </figcaption>
      </figure>
    );
  }

  const escala = escalaPercentual(
    Math.max(limiteRisco + 5, ...dados.map((item) => item.valor), 10),
  );
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`${descricao} Limite de risco em ${limiteRisco}%.`}
        className="h-56"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="rotulo" tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, escala.teto]}
              ticks={escala.marcas}
              tickFormatter={(valor: number) => `${valor}%`}
              tick={EIXO}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...ESTILO_TOOLTIP}
              cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
              labelFormatter={(rotulo: unknown) => `Semana de ${String(rotulo)}`}
              formatter={(
                _valor: unknown,
                _nome: unknown,
                item: { payload?: EstatisticaSemana },
              ) => [
                item.payload ? (
                  <span key="valores" className="inline-flex items-center gap-1 align-middle">
                    <CirculoValor
                      texto={percentual.format(item.payload.taxa)}
                      rotulo={`${percentual.format(item.payload.taxa)} de ausência`}
                    />
                    <CirculoValor
                      texto={`${item.payload.ausencias} ${item.payload.ausencias === 1 ? "ausência" : "ausências"}`}
                      rotulo={`${item.payload.ausencias} ${item.payload.ausencias === 1 ? "ausência" : "ausências"}`}
                    />
                  </span>
                ) : (
                  ""
                ),
                "Ausência",
              ]}
            />
            <ReferenceLine
              y={limiteRisco}
              stroke="var(--falta)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: `limite ${limiteRisco}%`,
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--falta-texto)",
              }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              name="Ausência"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--chart-3)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        Semanas pela segunda-feira; ausência sobre os dias com chamada de cada aluno.
      </figcaption>
    </figure>
  );
}
