"use client";

// Construtor de análises com medidas e dimensões compatíveis, metas e anotações locais.
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Selecionar } from "@/components/ui/selecionar";
import { Switch } from "@/components/ui/switch";
import {
  BASES_ANALISE,
  dimensoesRecursoBi,
  medidasRecursoBi,
  NOMES_DIMENSOES,
  NOMES_MEDIDAS,
  PALETAS_GRAFICO_BI,
  TIPOS_GRAFICO_BI,
  type GraficoBi,
} from "@/domain/bi-analise";
import { ROTULOS_RECURSOS_BI, type RecursoBi } from "@/domain/bi";
const TIPOS: Record<GraficoBi["tipo"], string> = {
  barras: "Barras",
  horizontal: "Barras horizontais",
  agrupadas: "Barras agrupadas",
  linha: "Linha",
  area: "Área",
  rosca: "Rosca",
  dispersao: "Dispersão",
  calor: "Mapa de calor",
  tabela: "Tabela detalhada",
  indicador: "Indicadores",
};
const PALETAS: Record<GraficoBi["paleta"], string> = {
  escola: "Padrão da escola",
  verde: "Verde",
  azul: "Azul",
  vermelho: "Vermelho",
  violeta: "Violeta",
};
export function EditorGraficoBi({
  config,
  onAlterar,
  recursos,
}: {
  config: GraficoBi;
  onAlterar: (g: GraficoBi) => void;
  recursos: RecursoBi[];
}) {
  const id = useId();
  const visual = !["tabela", "indicador"].includes(config.tipo);
  const largura = Math.round((config.largura / 12) * 100);
  const campo = (
    nome: string,
    value: string,
    opcoes: { valor: string; rotulo: string }[],
    alterar: (v: string) => void,
  ) => (
    <div className="min-w-0">
      <Label htmlFor={`${id}-${nome}`} className="mb-1 block text-xs">
        {nome}
      </Label>
      <Selecionar
        id={`${id}-${nome}`}
        ariaLabel={nome}
        value={value}
        opcoes={opcoes}
        onValueChange={alterar}
      />
    </div>
  );
  return (
    <section className="superficie p-4 print:hidden" aria-label="Construtor de gráficos">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor={`${id}-titulo`}>Título da análise</Label>
          <Input
            id={`${id}-titulo`}
            value={config.titulo}
            maxLength={100}
            aria-invalid={!config.titulo.trim()}
            aria-describedby={!config.titulo.trim() ? `${id}-titulo-erro` : undefined}
            onChange={(e) => onAlterar({ ...config, titulo: e.target.value })}
          />
          {!config.titulo.trim() && (
            <p id={`${id}-titulo-erro`} role="alert" className="text-falta-texto mt-1 text-xs">
              Informe um título para a análise.
            </p>
          )}
        </div>
        {campo(
          "Base",
          config.recurso,
          BASES_ANALISE.filter((r) => recursos.includes(r)).map((r) => ({
            valor: r,
            rotulo: ROTULOS_RECURSOS_BI[r],
          })),
          (r) => {
            const recurso = r as GraficoBi["recurso"];
            const dimensoes = dimensoesRecursoBi(recurso);
            const medidas = medidasRecursoBi(recurso);
            const dimensao = dimensoes.includes(config.dimensao)
              ? config.dimensao
              : (dimensoes[0] ?? "dia");
            onAlterar({
              ...config,
              recurso,
              medida: medidas.includes(config.medida) ? config.medida : "registros",
              dimensao,
              segundaDimensao: dimensoes.includes(config.segundaDimensao)
                ? config.segundaDimensao
                : (dimensoes.find((d) => d !== dimensao) ?? dimensao),
            });
          },
        )}
        {campo(
          "Dimensão",
          config.dimensao,
          dimensoesRecursoBi(config.recurso).map((d) => ({ valor: d, rotulo: NOMES_DIMENSOES[d] })),
          (d) => onAlterar({ ...config, dimensao: d as GraficoBi["dimensao"] }),
        )}
        {campo(
          "Medida",
          config.medida,
          medidasRecursoBi(config.recurso).map((m) => ({ valor: m, rotulo: NOMES_MEDIDAS[m] })),
          (m) => onAlterar({ ...config, medida: m as GraficoBi["medida"] }),
        )}
        {campo(
          "Visualização",
          config.tipo,
          TIPOS_GRAFICO_BI.map((t) => ({ valor: t, rotulo: TIPOS[t] })),
          (t) =>
            onAlterar({
              ...config,
              tipo: t as GraficoBi["tipo"],
              segundaDimensao: dimensoesRecursoBi(config.recurso).includes(config.segundaDimensao)
                ? config.segundaDimensao
                : (dimensoesRecursoBi(config.recurso)[0] ?? "dia"),
            }),
        )}
        {["agrupadas", "calor"].includes(config.tipo) &&
          campo(
            "Segunda dimensão",
            config.segundaDimensao,
            dimensoesRecursoBi(config.recurso).map((d) => ({
              valor: d,
              rotulo: NOMES_DIMENSOES[d],
            })),
            (d) => onAlterar({ ...config, segundaDimensao: d as GraficoBi["dimensao"] }),
          )}
        <div>
          <Label htmlFor={`${id}-meta`} className="mb-1 block text-xs">
            Meta ou limiar
          </Label>
          <Input
            id={`${id}-meta`}
            type="number"
            step="any"
            value={config.meta ?? ""}
            onChange={(e) =>
              onAlterar({ ...config, meta: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer py-2 text-sm">Aparência e tamanho</summary>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visual &&
            campo(
              "Paleta de cores",
              config.paleta,
              PALETAS_GRAFICO_BI.map((p) => ({ valor: p, rotulo: PALETAS[p] })),
              (p) => onAlterar({ ...config, paleta: p as GraficoBi["paleta"] }),
            )}
          {visual && (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label htmlFor={`${id}-valores`}>Mostrar valores</Label>
              <Switch
                id={`${id}-valores`}
                checked={config.mostrarValores}
                onCheckedChange={(mostrarValores) => onAlterar({ ...config, mostrarValores })}
              />
            </div>
          )}
          {["rosca", "agrupadas", "calor"].includes(config.tipo) && (
            <div className="flex min-h-11 items-center justify-between gap-3">
              <Label htmlFor={`${id}-legenda`}>Mostrar legenda</Label>
              <Switch
                id={`${id}-legenda`}
                checked={config.mostrarLegenda}
                onCheckedChange={(mostrarLegenda) => onAlterar({ ...config, mostrarLegenda })}
              />
            </div>
          )}
          <div className="min-w-0">
            <Label htmlFor={`${id}-largura`} className="flex justify-between gap-2">
              Largura no painel <span className="tabular-nums">{largura}%</span>
            </Label>
            <input
              id={`${id}-largura`}
              type="range"
              min={3}
              max={12}
              step={1}
              value={config.largura}
              aria-valuetext={`${largura}% da linha no desktop`}
              aria-describedby={`${id}-largura-ajuda`}
              className="accent-primary focus-visible:ring-ring/50 min-h-11 w-full cursor-pointer rounded-md focus-visible:ring-2"
              onChange={(e) => onAlterar({ ...config, largura: Number(e.target.value) })}
            />
            <p id={`${id}-largura-ajuda`} className="text-muted-foreground text-xs">
              No celular, ocupa toda a largura.
            </p>
          </div>
          <div className="min-w-0">
            <Label htmlFor={`${id}-altura`} className="flex justify-between gap-2">
              Altura do gráfico <span className="tabular-nums">{config.altura} px</span>
            </Label>
            <input
              id={`${id}-altura`}
              type="range"
              min={260}
              max={900}
              step={1}
              value={config.altura}
              aria-valuetext={`${config.altura} pixels`}
              className="accent-primary focus-visible:ring-ring/50 min-h-11 w-full cursor-pointer rounded-md focus-visible:ring-2"
              onChange={(e) => onAlterar({ ...config, altura: Number(e.target.value) })}
            />
          </div>
        </div>
      </details>
      <details className="mt-3">
        <summary className="cursor-pointer py-2 text-sm">Anotação local</summary>
        <textarea
          aria-label="Anotação do gráfico"
          className="controle mt-2 min-h-20 w-full p-3 text-sm"
          maxLength={1000}
          value={config.anotacao}
          onChange={(e) => onAlterar({ ...config, anotacao: e.target.value })}
        />
      </details>
    </section>
  );
}
