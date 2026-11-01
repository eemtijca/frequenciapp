"use client";

// Navegação por tarefa, preservando os formulários ao alternar a área.
import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PainelAcoes({
  rotulo,
  valor,
  onValor,
  itens,
}: {
  rotulo: string;
  valor: string;
  onValor: (valor: string) => void;
  itens: { valor: string; rotulo: string; icone: LucideIcon; conteudo: ReactNode }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav
        aria-label={rotulo}
        className={`grid gap-2 ${
          itens.length > 3
            ? "grid-cols-2 sm:grid-cols-4"
            : itens.length === 3
              ? "grid-cols-3"
              : "grid-cols-2"
        }`}
      >
        {itens.map(({ valor: chave, rotulo: titulo, icone: Icone }) => (
          <Button
            key={chave}
            id={`${id}-acao-${chave}`}
            type="button"
            variant="secondary"
            aria-pressed={valor === chave}
            aria-controls={`${id}-painel-${chave}`}
            onClick={() => onValor(chave)}
            className="h-auto min-h-16 min-w-0 flex-1 flex-col gap-1 px-1 py-2 text-xs whitespace-normal sm:flex-row sm:gap-2 sm:text-sm"
          >
            <Icone size={18} aria-hidden="true" />
            <span className="max-w-full min-w-0 text-center wrap-anywhere">{titulo}</span>
          </Button>
        ))}
      </nav>
      {itens.map((item) => (
        <section
          key={item.valor}
          id={`${id}-painel-${item.valor}`}
          aria-labelledby={`${id}-acao-${item.valor}`}
          hidden={valor !== item.valor}
          inert={valor !== item.valor}
          className="flex min-w-0 flex-col gap-4"
        >
          {item.conteudo}
        </section>
      ))}
    </div>
  );
}
