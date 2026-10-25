"use client";

// Cabeçalho de etapa dos cards de planilha: número quando pendente, check
// quando concluída, com resumo e ações ao lado.
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type EstadoEtapa = "pendente" | "atual" | "concluida";

export function EtapaPlanilha({
  numero,
  titulo,
  estado,
  resumo,
  acoes,
  children,
}: {
  numero: number;
  titulo: string;
  estado: EstadoEtapa;
  resumo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const concluida = estado === "concluida";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              concluida
                ? "bg-primary/10 text-primary"
                : estado === "atual"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
            }`}
          >
            {concluida ? <Check size={14} /> : numero}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p
              className={`text-sm font-medium ${
                estado === "pendente" ? "text-muted-foreground" : ""
              }`}
            >
              {titulo}
            </p>
            {resumo && (
              <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                {resumo}
              </div>
            )}
          </div>
        </div>
        {acoes && (
          <div className="flex flex-wrap items-center gap-2 pl-9 sm:shrink-0 sm:pl-0">{acoes}</div>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:pl-9">{children}</div>
    </div>
  );
}
