"use client";

// Limites de carregamento dos gráficos: código separado e espaço reservado por visualização.
import { lazy, type ComponentProps } from "react";
import GraficoSobDemanda from "./grafico-sob-demanda";

const Rosca = lazy(() => import("@/components/painel/grafico-rosca"));
const Alunos = lazy(() => import("@/components/diretor/grafico-alunos"));
const Semanas = lazy(() => import("@/components/diretor/grafico-semanas"));
const Evolucao = lazy(() => import("@/components/relatorios/grafico-evolucao"));

function Espera({ altura }: { altura: number }) {
  return (
    <div
      role="status"
      className="text-muted-foreground flex items-center justify-center rounded-2xl border border-dashed text-sm"
      style={{ height: altura }}
    >
      Carregando gráfico
    </div>
  );
}

export function GraficoRosca(props: ComponentProps<typeof Rosca>) {
  const fatias = props.fatias.filter((fatia) => fatia.valor > 0);
  if (fatias.length === 0)
    return (
      <div className="superficie-vidro text-muted-foreground flex min-h-40 items-center justify-center border-dashed px-4 text-center text-sm shadow-none">
        {props.vazio ?? "Nenhuma falta registrada"}
      </div>
    );
  const espera = (
    <div role="status" className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="text-muted-foreground flex size-44 shrink-0 items-center justify-center rounded-full border-8 text-center text-sm">
        Carregando gráfico
      </div>
      <div aria-hidden="true" className="w-full min-w-0 flex-1 space-y-1.5">
        {fatias.map((fatia) => (
          <div key={fatia.nome} className="bg-muted/40 h-16 rounded-xl border" />
        ))}
      </div>
    </div>
  );
  return (
    <GraficoSobDemanda espera={espera}>
      <Rosca {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoAlunos(props: ComponentProps<typeof Alunos>) {
  return (
    <GraficoSobDemanda espera={<Espera altura={props.alunos.length * 30 + 80} />}>
      <Alunos {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoSemanas(props: ComponentProps<typeof Semanas>) {
  return (
    <GraficoSobDemanda espera={<Espera altura={256} />}>
      <Semanas {...props} />
    </GraficoSobDemanda>
  );
}
export function GraficoEvolucao(props: ComponentProps<typeof Evolucao>) {
  return (
    <div className="mt-4">
      <GraficoSobDemanda espera={<Espera altura={256} />}>
        <Evolucao {...props} />
      </GraficoSobDemanda>
    </div>
  );
}
