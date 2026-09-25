"use client";

// Seletor de tema com as três opções: sistema, claro e escuro.
import { useSyncExternalStore } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const OPCOES = [
  { valor: "system", rotulo: "Sistema", Icone: Monitor },
  { valor: "light", rotulo: "Claro", Icone: Sun },
  { valor: "dark", rotulo: "Escuro", Icone: Moon },
] as const;

/**
 * Configuração da grade de aulas (aulas por turma) chega na Fase 5; este
 * componente cuida apenas da preferência de tema do dispositivo.
 */
export function SeletorTema({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // O tema só é conhecido depois da montagem: evita divergência de hidratação.
  const montado = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const atual = OPCOES.find((opcao) => opcao.valor === theme) ?? OPCOES[0];
  const IconeAtual = atual.Icone;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-11", className)}
          aria-label={montado ? `Tema: ${atual.rotulo}. Alterar tema` : "Alterar tema"}
        >
          {montado ? <IconeAtual size={18} /> : <Monitor size={18} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44">
        <div role="radiogroup" aria-label="Tema do aplicativo" className="flex flex-col">
          {OPCOES.map(({ valor, rotulo, Icone }) => {
            const ativo = montado ? theme === valor : valor === "system";
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setTheme(valor)}
                className="hover:bg-accent flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm font-medium transition-colors"
              >
                <Icone size={16} aria-hidden="true" />
                {rotulo}
                {ativo && <Check size={15} className="text-primary ml-auto" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
