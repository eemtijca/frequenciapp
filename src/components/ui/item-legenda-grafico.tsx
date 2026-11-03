// Item de legenda de gráfico com ponto de cor, nome, detalhe e valores.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  cor: string;
  nome: string;
  detalhe?: ReactNode;
  children?: ReactNode;
  className?: string;
}

function ItemLegendaGrafico({ cor, nome, detalhe, children, className }: Props) {
  return (
    <li
      className={cn(
        "superficie-interna flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5 text-sm",
        className,
      )}
    >
      <span className="flex min-w-24 flex-1 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: cor }}
        />
        <span className="min-w-0 flex-1 break-words">
          {nome}
          {detalhe}
        </span>
      </span>
      {children ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">{children}</span>
      ) : null}
    </li>
  );
}

export { ItemLegendaGrafico };
