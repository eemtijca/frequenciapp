"use client";

// Campo de formulário com rótulo, contador, descrição e erro no mesmo padrão.
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  rotulo: string;
  children: ReactNode;
  descricao?: string;
  erro?: string;
  contador?: string;
  className?: string;
}

function Campo({ id, rotulo, children, descricao, erro, contador, className }: Props) {
  const idDescricao = `${id}-descricao`;
  const idErro = `${id}-erro`;

  return (
    <div data-slot="campo-formulario" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Label htmlFor={id}>{rotulo}</Label>
        {contador ? (
          <span className="text-muted-foreground numerais-tabulares shrink-0 text-xs">
            {contador}
          </span>
        ) : null}
      </div>
      {children}
      {descricao ? (
        <p id={idDescricao} className="text-muted-foreground text-xs">
          {descricao}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} role="alert" className="text-falta-texto text-xs">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export { Campo };
