"use client";

// Seletor nativo estilizado: em mobile abre o seletor do próprio
// aparelho, que é o caminho mais curto para o administrador.
import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Opcao {
  valor: string;
  rotulo: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  opcoes: Opcao[];
}

const Selecionar = forwardRef<HTMLSelectElement, Props>(function Selecionar(
  { className, opcoes, ...propriedades },
  referencia,
) {
  return (
    <div className="relative">
      <select
        ref={referencia}
        className={cn(
          "border-input bg-background text-foreground focus-visible:ring-ring h-11 w-full appearance-none rounded-lg border px-3 pr-9 text-sm font-medium shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...propriedades}
      >
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
      />
    </div>
  );
});

export { Selecionar };
