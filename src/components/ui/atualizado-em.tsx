"use client";

// Rótulo passivo com data e hora da última leitura bem-sucedida da visão.
import { Clock3 } from "lucide-react";
import { dataNoFuso, horaNoFuso } from "@/domain/frequencia";
import { useAtualizadoEm } from "@/components/atualizacao/contexto-atualizacao";
import { cn } from "@/lib/utils";

interface Props {
  instante?: string;
  fuso: string;
  className?: string;
}

export function AtualizadoEm({ instante, fuso, className }: Props) {
  const hora = instante ? horaNoFuso(instante, fuso) : "";
  const data = instante ? dataNoFuso(instante, fuso) : "";
  const texto = hora && data ? `Atualizado em ${data} às ${hora}` : "Ainda não atualizado";
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 text-xs whitespace-nowrap",
        className,
      )}
      title={texto}
    >
      <Clock3 size={13} aria-hidden="true" className="shrink-0" />
      {texto}
    </span>
  );
}

/** Versão conectada ao shell principal, que lê a visão ativa. */
export function AtualizadoDaVisao({ fuso, className }: { fuso: string; className?: string }) {
  const instante = useAtualizadoEm();
  return <AtualizadoEm instante={instante} fuso={fuso} className={className} />;
}
