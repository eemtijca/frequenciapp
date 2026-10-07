"use client";

// Seletor acessível: listas simples sobre Radix Select e busca em painel próprio.
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { SelecionarBuscavel } from "@/components/ui/selecionar-buscavel";
import { cn } from "@/lib/utils";

interface Opcao {
  valor: string;
  rotulo: string;
}

export interface PropsSelecionar {
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
}: PropsSelecionar) {
  if (buscavel)
    return (
      <SelecionarBuscavel
        id={id}
        value={value}
        onValueChange={onValueChange}
        opcoes={opcoes}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        ariaLabel={ariaLabel}
      />
    );

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "controle-vidro border-input focus-visible:border-ring focus-visible:ring-ring/50 pressionavel flex h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate",
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
          className="superficie-vidro vidro-flutuante text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 relative z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {opcoes.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-center text-sm">
                Nenhuma opção encontrada.
              </p>
            ) : (
              opcoes.map((opcao) => (
                <SelectPrimitive.Item
                  key={opcao.valor}
                  value={opcao.valor}
                  className={cn(
                    "pressionavel focus-visible:ring-ring/50 relative flex min-h-11 w-full cursor-pointer items-center py-1.5 pr-8 pl-8 text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-inset data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    opcao.valor === value ? "vidro-selecionado" : "vidro-discreto",
                  )}
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
