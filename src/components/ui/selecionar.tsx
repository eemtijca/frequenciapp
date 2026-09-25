"use client";

// Seletor acessível sobre o Radix: teclado, indicador de seleção, rolagem
// com botões e filtro opcional para listas longas. Substitui o select nativo.
import { useMemo, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { normalizar } from "@/domain/frequencia";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Opcao {
  valor: string;
  rotulo: string;
}

interface Props {
  id?: string;
  value: string;
  onValueChange: (valor: string) => void;
  opcoes: Opcao[];
  placeholder?: string;
  disabled?: boolean;
  buscavel?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Selecionar({
  id,
  value,
  onValueChange,
  opcoes,
  placeholder = "Selecione",
  disabled = false,
  buscavel = false,
  className,
  ariaLabel,
}: Props) {
  const [termo, setTermo] = useState("");
  const filtradas = useMemo(() => {
    if (!buscavel || termo.trim() === "") return opcoes;
    const alvo = normalizar(termo);
    return opcoes.filter((opcao) => normalizar(opcao.rotulo).includes(alvo));
  }, [buscavel, opcoes, termo]);

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium shadow-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 relative z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border shadow-md"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          {buscavel && (
            <div className="flex items-center gap-2 border-b px-2.5 py-1">
              <Search size={14} className="text-muted-foreground" aria-hidden="true" />
              <Input
                value={termo}
                onChange={(evento) => setTermo(evento.target.value)}
                onKeyDown={(evento) => evento.stopPropagation()}
                placeholder="Filtrar"
                aria-label="Filtrar opções"
                className="h-8 border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
            </div>
          )}
          <SelectPrimitive.Viewport className="p-1">
            {filtradas.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-center text-sm">
                Nenhuma opção encontrada.
              </p>
            ) : (
              filtradas.map((opcao) => (
                <SelectPrimitive.Item
                  key={opcao.valor}
                  value={opcao.valor}
                  className="focus:bg-accent focus:text-accent-foreground relative flex min-h-10 w-full cursor-pointer items-center rounded-md py-1.5 pr-8 pl-8 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2 flex size-4 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check size={14} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{opcao.rotulo}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
