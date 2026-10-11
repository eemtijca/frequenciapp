"use client";

// Construtor de análises com medidas e dimensões compatíveis, metas e anotações locais.
import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Selecionar } from "@/components/ui/selecionar";
import {
  BASES_ANALISE,
  dimensoesRecursoBi,
  medidasRecursoBi,
  NOMES_DIMENSOES,
  NOMES_MEDIDAS,
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
    <section className="superficie-vidro p-4 print:hidden" aria-label="Construtor de gráficos">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="col-span-2 lg:col-span-3">
          <Label htmlFor={`${id}-titulo`}>Título da análise</Label>
          <Input
            id={`${id}-titulo`}
            value={config.titulo}
            maxLength={100}
            onChange={(e) => onAlterar({ ...config, titulo: e.target.value })}
          />
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
            onAlterar({
              ...config,
              recurso,
              medida: "registros",
              dimensao: dimensoes.includes(config.dimensao)
                ? config.dimensao
                : (dimensoes[0] ?? "dia"),
              segundaDimensao: dimensoes[0] ?? "dia",
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
        <summary className="cursor-pointer text-sm">Anotação local</summary>
        <textarea
          aria-label="Anotação do gráfico"
          className="controle-vidro mt-2 min-h-20 w-full p-3 text-sm"
          maxLength={1000}
          value={config.anotacao}
          onChange={(e) => onAlterar({ ...config, anotacao: e.target.value })}
        />
      </details>
    </section>
  );
}
