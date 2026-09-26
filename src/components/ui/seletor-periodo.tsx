"use client";

// Seletor de período próprio: gatilho com rótulo amigável e painel com a
// grade do mês (dia) ou a grade de meses, sem campo nativo. Abre em popover
// ancorado em qualquer largura.
import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  celulasDoMes,
  diaDaSemanaIso,
  diaSeguinte,
  diasDoMes,
  mesSeguinte,
  nomeDoMes,
  rotuloMes,
} from "@/domain/frequencia";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  modo: "dia" | "mes";
  valor: string;
  max: string;
  disabled?: boolean;
  rotuloAcessivel: string;
  rotulo: string;
  detalhe?: string;
  onValor: (valor: string) => void;
}

const SEMANAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = Array.from({ length: 12 }, (_, indice) => indice + 1);

/** Mesmo dia em outro mês, limitado ao último dia do mês de destino. */
function mesmoDiaNoMes(dia: string, deslocamento: number): string {
  const alvo = mesSeguinte(dia.slice(0, 7), deslocamento);
  const ultimo = diasDoMes(alvo).length;
  const numero = Math.min(Number(dia.slice(8)), ultimo);
  return `${alvo}-${String(numero).padStart(2, "0")}`;
}

export function SeletorPeriodo({
  id,
  modo,
  valor,
  max,
  disabled,
  rotuloAcessivel,
  rotulo,
  detalhe,
  onValor,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [mesVisivel, setMesVisivel] = useState(() => valor.slice(0, 7));
  const [anoVisivel, setAnoVisivel] = useState(() => valor.slice(0, 4));
  const [foco, setFoco] = useState(valor);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const focoPendente = useRef(false);

  const referencia = valor > max ? max : valor;
  const selo = valor === max ? (modo === "dia" ? "Hoje" : "Este mês") : "";

  // Ao abrir, a visão volta para o valor selecionado e o foco vai para ele.
  function aoAbrir(abertoNovo: boolean) {
    setAberto(abertoNovo);
    if (!abertoNovo) return;
    focoPendente.current = true;
    setMesVisivel(referencia.slice(0, 7));
    setAnoVisivel(referencia.slice(0, 4));
    setFoco(referencia);
  }

  useEffect(() => {
    if (!aberto) return;
    botoes.current.get(foco)?.focus();
  }, [aberto, foco]);

  function registrar(chave: string, elemento: HTMLButtonElement | null) {
    if (!elemento) {
      botoes.current.delete(chave);
      return;
    }
    botoes.current.set(chave, elemento);
    // O painel monta depois do efeito; o foco inicial sai daqui.
    if (focoPendente.current && chave === foco) {
      focoPendente.current = false;
      elemento.focus();
    }
  }

  function escolher(proximo: string) {
    onValor(proximo);
    setAberto(false);
  }

  function aoTeclarDia(evento: React.KeyboardEvent) {
    let proximo: string | null = null;
    if (evento.key === "ArrowLeft") proximo = diaSeguinte(foco, -1);
    else if (evento.key === "ArrowRight") proximo = diaSeguinte(foco, 1);
    else if (evento.key === "ArrowUp") proximo = diaSeguinte(foco, -7);
    else if (evento.key === "ArrowDown") proximo = diaSeguinte(foco, 7);
    else if (evento.key === "PageUp") proximo = mesmoDiaNoMes(foco, -1);
    else if (evento.key === "PageDown") proximo = mesmoDiaNoMes(foco, 1);
    else if (evento.key === "Home") proximo = diaSeguinte(foco, -(diaDaSemanaIso(foco) % 7));
    else if (evento.key === "End") proximo = diaSeguinte(foco, 6 - (diaDaSemanaIso(foco) % 7));
    else return;
    evento.preventDefault();
    if (proximo > max) proximo = max;
    setFoco(proximo);
    setMesVisivel(proximo.slice(0, 7));
  }

  function aoTeclarMes(evento: React.KeyboardEvent) {
    const indice = Number(foco.slice(5)) - 1;
    let proximoIndice: number | null = null;
    if (evento.key === "ArrowLeft") proximoIndice = indice - 1;
    else if (evento.key === "ArrowRight") proximoIndice = indice + 1;
    else if (evento.key === "ArrowUp") proximoIndice = indice - 3;
    else if (evento.key === "ArrowDown") proximoIndice = indice + 3;
    else if (evento.key === "Home") proximoIndice = 0;
    else if (evento.key === "End") proximoIndice = 11;
    else return;
    evento.preventDefault();
    if (proximoIndice < 0 || proximoIndice > 11) return;
    let proximo = `${anoVisivel}-${String(proximoIndice + 1).padStart(2, "0")}`;
    if (proximo > max) proximo = max;
    setFoco(proximo);
    setAnoVisivel(proximo.slice(0, 4));
  }

  function mudarMes(deslocamento: number) {
    const proximoMes = mesSeguinte(mesVisivel, deslocamento);
    setMesVisivel(proximoMes);
    const ultimo = diasDoMes(proximoMes).length;
    const numero = Math.min(Number(foco.slice(8)), ultimo);
    const proximo = `${proximoMes}-${String(numero).padStart(2, "0")}`;
    setFoco(proximo > max ? max : proximo);
  }

  function mudarAno(deslocamento: number) {
    const proximoAno = String(Number(anoVisivel) + deslocamento);
    const proximo = `${proximoAno}-${foco.slice(5)}`;
    setAnoVisivel(proximoAno);
    setFoco(proximo > max ? max : proximo);
  }

  function classeCelula(selecionado: boolean, futuro: boolean, corrente: boolean) {
    return cn(
      "flex items-center justify-center rounded-md text-sm transition-colors",
      futuro && "text-muted-foreground/40 cursor-not-allowed",
      selecionado && "bg-primary text-primary-foreground font-semibold",
      !selecionado && !futuro && corrente && "border-primary/40 text-primary border font-semibold",
      !selecionado && !futuro && !corrente && "hover:bg-secondary",
    );
  }

  const painel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={modo === "dia" ? "Mês anterior" : "Ano anterior"}
          onClick={() => (modo === "dia" ? mudarMes(-1) : mudarAno(-1))}
          className="hover:bg-secondary focus-visible:ring-ring flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft size={18} />
        </button>
        <p aria-live="polite" className="text-sm font-semibold">
          {modo === "dia" ? rotuloMes(mesVisivel) : anoVisivel}
        </p>
        <button
          type="button"
          aria-label={modo === "dia" ? "Mês seguinte" : "Ano seguinte"}
          disabled={modo === "dia" ? mesVisivel >= max.slice(0, 7) : anoVisivel >= max.slice(0, 4)}
          onClick={() => (modo === "dia" ? mudarMes(1) : mudarAno(1))}
          className="hover:bg-secondary focus-visible:ring-ring flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {modo === "dia" ? (
        <div
          role="group"
          aria-label={`Dias de ${rotuloMes(mesVisivel)}`}
          className="flex flex-col gap-1"
          onKeyDown={aoTeclarDia}
        >
          <div className="grid grid-cols-7 gap-1" aria-hidden="true">
            {SEMANAS.map((letra, indice) => (
              <span
                key={`${letra}-${indice}`}
                className="text-muted-foreground flex h-7 w-full items-center justify-center text-[11px] font-medium"
              >
                {letra}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulasDoMes(mesVisivel).map((dia, indice) => {
              if (!dia)
                return (
                  <span
                    key={`vazio-${indice}`}
                    aria-hidden="true"
                    className="aspect-square w-full"
                  />
                );
              const selecionado = dia === valor;
              const futuro = dia > max;
              const corrente = dia === max;
              const numero = Number(dia.slice(8));
              return (
                <button
                  key={dia}
                  ref={(elemento) => registrar(dia, elemento)}
                  type="button"
                  tabIndex={dia === foco ? 0 : -1}
                  disabled={futuro}
                  aria-pressed={selecionado}
                  aria-label={`${numero} de ${nomeDoMes(mesVisivel).toLowerCase()} de ${mesVisivel.slice(0, 4)}${corrente ? ", hoje" : ""}${selecionado ? ", selecionado" : ""}`}
                  onClick={() => escolher(dia)}
                  className={cn(
                    "aspect-square w-full",
                    classeCelula(selecionado, futuro, corrente),
                  )}
                >
                  {numero}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          role="group"
          aria-label={`Meses de ${anoVisivel}`}
          className="grid grid-cols-3 gap-1"
          onKeyDown={aoTeclarMes}
        >
          {MESES.map((numero) => {
            const mes = `${anoVisivel}-${String(numero).padStart(2, "0")}`;
            const selecionado = mes === valor;
            const futuro = mes > max;
            const corrente = mes === max;
            return (
              <button
                key={mes}
                ref={(elemento) => registrar(mes, elemento)}
                type="button"
                tabIndex={mes === foco ? 0 : -1}
                disabled={futuro}
                aria-pressed={selecionado}
                onClick={() => escolher(mes)}
                className={cn("h-11 w-full", classeCelula(selecionado, futuro, corrente))}
              >
                {nomeDoMes(mes)}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <button
          type="button"
          disabled={valor === max}
          onClick={() => escolher(max)}
          className="text-primary disabled:text-muted-foreground text-sm font-medium hover:underline disabled:no-underline"
        >
          {modo === "dia" ? "Hoje" : "Este mês"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-muted-foreground hover:text-foreground text-sm font-medium"
        >
          Fechar
        </button>
      </div>
    </div>
  );

  const gatilho = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      aria-label={`${rotuloAcessivel}: ${rotulo}${selo ? `, ${selo}` : ""}`}
      onClick={() => aoAbrir(!aberto)}
      className="border-input bg-background focus-visible:ring-ring flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CalendarDays size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="numerais-tabulares truncate font-semibold">{rotulo}</span>
      {detalhe && (
        // No painel estreito do desktop o dia da semana já aparece no cabeçalho.
        <span className="text-muted-foreground truncate xl:hidden">{detalhe}</span>
      )}
      {selo && (
        <span className="bg-primary/15 text-primary shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
          {selo}
        </span>
      )}
    </button>
  );

  return (
    <Popover open={aberto} onOpenChange={aoAbrir}>
      <PopoverPrimitive.Anchor asChild>{gatilho}</PopoverPrimitive.Anchor>
      <PopoverContent
        role="dialog"
        aria-label={rotuloAcessivel}
        align="center"
        collisionPadding={8}
        className="w-[min(24rem,calc(100vw-1.5rem))] p-3"
        onOpenAutoFocus={(evento) => evento.preventDefault()}
      >
        {painel}
      </PopoverContent>
    </Popover>
  );
}
