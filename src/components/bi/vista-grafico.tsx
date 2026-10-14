"use client";

// Gráficos configuráveis com lacunas preservadas, mapa acessível e filtros cruzados.
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
  LabelList,
} from "recharts";
import { NOMES_MEDIDAS, type GraficoBi, type PontoBi } from "@/domain/bi-analise";
import {
  CORES_BI,
  formatarValorBi,
  prepararCalorBi,
  rotularPontosBi,
  rotuloEixoBi,
} from "@/lib/bi-visualizacao";

export default function VistaGrafico({
  config,
  pontos: originais,
  onFiltrar,
}: {
  config: GraficoBi;
  pontos: PontoBi[];
  onFiltrar: (p: PontoBi) => void;
}) {
  const pontos = useMemo(() => rotularPontosBi(originais), [originais]);
  const cores = CORES_BI[config.paleta];
  const cor = cores[0];
  const visiveis = pontos.slice(0, 100);
  const grupos = useMemo(() => [...new Set(pontos.map((p) => p.grupo))].slice(0, 12), [pontos]);
  const agrupados = useMemo(() => {
    const linhas = new Map<string, Record<string, string | number | null>>();
    for (const p of pontos) {
      let l = linhas.get(p.nome);
      if (!l) {
        l = { nome: p.nome };
        linhas.set(p.nome, l);
      }
      const indice = grupos.indexOf(p.grupo);
      if (indice !== -1) l[`grupo${indice}`] = p.valor;
    }
    return [...linhas.values()].slice(0, 100);
  }, [pontos, grupos]);
  const calor = useMemo(() => prepararCalorBi(pontos), [pontos]);
  const formatar = (valor: unknown) =>
    formatarValorBi(typeof valor === "number" ? valor : null, config.medida);
  const filtrar = (p: PontoBi) => {
    const original = originais.find(
      (o) => o.referencia === p.referencia && o.grupoReferencia === p.grupoReferencia,
    );
    if (original) onFiltrar(original);
  };
  const clique = (item: unknown) => {
    if (item && typeof item === "object") {
      const obj = "payload" in item ? item.payload : item;
      if (obj && typeof obj === "object" && "nome" in obj) {
        const p = pontos.find(
          (p) => p.nome === obj.nome && (!("referencia" in obj) || p.referencia === obj.referencia),
        );
        if (p) filtrar(p);
      }
    }
  };
  const cliqueEixo = (e: unknown) => {
    if (e && typeof e === "object" && "activeLabel" in e) {
      const p = pontos.find((p) => p.nome === String(e.activeLabel));
      if (p) filtrar(p);
    }
  };
  const tooltip = (
    <Tooltip
      formatter={(v, nome) =>
        nome === "Registros"
          ? formatarValorBi(typeof v === "number" ? v : null, "registros")
          : formatar(v)
      }
      contentStyle={{
        background: "var(--background)",
        color: "var(--foreground)",
        borderColor: "var(--border)",
        borderRadius: 12,
      }}
      labelStyle={{ color: "var(--foreground)" }}
    />
  );
  const valores = config.mostrarValores ? (
    <LabelList
      dataKey="valor"
      position="top"
      formatter={formatar}
      fill="currentColor"
      fontSize={11}
    />
  ) : null;
  const base = (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
      {tooltip}
      <YAxis width={54} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <XAxis
        dataKey="nome"
        tickFormatter={rotuloEixoBi}
        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        interval="preserveStartEnd"
      />
      {config.meta !== null && (
        <ReferenceLine
          y={config.meta}
          stroke="var(--falta-texto)"
          strokeDasharray="4 4"
          label="Referência"
        />
      )}
    </>
  );
  if (!pontos.some((p) => p.valor !== null))
    return (
      <p className="text-muted-foreground flex h-full items-center justify-center p-5 text-center text-sm">
        Sem base de cálculo neste recorte.
      </p>
    );

  if (config.tipo === "calor") {
    const largura = Math.max(400, calor.colunas.length * 64 + 170);
    return (
      <div
        className="h-full overflow-auto print:h-auto print:overflow-visible"
        role="region"
        aria-label="Mapa de calor com rolagem"
        tabIndex={0}
      >
        <svg
          data-grafico
          viewBox={`0 0 ${largura} ${calor.linhas.length * 48 + 70}`}
          width={largura}
          height={calor.linhas.length * 48 + 70}
          className="max-w-none print:h-auto print:w-full print:max-w-full"
          aria-label={`Mapa de calor: ${config.titulo}`}
        >
          {config.mostrarLegenda && (
            <text x={5} y={18} fill="currentColor" fontSize={12}>
              Maior intensidade indica maior valor
            </text>
          )}
          {calor.colunas.map((x, i) => (
            <text
              key={x}
              x={170 + i * 64}
              y={48}
              fill="currentColor"
              fontSize={11}
              textAnchor="middle"
            >
              <title>{x}</title>
              {rotuloEixoBi(x).slice(0, 9)}
            </text>
          ))}
          {calor.linhas.map((y, j) => (
            <g key={y}>
              <text x={0} y={86 + j * 48} fill="currentColor" fontSize={12}>
                <title>{y}</title>
                {rotuloEixoBi(y)}
              </text>
              {calor.colunas.map((x, i) => {
                const p = calor.celulas.get(JSON.stringify([x, y]));
                const descricao = `${x} | ${y}: ${p ? formatar(p.valor) : "Sem registro"}`;
                return (
                  <g key={x}>
                    <rect
                      x={140 + i * 64}
                      y={58 + j * 48}
                      width={60}
                      height={44}
                      rx={7}
                      fill={p && p.valor !== null ? cor : "var(--muted)"}
                      fillOpacity={
                        p && p.valor !== null
                          ? 0.15 + Math.max(0, p.valor / calor.maximo) * 0.85
                          : 1
                      }
                      stroke={p?.valor === null ? "var(--muted-foreground)" : "none"}
                      strokeDasharray={p?.valor === null ? "3 3" : undefined}
                      role={p ? "button" : "img"}
                      tabIndex={p ? 0 : undefined}
                      aria-label={descricao}
                      className="focus:stroke-foreground focus:stroke-2 focus:outline-none"
                      onClick={() => {
                        if (p) filtrar(p);
                      }}
                      onKeyDown={(e) => {
                        if (p && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          filtrar(p);
                        }
                      }}
                    >
                      <title>{descricao}</title>
                    </rect>
                    {config.mostrarValores && p && (
                      <text
                        x={170 + i * 64}
                        y={85 + j * 48}
                        textAnchor="middle"
                        fill="currentColor"
                        fontSize={11}
                        pointerEvents="none"
                        aria-hidden="true"
                      >
                        {p.valor === null ? "N/D" : formatar(p.valor)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {calor.omitidos > 0 && (
          <p className="text-muted-foreground mt-2 text-xs">
            Exibidos até 20 colunas e 12 linhas. {calor.omitidos} grupos adicionais na tabela e no
            CSV.
          </p>
        )}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
      {config.tipo === "rosca" ? (
        <PieChart>
          {tooltip}
          <Pie
            data={visiveis.filter((p) => p.valor !== null)}
            dataKey="valor"
            nameKey="nome"
            innerRadius="45%"
            outerRadius={config.mostrarValores ? "65%" : "75%"}
            label={config.mostrarValores ? (p) => formatar(p.value) : false}
            labelLine={config.mostrarValores}
            onClick={clique}
            isAnimationActive={false}
          >
            {visiveis
              .filter((p) => p.valor !== null)
              .map((p, i) => (
                <Cell key={`${p.referencia}:${p.nome}:${p.grupo}`} fill={cores[i % cores.length]} />
              ))}
          </Pie>
          {config.mostrarLegenda && (
            <Legend wrapperStyle={{ fontSize: 11, maxHeight: 80, overflowY: "auto" }} />
          )}
        </PieChart>
      ) : config.tipo === "dispersao" ? (
        <ScatterChart margin={{ top: 24, right: 24, bottom: 5, left: 0 }}>
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
            name={NOMES_MEDIDAS[config.medida]}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          {tooltip}
          <Scatter
            data={visiveis.filter((p) => p.valor !== null)}
            fill={cor}
            onClick={clique}
            isAnimationActive={false}
          >
            {valores}
          </Scatter>
        </ScatterChart>
      ) : config.tipo === "linha" ? (
        <LineChart
          data={visiveis}
          onClick={cliqueEixo}
          margin={{ top: 24, right: 24, bottom: 5, left: 0 }}
        >
          {base}
          <Line
            dataKey="valor"
            name={NOMES_MEDIDAS[config.medida]}
            stroke={cor}
            strokeWidth={2}
            dot={visiveis.length <= 30}
            connectNulls={false}
            activeDot={{ onClick: (_e, p) => clique(p) }}
            isAnimationActive={false}
          >
            {valores}
          </Line>
        </LineChart>
      ) : config.tipo === "area" ? (
        <AreaChart
          data={visiveis}
          onClick={cliqueEixo}
          margin={{ top: 24, right: 24, bottom: 5, left: 0 }}
        >
          {base}
          <Area
            dataKey="valor"
            name={NOMES_MEDIDAS[config.medida]}
            stroke={cor}
            fill={cor}
            fillOpacity={0.2}
            connectNulls={false}
            isAnimationActive={false}
          >
            {valores}
          </Area>
        </AreaChart>
      ) : config.tipo === "agrupadas" ? (
        <BarChart data={agrupados} margin={{ top: 24, right: 24, bottom: 5, left: 0 }}>
          {base}
          {config.mostrarLegenda && (
            <Legend wrapperStyle={{ fontSize: 11, maxHeight: 80, overflowY: "auto" }} />
          )}
          {grupos.map((g, i) => (
            <Bar
              key={g}
              dataKey={`grupo${i}`}
              name={g}
              fill={cores[i % cores.length]}
              radius={[5, 5, 0, 0]}
              onClick={clique}
              isAnimationActive={false}
            >
              {config.mostrarValores && (
                <LabelList
                  dataKey={`grupo${i}`}
                  position="top"
                  formatter={formatar}
                  fill="currentColor"
                  fontSize={11}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      ) : config.tipo === "horizontal" ? (
        <BarChart
          data={visiveis}
          layout="vertical"
          margin={{ top: 5, right: config.mostrarValores ? 65 : 24, bottom: 5, left: 0 }}
        >
          <CartesianGrid stroke="var(--border)" />
          <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis
            dataKey="nome"
            type="category"
            width={105}
            tickFormatter={rotuloEixoBi}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          {tooltip}
          <Bar
            dataKey="valor"
            name={NOMES_MEDIDAS[config.medida]}
            fill={cor}
            onClick={clique}
            radius={[0, 5, 5, 0]}
            isAnimationActive={false}
          >
            {config.mostrarValores && (
              <LabelList
                dataKey="valor"
                position="right"
                formatter={formatar}
                fill="currentColor"
                fontSize={11}
              />
            )}
          </Bar>
        </BarChart>
      ) : (
        <BarChart data={visiveis} margin={{ top: 24, right: 24, bottom: 5, left: 0 }}>
          {base}
          <Bar
            dataKey="valor"
            name={NOMES_MEDIDAS[config.medida]}
            fill={cor}
            radius={[5, 5, 0, 0]}
            onClick={clique}
            isAnimationActive={false}
          >
            {valores}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
