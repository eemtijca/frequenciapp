"use client";

// Componentes visuais compartilhados pelos resumos semanais das quatro telas.
import type { ReactNode } from "react";
import { CalendarDays, ChevronRight, type LucideIcon } from "lucide-react";
import { rotuloData, rotuloDataCurta } from "@/domain/frequencia";
import { AtualizadoEm } from "@/components/ui/atualizado-em";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";

export function CabecalhoResumo({
  dias,
  domingo,
  atualizadoEm,
  fuso,
  titulo = "Resumo da semana",
  descricao,
}: {
  dias: readonly string[];
  domingo?: string | null;
  atualizadoEm?: string | null;
  fuso: string;
  titulo?: string;
  descricao?: string;
}) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="controle text-secondary-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center">
          <CalendarDays size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {de && ate ? `${rotuloDataCurta(de)} a ${rotuloDataCurta(ate)}` : ""}
            {domingo ? `, encerrada em ${rotuloData(domingo)}` : ""}
          </p>
          {descricao && <p className="text-muted-foreground text-xs">{descricao}</p>}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-col items-start gap-1 sm:w-auto sm:items-end">
        <span className="shrink-0">
          <Selo>Somente leitura</Selo>
        </span>
        <AtualizadoEm instante={atualizadoEm ?? undefined} fuso={fuso} />
      </div>
    </header>
  );
}

export function CorpoResumo({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 border-t px-3 pt-4 pb-4 sm:px-4">{children}</div>;
}

export function SecaoResumo({
  id,
  titulo,
  descricao,
  icone,
  resumo,
  aberto,
  onAbertoChange,
  nivel = "interna",
  children,
}: {
  id: string;
  titulo: string;
  descricao?: string;
  icone: LucideIcon;
  resumo?: ReactNode;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  nivel?: "raiz" | "interna";
  children: ReactNode;
}) {
  return (
    <SecaoRecolhivel
      dataSecao={`resumo-${id}`}
      titulo={titulo}
      descricao={descricao}
      icone={icone}
      resumo={resumo}
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      nivel={nivel}
    >
      {aberto ? children : null}
    </SecaoRecolhivel>
  );
}

const TONS = {
  salva: "border-primary/30 bg-primary/10 text-primary",
  pendente: "border-alerta/40 bg-alerta-fraca text-alerta-texto",
  falta: "border-falta/40 bg-falta-fraca text-falta-texto",
  ajuste: "border-justificada/40 bg-justificada-fraca text-justificada-texto",
  registrado: "border-primary/30 bg-primary/10 text-primary",
  neutro: "border-border bg-secondary text-muted-foreground",
} as const;

export type TomCartaoDia = keyof typeof TONS;

export function CartaoDia({
  dia,
  rotulo,
  status,
  tom,
  contagens,
  detalhe,
  abrir,
  onAbrir,
  ariaLabel,
}: {
  dia: string;
  rotulo: string;
  status: string;
  tom: TomCartaoDia;
  contagens?: ReactNode;
  detalhe?: string;
  abrir: boolean;
  onAbrir?: () => void;
  ariaLabel: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide uppercase">{rotulo}</p>
          <p className="text-muted-foreground text-xs">{rotuloDataCurta(dia)}</p>
        </div>
        {abrir && <ChevronRight size={15} aria-hidden="true" className="text-muted-foreground" />}
      </div>
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] leading-tight font-medium",
          TONS[tom],
        )}
      >
        {status}
      </span>
      <div className="mt-auto flex min-h-8 flex-wrap items-center gap-1.5">
        {contagens ?? <span className="text-muted-foreground text-xs">Sem registro</span>}
      </div>
      {detalhe && <p className="text-muted-foreground text-[11px]">{detalhe}</p>}
    </>
  );

  if (abrir)
    return (
      <li>
        <button
          type="button"
          onClick={onAbrir}
          aria-label={ariaLabel}
          data-dia={dia}
          className="controle pressionavel focus-visible:ring-ring/50 flex min-h-32 w-full flex-col gap-2 rounded-[14px] p-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
        >
          {conteudo}
        </button>
      </li>
    );
  return (
    <li>
      <div
        role="group"
        aria-label={ariaLabel}
        data-dia={dia}
        className="bg-secondary/40 text-muted-foreground flex min-h-32 flex-col gap-2 rounded-[14px] border p-3"
      >
        {conteudo}
      </div>
    </li>
  );
}

export function BarrasDia({
  dias,
  unidade,
  titulo,
}: {
  dias: { dia: string; rotulo: string; valor: number }[];
  unidade: [singular: string, plural: string];
  titulo: string;
}) {
  const maior = Math.max(1, ...dias.map((item) => item.valor));
  const total = dias.reduce((soma, item) => soma + item.valor, 0);
  const resumo = dias
    .map((item) => `${item.rotulo}: ${item.valor} ${item.valor === 1 ? unidade[0] : unidade[1]}`)
    .join("; ");
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-muted-foreground text-xs">
        {titulo}: {total} {total === 1 ? unidade[0] : unidade[1]} na semana
      </figcaption>
      <ul
        role="img"
        aria-label={`${titulo}. ${resumo}.`}
        className="grid grid-cols-3 gap-2 sm:grid-cols-6"
      >
        {dias.map((item) => (
          <li key={item.dia} className="flex min-w-0 flex-col items-center gap-1">
            <div className="bg-secondary flex h-24 w-full items-end overflow-hidden rounded-lg">
              <div
                aria-hidden="true"
                className="bg-primary w-full rounded-t-lg"
                style={{ height: `${Math.max(4, (item.valor / maior) * 100)}%` }}
              />
            </div>
            <span className="text-muted-foreground text-[11px]">{item.rotulo}</span>
            <span className="numerais-tabulares text-xs font-semibold">{item.valor}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function ResumoVazio({ texto }: { texto: string }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <CalendarDays size={16} aria-hidden="true" />
      {texto}
    </p>
  );
}

export { TONS };
