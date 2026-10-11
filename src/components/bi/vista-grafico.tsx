"use client";

// Gráficos sob demanda com filtros cruzados; a tabela acessível acompanha todas as visualizações.
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
  Legend,
} from "recharts";
import type { GraficoBi, PontoBi } from "@/domain/bi-analise";
const CORES = ["#37ad84", "#c84b50", "#559cd6", "#ab81d0", "#d7ab51", "#7fac9b"];
export default function VistaGrafico({
  config,
  pontos: originais,
  onFiltrar,
}: {
  config: GraficoBi;
  pontos: PontoBi[];
  onFiltrar: (p: PontoBi) => void;
}) {
  const pontos = useMemo(() => {
    const referencias = new Map<string, Set<string>>();
    const grupos = new Map<string, Set<string>>();
    for (const p of originais) {
      const r = referencias.get(p.nome) ?? new Set<string>();
      r.add(p.referencia);
      referencias.set(p.nome, r);
      const g = grupos.get(p.grupo) ?? new Set<string>();
      g.add(p.grupoReferencia);
      grupos.set(p.grupo, g);
    }
    return originais.map((p) => ({
      ...p,
      nome:
        (referencias.get(p.nome)?.size ?? 0) > 1
          ? `${p.nome} [${p.referencia.slice(0, 8)}]`
          : p.nome,
      grupo:
        (grupos.get(p.grupo)?.size ?? 0) > 1
          ? `${p.grupo} [${p.grupoReferencia.slice(0, 8)}]`
          : p.grupo,
    }));
  }, [originais]);
  const visiveis = pontos.filter((p) => p.valor !== null).slice(0, 100);
  const grupos = useMemo(() => [...new Set(pontos.map((p) => p.grupo))].slice(0, 12), [pontos]);
  const agrupados = useMemo(() => {
    const linhas = new Map<string, Record<string, string | number | null>>();
    for (const p of pontos) {
      let l = linhas.get(p.nome);
      if (!l) {
        l = { nome: p.nome };
        linhas.set(p.nome, l);
      }
      l[p.grupo] = p.valor;
    }
    return [...linhas.values()].slice(0, 100);
  }, [pontos]);
  const clique = (item: unknown) => {
    if (item && typeof item === "object") {
      const obj = "payload" in item ? item.payload : item;
      if (obj && typeof obj === "object" && "nome" in obj) {
        const p = pontos.find(
          (p) => p.nome === obj.nome && (!("referencia" in obj) || p.referencia === obj.referencia),
        );
        if (p) onFiltrar(p);
      }
    }
  };
  const cliqueEixo = (e: unknown) => {
    if (e && typeof e === "object" && "activeLabel" in e) {
      const p = pontos.find((p) => p.nome === String(e.activeLabel));
      if (p) onFiltrar(p);
    }
  };
  const base = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
      <Tooltip
        contentStyle={{
          background: "var(--background)",
          borderColor: "var(--border)",
          borderRadius: 12,
        }}
      />
      <YAxis width={48} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <XAxis
        dataKey="nome"
        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
        interval="preserveStartEnd"
      />
      {config.meta !== null && (
        <ReferenceLine y={config.meta} stroke="#c84b50" strokeDasharray="4 4" label="Referência" />
      )}
    </>
  );
  if (config.tipo === "calor") {
    const xs = [...new Set(visiveis.map((p) => p.nome))].slice(0, 20);
    const ys = [...new Set(visiveis.map((p) => p.grupo))].slice(0, 12);
    const max = Math.max(1, ...visiveis.map((p) => p.valor ?? 0));
    return (
      <svg
        data-grafico
        viewBox={`0 0 ${Math.max(400, xs.length * 45 + 120)} ${ys.length * 34 + 55}`}
        className="h-full w-full"
        aria-label="Mapa de calor"
      >
        <text x={5} y={15} fill="currentColor" fontSize={10}>
          Intensidade proporcional ao valor; até 20 colunas e 12 linhas
        </text>
        {xs.map((x, i) => (
          <text key={x} x={130 + i * 45} y={35} fill="currentColor" fontSize={8}>
            {x.slice(0, 8)}
          </text>
        ))}
        {ys.map((y, j) => (
          <g key={y}>
            <text x={0} y={58 + j * 34} fill="currentColor" fontSize={9}>
              {y.slice(0, 18)}
            </text>
            {xs.map((x, i) => {
              const p = visiveis.find((p) => p.nome === x && p.grupo === y);
              return (
                <rect
                  key={x}
                  x={125 + i * 45}
                  y={42 + j * 34}
                  width={41}
                  height={30}
                  rx={5}
                  fill={
                    p ? `rgba(200,75,80,${0.12 + ((p.valor ?? 0) / max) * 0.88})` : "var(--muted)"
                  }
                  onClick={() => {
                    if (p) onFiltrar(p);
                  }}
                >
                  <title>
                    {x} | {y}: {p?.valor ?? "Sem registro"}
                  </title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      {config.tipo === "rosca" ? (
        <PieChart>
          <Tooltip />
          <Pie
            data={visiveis}
            dataKey="valor"
            nameKey="nome"
            innerRadius="45%"
            outerRadius="75%"
            onClick={clique}
            isAnimationActive={false}
          >
            {visiveis.map((p, i) => (
              <Cell key={`${p.referencia}:${p.nome}:${p.grupo}`} fill={CORES[i % CORES.length]} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      ) : config.tipo === "dispersao" ? (
        <ScatterChart>
          <CartesianGrid stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="registros"
            name="Registros"
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <YAxis
            type="number"
            dataKey="valor"
            name="Valor"
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={visiveis} fill={CORES[0]} onClick={clique} isAnimationActive={false} />
        </ScatterChart>
      ) : config.tipo === "linha" ? (
        <LineChart data={visiveis} onClick={cliqueEixo}>
          {base}
          <Line
            dataKey="valor"
            stroke={CORES[0]}
            strokeWidth={2}
            dot={false}
            activeDot={{ onClick: (_e, p) => clique(p) }}
            isAnimationActive={false}
          />
        </LineChart>
      ) : config.tipo === "area" ? (
        <AreaChart data={visiveis} onClick={cliqueEixo}>
          {base}
          <Area
            dataKey="valor"
            stroke={CORES[0]}
            fill={CORES[0]}
            fillOpacity={0.2}
            isAnimationActive={false}
          />
        </AreaChart>
      ) : config.tipo === "agrupadas" ? (
        <BarChart data={agrupados}>
          {base}
          <Legend />
          {grupos.map((g, i) => (
            <Bar
              key={g}
              dataKey={g}
              fill={CORES[i % CORES.length]}
              radius={[5, 5, 0, 0]}
              onClick={clique}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      ) : config.tipo === "horizontal" ? (
        <BarChart data={visiveis} layout="vertical">
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis
            dataKey="nome"
            type="category"
            width={115}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          />
          <Tooltip />
          <Bar
            dataKey="valor"
            fill={CORES[0]}
            onClick={clique}
            radius={[0, 5, 5, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      ) : (
        <BarChart data={visiveis}>
          {base}
          <Bar
            dataKey="valor"
            fill={CORES[0]}
            radius={[5, 5, 0, 0]}
            onClick={clique}
            isAnimationActive={false}
          />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
