"use client";

// Busca com foco estável e opções acessíveis, sem fechar ao abrir o teclado móvel.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { normalizar } from "@/domain/frequencia";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PropsSelecionar } from "@/components/ui/selecionar";
import { cn } from "@/lib/utils";

export function SelecionarBuscavel({
  id,
  value,
  onValueChange,
  opcoes,
  placeholder,
  disabled,
  className,
  ariaLabel,
}: Omit<PropsSelecionar, "buscavel">) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const busca = useRef<HTMLInputElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idPainel = useId();
  const idLista = `${idPainel}-opcoes`;
  const opcoesNormalizadas = useMemo(
    () => opcoes.map((opcao) => ({ opcao, texto: normalizar(opcao.rotulo) })),
    [opcoes],
  );
  const filtradas = useMemo(() => {
    const alvo = normalizar(termo.trim());
    return alvo
      ? opcoesNormalizadas.filter(({ texto }) => texto.includes(alvo)).map(({ opcao }) => opcao)
      : opcoes;
  }, [opcoes, opcoesNormalizadas, termo]);
  const indice = Math.max(0, Math.min(indiceAtivo, filtradas.length - 1));
  const opcaoAtiva = filtradas[indice];
  const selecionada = opcoes.find((opcao) => opcao.valor === value);

  function mudarAberto(valor: boolean) {
    if (valor) {
      setTermo("");
      setIndiceAtivo(
        Math.max(
          0,
          opcoes.findIndex((opcao) => opcao.valor === value),
        ),
      );
    }
    setAberto(valor);
  }

  useEffect(() => {
    const painel = lista.current;
    const opcao = painel?.children.item(indice);
    if (!aberto || !painel || !(opcao instanceof HTMLElement)) return;
    if (opcao.offsetTop < painel.scrollTop) painel.scrollTop = opcao.offsetTop;
    else if (opcao.offsetTop + opcao.offsetHeight > painel.scrollTop + painel.clientHeight)
      painel.scrollTop = opcao.offsetTop + opcao.offsetHeight - painel.clientHeight;
  }, [aberto, indice, termo]);

  useEffect(() => {
    if (!aberto) return;
    // Mantém a âncora na área visível quando o teclado reduz a altura da tela.
    // Os dois eventos do teclado compartilham um único ajuste por quadro.
    let quadro: number | undefined;
    const areaVisivel = window.visualViewport;
    const reposicionar = () => {
      if (quadro !== undefined) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = undefined;
        gatilho.current?.scrollIntoView({ block: "nearest" });
      });
    };
    window.addEventListener("resize", reposicionar);
    areaVisivel?.addEventListener("resize", reposicionar);
    return () => {
      if (quadro !== undefined) window.cancelAnimationFrame(quadro);
      window.removeEventListener("resize", reposicionar);
      areaVisivel?.removeEventListener("resize", reposicionar);
    };
  }, [aberto]);

  function escolher(valor: string) {
    onValueChange(valor);
    setAberto(false);
  }

  function navegar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.nativeEvent.isComposing) return;
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (filtradas.length) {
        const passo = evento.key === "ArrowDown" ? 1 : -1;
        setIndiceAtivo((indice + passo + filtradas.length) % filtradas.length);
      }
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      if (opcaoAtiva) escolher(opcaoAtiva.valor);
    } else if (evento.key === "Tab") {
      // O painel devolve o foco ao gatilho; o próximo Tab segue para o campo seguinte.
      evento.preventDefault();
      setAberto(false);
    }
  }

  return (
    <Popover open={aberto} onOpenChange={mudarAberto}>
      <PopoverTrigger asChild>
        <button
          ref={gatilho}
          type="button"
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={aberto}
          aria-controls={idPainel}
          aria-haspopup="dialog"
          disabled={disabled}
          onKeyDown={(evento) => {
            if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
              evento.preventDefault();
              mudarAberto(true);
            }
          }}
          className={cn(
            "controle-vidro border-input focus-visible:border-ring focus-visible:ring-ring/50 pressionavel flex h-11 w-full items-center justify-between gap-2 px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate",
            className,
          )}
        >
          <span>{selecionada?.rotulo ?? placeholder}</span>
          <ChevronDown size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={idPainel}
        align="start"
        sideOffset={4}
        aria-label={ariaLabel ?? "Selecionar opção"}
        className="flex max-h-[min(18rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          busca.current?.focus({ preventScroll: true });
        }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-2.5 py-1">
          <Search size={14} className="text-muted-foreground" aria-hidden="true" />
          <Input
            ref={busca}
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value);
              setIndiceAtivo(0);
            }}
            onKeyDown={navegar}
            placeholder="Filtrar"
            aria-label="Filtrar opções"
            aria-autocomplete="list"
            aria-controls={idLista}
            aria-activedescendant={opcaoAtiva ? `${idLista}-${indice}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="campo-integrado h-10 px-0 focus-visible:ring-0"
          />
        </div>
        <div
          ref={lista}
          id={idLista}
          role="listbox"
          aria-label="Opções"
          className="relative min-h-0 overflow-y-auto overscroll-contain p-1"
        >
          {filtradas.length === 0 ? (
            <p role="status" className="text-muted-foreground px-2 py-3 text-center text-sm">
              Nenhuma opção encontrada.
            </p>
          ) : (
            filtradas.map((opcao, posicao) => (
              <button
                type="button"
                key={opcao.valor}
                id={`${idLista}-${posicao}`}
                role="option"
                aria-selected={opcao.valor === value}
                tabIndex={-1}
                onClick={() => escolher(opcao.valor)}
                onPointerDown={(evento) => {
                  if (evento.pointerType === "mouse") evento.preventDefault();
                }}
                onPointerMove={(evento) => {
                  if (evento.pointerType === "mouse") setIndiceAtivo(posicao);
                }}
                className={cn(
                  "pressionavel relative flex min-h-11 w-full cursor-pointer items-center rounded-lg py-1.5 pr-3 pl-8 text-left text-sm outline-none",
                  opcao.valor === value ? "vidro-selecionado" : "vidro-discreto",
                  posicao === indice && "ring-ring/50 ring-2 ring-inset",
                )}
              >
                {opcao.valor === value && (
                  <Check size={14} className="absolute left-2" aria-hidden="true" />
                )}
                <span>{opcao.rotulo}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
