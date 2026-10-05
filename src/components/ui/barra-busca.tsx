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
    <div
      className={cn(
        "controle-vidro focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 px-3 py-1 focus-within:ring-[3px]",
        className,
      )}
    >
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
        className="campo-integrado h-9 px-0 focus-visible:ring-0"
      />
      {valor && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onValor("")}
          className="vidro-discreto text-muted-foreground focus-visible:ring-ring/50 pressionavel flex size-11 shrink-0 items-center justify-center focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
