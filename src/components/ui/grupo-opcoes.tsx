"use client";

// Grupo de opções exclusivas em pílulas, com teclado e estado selecionado compartilhados.
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface OpcaoGrupo<T extends string> {
  valor: T;
  rotulo: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  rotulo: string;
  valor: T;
  opcoes: OpcaoGrupo<T>[];
  onValor: (valor: T) => void;
  disabled?: boolean;
  className?: string;
}

function GrupoOpcoes<T extends string>({
  rotulo,
  valor,
  opcoes,
  onValor,
  disabled = false,
  className,
}: Props<T>) {
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    const atual = opcoes.findIndex((opcao) => opcao.valor === valor);
    let proximo: number | null = null;
    if (evento.key === "ArrowRight" || evento.key === "ArrowDown") proximo = atual + 1;
    else if (evento.key === "ArrowLeft" || evento.key === "ArrowUp") proximo = atual - 1;
    else if (evento.key === "Home") proximo = 0;
    else if (evento.key === "End") proximo = opcoes.length - 1;
    else return;
    evento.preventDefault();
    if (proximo === null || opcoes.length === 0) return;
    const indice = (proximo + opcoes.length) % opcoes.length;
    const opcao = opcoes[indice];
    if (!opcao || opcao.disabled) return;
    onValor(opcao.valor);
    botoes.current[indice]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className={cn("flex flex-wrap gap-2", className)}
      onKeyDown={aoTeclar}
    >
      {opcoes.map((opcao, indice) => {
        const selecionada = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            ref={(elemento) => {
              botoes.current[indice] = elemento;
            }}
            type="button"
            role="radio"
            aria-checked={selecionada}
            tabIndex={selecionada ? 0 : -1}
            disabled={disabled || opcao.disabled}
            onClick={() => onValor(opcao.valor)}
            className={cn(
              "pressionavel flex h-11 items-center px-4 text-sm font-medium transition-colors",
              selecionada ? "selecionado" : "controle",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export { GrupoOpcoes };
