"use client";

// Seletor de ano em popover: grade de anos, navegação por bloco e teclado.
import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  valor: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  rotuloAcessivel: string;
  onValor: (valor: string) => void;
}

const ANOS_POR_BLOCO = 12;

function inicioDoBloco(ano: number): number {
  return Math.floor(ano / ANOS_POR_BLOCO) * ANOS_POR_BLOCO;
}

export function SeletorAno({
  id,
  valor,
  min = 1900,
  max = 2199,
  disabled,
  rotuloAcessivel,
  onValor,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(() => Number(valor) || new Date().getFullYear());
  const [bloco, setBloco] = useState(() =>
    inicioDoBloco(Number(valor) || new Date().getFullYear()),
  );
  const botoes = useRef(new Map<number, HTMLButtonElement>());
  const focoPendente = useRef(false);

  const anos = Array.from({ length: ANOS_POR_BLOCO }, (_, indice) => bloco + indice);
  const anoAtual = new Date().getFullYear();
  const selecionado = Number(valor);

  function aoAbrir(abertoNovo: boolean) {
    setAberto(abertoNovo);
    if (!abertoNovo) return;
    const inicial = selecionado || anoAtual;
    setFoco(inicial);
    setBloco(inicioDoBloco(inicial));
    focoPendente.current = true;
  }

  useEffect(() => {
    if (!aberto) return;
    botoes.current.get(foco)?.focus({ preventScroll: true });
  }, [aberto, foco]);

  function registrar(ano: number, elemento: HTMLButtonElement | null) {
    if (!elemento) {
      botoes.current.delete(ano);
      return;
    }
    botoes.current.set(ano, elemento);
    if (focoPendente.current && ano === foco) {
      focoPendente.current = false;
      elemento.focus({ preventScroll: true });
    }
  }

  function mover(novo: number) {
    const alvo = Math.min(Math.max(novo, min), max);
    setFoco(alvo);
    if (alvo < bloco || alvo >= bloco + ANOS_POR_BLOCO) setBloco(inicioDoBloco(alvo));
  }

  function aoTeclar(evento: React.KeyboardEvent) {
    let proximo: number | null = null;
    if (evento.key === "ArrowLeft") proximo = foco - 1;
    else if (evento.key === "ArrowRight") proximo = foco + 1;
    else if (evento.key === "ArrowUp") proximo = foco - 4;
    else if (evento.key === "ArrowDown") proximo = foco + 4;
    else if (evento.key === "PageUp") proximo = foco - ANOS_POR_BLOCO;
    else if (evento.key === "PageDown") proximo = foco + ANOS_POR_BLOCO;
    else if (evento.key === "Home") proximo = min;
    else if (evento.key === "End") proximo = max;
    else return;
    evento.preventDefault();
    mover(proximo);
  }

  function escolher(ano: number) {
    onValor(String(ano));
    setAberto(false);
  }

  function classeAno(ano: number): string {
    const fora = ano < min || ano > max;
    return cn(
      "pressionavel numerais-tabulares focus-visible:ring-ring/50 flex h-11 items-center justify-center text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
      fora && "text-muted-foreground/40 cursor-not-allowed",
      ano === selecionado && "selecionado font-semibold",
      ano !== selecionado && ano === anoAtual && "controle text-primary font-semibold",
      ano !== selecionado && ano !== anoAtual && !fora && "discreto",
    );
  }

  return (
    <Popover open={aberto} onOpenChange={aoAbrir}>
      <PopoverPrimitive.Anchor asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-label={rotuloAcessivel}
          onClick={() => aoAbrir(!aberto)}
          className="controle focus-visible:ring-ring pressionavel flex h-11 w-full items-center justify-center gap-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays
            size={16}
            className="text-muted-foreground hidden shrink-0 sm:block"
            aria-hidden="true"
          />
          <span className="numerais-tabulares font-semibold">{valor}</span>
          <ChevronDown size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        role="dialog"
        aria-label={rotuloAcessivel}
        align="center"
        collisionPadding={8}
        className="w-[min(20rem,calc(100vw-1.5rem))] p-3"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Bloco de anos anterior"
              disabled={bloco <= inicioDoBloco(min)}
              onClick={() => {
                setBloco((atual) => Math.max(inicioDoBloco(min), atual - ANOS_POR_BLOCO));
                setFoco((atual) => Math.max(min, atual - ANOS_POR_BLOCO));
              }}
              className="controle focus-visible:ring-ring pressionavel flex size-11 shrink-0 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <p aria-live="polite" className="numerais-tabulares text-sm font-semibold">
              {bloco} a {bloco + ANOS_POR_BLOCO - 1}
            </p>
            <button
              type="button"
              aria-label="Próximo bloco de anos"
              disabled={bloco + ANOS_POR_BLOCO - 1 >= max}
              onClick={() => {
                setBloco((atual) => Math.min(inicioDoBloco(max), atual + ANOS_POR_BLOCO));
                setFoco((atual) => Math.min(max, atual + ANOS_POR_BLOCO));
              }}
              className="controle focus-visible:ring-ring pressionavel flex size-11 shrink-0 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div
            role="group"
            aria-label={`Anos de ${bloco} a ${bloco + ANOS_POR_BLOCO - 1}`}
            className="grid grid-cols-3 gap-1"
            onKeyDown={aoTeclar}
          >
            {anos.map((ano) => {
              const fora = ano < min || ano > max;
              return (
                <button
                  key={ano}
                  ref={(elemento) => registrar(ano, elemento)}
                  type="button"
                  tabIndex={ano === foco ? 0 : -1}
                  disabled={fora}
                  aria-pressed={ano === selecionado}
                  onClick={() => escolher(ano)}
                  className={classeAno(ano)}
                >
                  {ano}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <button
              type="button"
              disabled={anoAtual === selecionado || anoAtual < min || anoAtual > max}
              onClick={() => escolher(anoAtual)}
              className="discreto text-primary disabled:text-muted-foreground pressionavel min-h-11 px-3 text-sm font-semibold disabled:pointer-events-none"
            >
              Ano atual
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="discreto text-muted-foreground hover:text-foreground pressionavel min-h-11 px-3 text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
