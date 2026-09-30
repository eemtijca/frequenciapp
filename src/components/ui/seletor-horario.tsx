"use client";

// Seletor de horário próprio, irmão do SeletorPeriodo: gatilho com o horário
// e painel em popover com duas colunas (horas e minutos), sem campo nativo.
import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  /** "HH:MM" ou vazio. */
  valor: string;
  disabled?: boolean;
  rotuloAcessivel: string;
  /** Horário atual "HH:MM"; quando informado, habilita o atalho "Agora". */
  agora?: string;
  onValor: (valor: string) => void;
}

type Coluna = "hora" | "minuto";

const HORAS = Array.from({ length: 24 }, (_, indice) => indice);
const MINUTOS = Array.from({ length: 60 }, (_, indice) => indice);

function dois(numero: number): string {
  return String(numero).padStart(2, "0");
}

function partes(valor: string): { hora: number; minuto: number } {
  const [hora, minuto] = valor.split(":").map(Number);
  return {
    hora: Number.isFinite(hora) ? (hora ?? 0) : 0,
    minuto: Number.isFinite(minuto) ? (minuto ?? 0) : 0,
  };
}

export function SeletorHorario({ id, valor, disabled, rotuloAcessivel, agora, onValor }: Props) {
  const [aberto, setAberto] = useState(false);
  const [hora, setHora] = useState(() => partes(valor).hora);
  const [minuto, setMinuto] = useState(() => partes(valor).minuto);
  const [coluna, setColuna] = useState<Coluna>("hora");
  const opcoes = useRef(new Map<string, HTMLButtonElement>());
  const focoPendente = useRef(false);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);

  function aoAbrir(abertoNovo: boolean) {
    setAberto(abertoNovo);
    if (!abertoNovo) return;
    const atual = partes(valor || agora || "00:00");
    focoPendente.current = true;
    setHora(atual.hora);
    setMinuto(atual.minuto);
    setColuna("hora");
  }

  const chaveFoco = `${coluna}-${coluna === "hora" ? hora : minuto}`;

  useEffect(() => {
    if (!aberto) return;
    const elemento = opcoes.current.get(chaveFoco);
    elemento?.focus();
    elemento?.scrollIntoView({ block: "nearest" });
  }, [aberto, chaveFoco]);

  function registrar(chave: string, elemento: HTMLButtonElement | null) {
    if (!elemento) {
      opcoes.current.delete(chave);
      return;
    }
    opcoes.current.set(chave, elemento);
    // O painel monta depois do efeito; o foco inicial sai daqui.
    if (focoPendente.current && chave === chaveFoco) {
      focoPendente.current = false;
      elemento.focus();
      elemento.scrollIntoView({ block: "center" });
    }
  }

  function escolherHora(escolhida: number) {
    setHora(escolhida);
    setColuna("minuto");
  }

  function escolherMinuto(escolhido: number) {
    setMinuto(escolhido);
    onValor(`${dois(hora)}:${dois(escolhido)}`);
    setAberto(false);
  }

  function aoTeclar(evento: React.KeyboardEvent, atual: Coluna) {
    const total = atual === "hora" ? 24 : 60;
    const posicao = atual === "hora" ? hora : minuto;
    let proximo: number | null = null;
    if (evento.key === "ArrowUp") proximo = Math.max(0, posicao - 1);
    else if (evento.key === "ArrowDown") proximo = Math.min(total - 1, posicao + 1);
    else if (evento.key === "PageUp") proximo = Math.max(0, posicao - 6);
    else if (evento.key === "PageDown") proximo = Math.min(total - 1, posicao + 6);
    else if (evento.key === "Home") proximo = 0;
    else if (evento.key === "End") proximo = total - 1;
    else if (evento.key === "ArrowRight" && atual === "hora") {
      evento.preventDefault();
      setColuna("minuto");
      return;
    } else if (evento.key === "ArrowLeft" && atual === "minuto") {
      evento.preventDefault();
      setColuna("hora");
      return;
    } else return;
    evento.preventDefault();
    if (atual === "hora") setHora(proximo);
    else setMinuto(proximo);
  }

  function classeOpcao(selecionada: boolean) {
    return cn(
      "pressionavel numerais-tabulares flex h-9 w-full items-center justify-center rounded-md text-sm transition-colors",
      selecionada ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-secondary",
    );
  }

  function renderColuna(tipo: Coluna, lista: number[], rotulo: string) {
    const foco = tipo === "hora" ? hora : minuto;
    const escolhido = valor ? partes(valor)[tipo === "hora" ? "hora" : "minuto"] : -1;
    return (
      <div
        role="listbox"
        aria-label={rotulo}
        className="flex max-h-56 flex-1 flex-col gap-1 overflow-y-auto pr-1"
        onKeyDown={(evento) => aoTeclar(evento, tipo)}
      >
        {lista.map((numero) => (
          <button
            key={numero}
            ref={(elemento) => registrar(`${tipo}-${numero}`, elemento)}
            type="button"
            role="option"
            aria-selected={numero === escolhido}
            tabIndex={numero === foco && tipo === coluna ? 0 : -1}
            onClick={() => (tipo === "hora" ? escolherHora(numero) : escolherMinuto(numero))}
            className={classeOpcao(numero === escolhido)}
          >
            {dois(numero)}
          </button>
        ))}
      </div>
    );
  }

  const painel = (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground flex gap-2 text-[11px] font-medium" aria-hidden="true">
        <span className="flex-1 text-center">Hora</span>
        <span className="flex-1 text-center">Minuto</span>
      </div>
      <div className="flex gap-2">
        {renderColuna("hora", HORAS, "Horas")}
        {renderColuna("minuto", MINUTOS, "Minutos")}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        {agora ? (
          <button
            type="button"
            disabled={valor === agora}
            onClick={() => {
              onValor(agora);
              setAberto(false);
            }}
            className="text-primary disabled:text-muted-foreground pressionavel text-sm font-medium hover:underline disabled:no-underline"
          >
            Agora
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-muted-foreground hover:text-foreground pressionavel text-sm font-medium"
        >
          Fechar
        </button>
      </div>
    </div>
  );

  const gatilho = (
    <button
      ref={gatilhoRef}
      id={id}
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      aria-label={`${rotuloAcessivel}: ${valor || "sem horário"}`}
      onClick={() => aoAbrir(!aberto)}
      className="border-input bg-background focus-visible:ring-ring pressionavel flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Clock size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="numerais-tabulares truncate font-semibold">{valor || "--:--"}</span>
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
        className="w-[min(16rem,calc(100vw-1.5rem))] p-3"
        onOpenAutoFocus={(evento) => evento.preventDefault()}
        onCloseAutoFocus={(evento) => {
          // Sem Trigger do Radix, o foco volta ao gatilho por aqui.
          evento.preventDefault();
          gatilhoRef.current?.focus();
        }}
      >
        {painel}
      </PopoverContent>
    </Popover>
  );
}
