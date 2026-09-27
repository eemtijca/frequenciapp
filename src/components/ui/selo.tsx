"use client";

// Selo curto de status, usado nos resumos das seções de configuração.
import type { ReactNode } from "react";

export type VarianteSelo = "neutro" | "sucesso" | "atencao" | "perigo";

const CLASSES: Record<VarianteSelo, string> = {
  neutro: "bg-secondary text-secondary-foreground",
  sucesso: "bg-primary/10 text-primary",
  atencao: "bg-falta-fraca text-falta-texto",
  perigo: "bg-falta text-falta-foreground",
};

export function Selo({
  variante = "neutro",
  children,
}: {
  variante?: VarianteSelo;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium ${CLASSES[variante]}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
