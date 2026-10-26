"use client";

// Rótulo passivo com o horário da última leitura bem-sucedida da visão.
import { Clock3 } from "lucide-react";
import { horaNoFuso } from "@/domain/frequencia";
import { useAtualizadoEm } from "@/components/atualizacao/contexto-atualizacao";
import { cn } from "@/lib/utils";

interface Props {
  instante?: string;
  fuso: string;
  className?: string;
}

function dataCurta(instante: string, fuso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: fuso,
    }).format(new Date(instante));
  } catch {
    return "";
  }
}

export function AtualizadoEm({ instante, fuso, className }: Props) {
  const hora = instante ? horaNoFuso(instante, fuso) : "";
  const data = instante ? dataCurta(instante, fuso) : "";
  const hoje = dataCurta(new Date().toISOString(), fuso);
  const texto = hora ? `Atualizado às ${hora}` : "Ainda não atualizado";
  const titulo = hora && data && data !== hoje ? `Atualizado em ${data} às ${hora}` : texto;
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1 text-xs whitespace-nowrap",
        className,
      )}
      title={titulo}
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
