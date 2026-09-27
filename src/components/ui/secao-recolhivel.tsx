"use client";

// Seção recolhível com resumo no cabeçalho, sobre o Radix Collapsible. O
// gatilho cobre só o título; as ações ficam fora para não abrir sem querer.
import type { ReactNode } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, type LucideIcon } from "lucide-react";

interface Props {
  titulo: string;
  descricao?: string;
  icone: LucideIcon;
  resumo?: ReactNode;
  /** Ações fora do gatilho, como o switch de integração ativa. */
  acoes?: ReactNode;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  variante?: "normal" | "perigo";
  /** Interna fica dentro de outra seção e usa fundo transparente. */
  nivel?: "raiz" | "interna";
  /** Marca o contêiner para os testes de ponta a ponta. */
  dataSecao?: string;
  children: ReactNode;
}

export function SecaoRecolhivel({
  titulo,
  descricao,
  icone: Icone,
  resumo,
  acoes,
  aberto,
  onAbertoChange,
  variante = "normal",
  nivel = "raiz",
  dataSecao,
  children,
}: Props) {
  const perigo = variante === "perigo";
  return (
    <Collapsible.Root
      open={aberto}
      onOpenChange={onAbertoChange}
      data-secao={dataSecao}
      className={`flex flex-col rounded-lg border ${nivel === "raiz" ? "bg-card" : "bg-transparent"} ${
        perigo ? "border-falta/40" : ""
      }`}
    >
      <div className="flex items-start gap-2 p-3 sm:p-4">
        <Collapsible.Trigger className="pressionavel focus-visible:ring-ring/50 flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px]">
          <span
            className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
              perigo ? "bg-falta-fraca text-falta-texto" : "bg-secondary text-secondary-foreground"
            }`}
          >
            <Icone size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={`min-w-0 truncate font-medium ${perigo ? "text-falta-texto" : ""}`}>
                {titulo}
              </span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`text-muted-foreground shrink-0 transition-transform motion-reduce:transition-none ${
                  aberto ? "rotate-180" : ""
                }`}
              />
            </span>
            {descricao && (
              <span className="text-muted-foreground mt-0.5 block text-sm">{descricao}</span>
            )}
            {resumo && <span className="mt-2 flex flex-wrap items-center gap-1.5">{resumo}</span>}
          </span>
        </Collapsible.Trigger>
        {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
      </div>
      <Collapsible.Content role="region" aria-label={titulo} className="flex flex-col">
        <div className="flex flex-col gap-4 border-t px-3 pt-4 pb-4 sm:px-4">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
