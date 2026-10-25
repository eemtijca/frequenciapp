"use client";

// Seletor de período próprio: gatilho com rótulo amigável e painel com a
// grade do mês (dia) ou a grade de meses, sem campo nativo. Abre em popover
// ancorado em qualquer largura.
import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  celulasDoMes,
  celulasDoMesSegundaDomingo,
  celulasDoMesSemDomingo,
  diaDaSemanaIso,
  diaDeChamadaVizinho,
  diaSeguinte,
  diasDoMes,
  ehDomingo,
  mesSeguinte,
  nomeDoMes,
  rotuloMes,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  modo: "dia" | "mes";
  valor: string;
  max: string;
  min?: string;
  atual?: string;
  disabled?: boolean;
  rotuloAcessivel: string;
  rotulo: string;
  detalhe?: string;
  mostrarSelo?: boolean;
  /** Calendário de segunda a sábado: o domingo não aparece e a navegação o pula. */
  semDomingo?: boolean;
  /** Calendário de segunda a domingo, com dias adjacentes e domingo de resumo. */
  calendarioSemanal?: boolean;
  /** Avisa o resumo para pausar enquanto o calendário está aberto. */
  onAbertoChange?: (aberto: boolean) => void;
  /**
   * Atalho Hoje da tela. No domingo, a Chamada, o Painel e a Chamada Parcial
   * abrem o resumo da semana em vez de escolher o sábado.
   */
  aoHoje?: () => void;
  /** Hoje já está em foco: o atalho fica desabilitado. */
  hojeAtivo?: boolean;
  onValor: (valor: string) => void;
}

const SEMANAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const SEMANAS_SEGUNDA_DOMINGO = ["S", "T", "Q", "Q", "S", "S", "D"];
const SEMANAS_SEM_DOMINGO = SEMANAS.slice(1);
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
  min,
  atual,
  disabled,
  rotuloAcessivel,
  rotulo,
  detalhe,
  mostrarSelo = true,
  semDomingo = false,
  calendarioSemanal = false,
  onAbertoChange,
  aoHoje,
  hojeAtivo = false,
  onValor,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const semanal = calendarioSemanal && !semDomingo;
  // Sem valor, o painel abre no dia de referência, mas nenhum dia fica marcado.
  const corrente = atual ?? max;
  const inicial = valor || corrente;
  const [mesVisivel, setMesVisivel] = useState(() => inicial.slice(0, 7));
  const [anoVisivel, setAnoVisivel] = useState(() => inicial.slice(0, 4));
  const [foco, setFoco] = useState(inicial);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const focoPendente = useRef(false);

  // Sem domingo, a grade e o limite ignoram o dia: se o máximo é domingo,
  // o último dia escolhível continua sendo o sábado. O atalho Hoje não faz
  // esse salto quando a tela trata o domingo à parte.
  const aprumar = (dia: string) => (semDomingo ? ultimoDiaDeChamada(dia) : dia);
  const hojeNoDomingoSemAcao =
    modo === "dia" && semDomingo && diaDaSemanaIso(corrente) === 7 && !aoHoje;
  const hojeDesabilitado =
    hojeNoDomingoSemAcao || (aoHoje ? hojeAtivo : valor === aprumar(corrente));
  const limite = aprumar(max);
  const piso = min ? aprumar(min) : null;
  const referencia = aprumar((valor || corrente) > max ? max : valor || corrente);
  const selo = mostrarSelo && valor === corrente ? (modo === "dia" ? "Hoje" : "Este mês") : "";

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

  useEffect(() => {
    onAbertoChange?.(aberto);
  }, [aberto, onAbertoChange]);

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
    if (piso && proximo < piso) return;
    onValor(proximo);
    setAberto(false);
  }

  function aoTeclarDia(evento: React.KeyboardEvent) {
    let proximo: string | null = null;
    if (evento.key === "ArrowLeft")
      proximo = semDomingo ? diaDeChamadaVizinho(foco, -1) : diaSeguinte(foco, -1);
    else if (evento.key === "ArrowRight")
      proximo = semDomingo ? diaDeChamadaVizinho(foco, 1) : diaSeguinte(foco, 1);
    else if (evento.key === "ArrowUp") proximo = diaSeguinte(foco, -7);
    else if (evento.key === "ArrowDown") proximo = diaSeguinte(foco, 7);
    else if (evento.key === "PageUp") proximo = mesmoDiaNoMes(foco, -1);
    else if (evento.key === "PageDown") proximo = mesmoDiaNoMes(foco, 1);
    else if (evento.key === "Home")
      proximo =
        semDomingo || semanal
          ? diaSeguinte(foco, 1 - diaDaSemanaIso(foco))
          : diaSeguinte(foco, -(diaDaSemanaIso(foco) % 7));
    else if (evento.key === "End")
      proximo = semDomingo
        ? diaSeguinte(foco, 6 - diaDaSemanaIso(foco))
        : semanal
          ? diaSeguinte(foco, 7 - diaDaSemanaIso(foco))
          : diaSeguinte(foco, 6 - (diaDaSemanaIso(foco) % 7));
    else return;
    evento.preventDefault();
    proximo = aprumar(proximo);
    // O foco nunca para num domingo futuro desabilitado: recua para o sábado.
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    if (piso && proximo < piso) proximo = piso;
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
    if (piso && proximo < piso.slice(0, 7)) proximo = piso.slice(0, 7);
    setFoco(proximo);
    setAnoVisivel(proximo.slice(0, 4));
  }

  function mudarMes(deslocamento: number) {
    const proximoMes = mesSeguinte(mesVisivel, deslocamento);
    setMesVisivel(proximoMes);
    const ultimo = diasDoMes(proximoMes).length;
    const numero = Math.min(Number(foco.slice(8)), ultimo);
    let proximo = aprumar(`${proximoMes}-${String(numero).padStart(2, "0")}`);
    if (piso && proximo < piso) proximo = piso;
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    setFoco(proximo);
  }

  function mudarAno(deslocamento: number) {
    const proximoAno = String(Number(anoVisivel) + deslocamento);
    let proximo = `${proximoAno}-${foco.slice(5)}`;
    setAnoVisivel(proximoAno);
    if (piso && proximo < piso) proximo = piso;
    if (proximo > limite) proximo = limite;
    if (semanal && ehDomingo(proximo) && proximo > corrente) proximo = diaSeguinte(proximo, -1);
    setFoco(proximo);
  }

  function classeCelula(
    selecionado: boolean,
    futuro: boolean,
    corrente: boolean,
    foraDoMes = false,
    domingoResumo = false,
  ) {
    return cn(
      "pressionavel focus-visible:ring-ring/50 relative flex items-center justify-center text-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none",
      futuro && "text-muted-foreground/40 cursor-not-allowed",
      foraDoMes && !selecionado && !corrente && "text-muted-foreground/55",
      domingoResumo && !selecionado && "bg-primary/5",
      selecionado && "selecionado font-semibold",
      !selecionado && corrente && "controle text-primary font-semibold",
      !selecionado && !corrente && "discreto",
    );
  }

  const painel = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={modo === "dia" ? "Mês anterior" : "Ano anterior"}
          onClick={() => (modo === "dia" ? mudarMes(-1) : mudarAno(-1))}
          className="controle focus-visible:ring-ring pressionavel flex size-11 shrink-0 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none"
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
          className="controle focus-visible:ring-ring pressionavel flex size-11 shrink-0 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
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
          <div
            className={cn("grid gap-1", semDomingo ? "grid-cols-6" : "grid-cols-7")}
            aria-hidden="true"
          >
            {(semDomingo ? SEMANAS_SEM_DOMINGO : semanal ? SEMANAS_SEGUNDA_DOMINGO : SEMANAS).map(
              (letra, indice) => {
                const domingoResumo = semanal && indice === 6;
                return (
                  <span
                    key={`${letra}-${indice}`}
                    className={cn(
                      "text-muted-foreground flex w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                      semanal ? "h-9" : "h-7",
                    )}
                  >
                    <span>{letra}</span>
                    {domingoResumo && (
                      <span className="text-primary text-[9px] leading-none font-semibold">
                        Resumo
                      </span>
                    )}
                  </span>
                );
              },
            )}
          </div>
          <div className={cn("grid gap-1", semDomingo ? "grid-cols-6" : "grid-cols-7")}>
            {(semanal
              ? celulasDoMesSegundaDomingo(mesVisivel)
              : semDomingo
                ? celulasDoMesSemDomingo(mesVisivel)
                : celulasDoMes(mesVisivel)
            ).map((dia, indice) => {
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
              const domingoResumo = semanal && ehDomingo(dia);
              const domingoFuturo = domingoResumo && dia > corrente;
              const bloqueado = futuro || domingoFuturo || Boolean(piso && dia < piso);
              const foraDoMes = semanal && dia.slice(0, 7) !== mesVisivel;
              const noDiaAtual = dia === corrente;
              const numero = Number(dia.slice(8));
              return (
                <button
                  key={dia}
                  ref={(elemento) => registrar(dia, elemento)}
                  type="button"
                  tabIndex={dia === foco ? 0 : -1}
                  disabled={bloqueado}
                  aria-pressed={selecionado}
                  aria-label={`${numero} de ${nomeDoMes(dia.slice(0, 7)).toLowerCase()} de ${dia.slice(0, 4)}${domingoResumo ? ", resumo da semana anterior" : ""}${noDiaAtual ? ", hoje" : ""}${selecionado ? ", selecionado" : ""}`}
                  onClick={() => escolher(dia)}
                  data-dia={dia}
                  data-fora-do-mes={foraDoMes ? "true" : undefined}
                  data-domingo-resumo={domingoResumo ? "true" : undefined}
                  className={cn(
                    "aspect-square w-full",
                    classeCelula(selecionado, bloqueado, noDiaAtual, foraDoMes, domingoResumo),
                  )}
                >
                  {numero}
                  {domingoResumo && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute bottom-1.5 size-1 rounded-full",
                        bloqueado ? "bg-muted-foreground/40" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {semanal && (
            <p className="text-muted-foreground text-xs">
              Domingos, na última coluna, abrem o resumo da semana anterior.
            </p>
          )}
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
            const bloqueado = futuro || Boolean(piso && mes < piso.slice(0, 7));
            const noMesAtual = mes === corrente;
            return (
              <button
                key={mes}
                ref={(elemento) => registrar(mes, elemento)}
                type="button"
                tabIndex={mes === foco ? 0 : -1}
                disabled={bloqueado}
                aria-pressed={selecionado}
                onClick={() => escolher(mes)}
                className={cn("h-11 w-full", classeCelula(selecionado, bloqueado, noMesAtual))}
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
          disabled={hojeDesabilitado}
          onClick={() => {
            if (hojeDesabilitado) return;
            if (aoHoje) {
              aoHoje();
              setAberto(false);
              return;
            }
            escolher(aprumar(corrente));
          }}
          className="discreto text-primary disabled:text-muted-foreground pressionavel min-h-11 px-3 text-sm font-semibold disabled:pointer-events-none"
        >
          {modo === "dia" ? "Hoje" : "Este mês"}
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
      className="controle focus-visible:ring-ring pressionavel @container flex h-11 w-full items-center justify-center gap-2 overflow-hidden px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <CalendarDays
        size={16}
        className="text-muted-foreground hidden shrink-0 @min-[11rem]:block"
        aria-hidden="true"
      />
      <span
        className={cn(
          "numerais-tabulares font-semibold",
          modo === "dia" ? "shrink-0 whitespace-nowrap" : "min-w-0 truncate",
        )}
      >
        {rotulo}
      </span>
      {detalhe && (
        // No painel estreito do desktop o dia da semana já aparece no cabeçalho.
        <span className="text-muted-foreground min-w-0 truncate xl:hidden">{detalhe}</span>
      )}
      {selo && (
        <span className="bg-primary/15 text-primary hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold @min-[9rem]:inline">
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
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto p-3"
        onOpenAutoFocus={(evento) => evento.preventDefault()}
      >
        {painel}
      </PopoverContent>
    </Popover>
  );
}
