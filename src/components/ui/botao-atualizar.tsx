"use client";

// Botão único de atualização, com o mesmo acabamento nos cabeçalhos e nas
// páginas que não usam o shell principal, como FrequenciBI e Minhas turmas.
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useContextoAtualizacao } from "@/components/atualizacao/contexto-atualizacao";

export interface BotaoAtualizarProps {
  onAtualizar?: () => Promise<void> | void;
  ocupado?: boolean;
  disponivel?: boolean;
  className?: string;
  rotulo?: string;
  /** Variante e tamanho do botão; o padrão é o ícone dos cabeçalhos. */
  variante?: ComponentProps<typeof Button>["variant"];
  tamanho?: ComponentProps<typeof Button>["size"];
  /** Mostra o rótulo ao lado do ícone a partir do breakpoint sm. */
  comRotulo?: boolean;
}

export function BotaoAtualizar({
  onAtualizar,
  ocupado,
  disponivel,
  className,
  rotulo = "Atualizar tela",
  variante = "ghost",
  tamanho = "icon",
  comRotulo = false,
}: BotaoAtualizarProps) {
  const contexto = useContextoAtualizacao();
  const executar = onAtualizar ?? contexto?.atualizar;
  const carregando = ocupado ?? contexto?.ocupado ?? false;
  const ativo = disponivel ?? contexto?.disponivel ?? Boolean(onAtualizar);

  return (
    <Button
      type="button"
      variant={variante}
      size={tamanho}
      className={cn("shrink-0 rounded-full", comRotulo ? "w-auto px-3" : "size-11", className)}
      aria-label={rotulo}
      title={ativo ? rotulo : "Atualização indisponível nesta tela"}
      disabled={!ativo || carregando}
      onClick={() => void executar?.()}
    >
      {carregando ? (
        <LoaderCircle size={19} className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw size={19} aria-hidden="true" />
      )}
      {comRotulo && <span className="hidden sm:inline">{rotulo}</span>}
    </Button>
  );
}
