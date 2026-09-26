"use client";

// Barra de busca padrão das listas: ícone, campo rotulado e limpar.
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  valor: string;
  onValor: (valor: string) => void;
  placeholder: string;
  rotulo?: string;
  className?: string;
}

export function BarraBusca({
  id,
  valor,
  onValor,
  placeholder,
  rotulo = placeholder,
  className,
}: Props) {
  return (
    <div className={cn("bg-card flex items-center gap-2 rounded-lg border px-3 py-1", className)}>
      <Search size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <Input
        id={id}
        type="search"
        value={valor}
        onChange={(evento) => onValor(evento.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      {valor && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onValor("")}
          className="text-muted-foreground hover:bg-secondary pressionavel flex size-11 shrink-0 items-center justify-center rounded-md"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
