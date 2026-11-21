"use client";

// Carrossel controlado com trilho de rolagem e encaixe, preservando os cartões visitados.
import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { AquecimentoGraficos } from "@/components/graficos/aquecimento-graficos";
import { TOKENS_LAYOUT } from "@/theme/layout";

export interface ItemCarrossel {
  id: string;
  rotulo: string;
  render: (ativo: boolean) => ReactNode;
}

export interface CarrosselCartoesProps {
  itens: readonly ItemCarrossel[];
  valor: string;
  visitados: readonly string[];
  onValor: (id: string) => void;
  rotuloAcessivel: string;
  ocupado?: boolean;
  sx?: SxProps<Theme>;
  children?: (ativo: ItemCarrossel, indice: number) => ReactNode;
}

/** Trilho horizontal com scroll snap, teclado e montagem apenas dos cartões visitados. */
export function CarrosselCartoes({
  itens,
  valor,
  visitados,
  onValor,
  rotuloAcessivel,
  ocupado = false,
  sx,
  children,
}: CarrosselCartoesProps) {
  const statusId = useId();
  const trilho = useRef<HTMLDivElement>(null);
  const cartaoAtivo = useRef<HTMLDivElement>(null);
  const esperaRolagem = useRef<number | undefined>(undefined);
  const alvoRolagem = useRef<string | null>(null);
  const rolagemManual = useRef(false);
  const indice = Math.max(
    0,
    itens.findIndex((item) => item.id === valor),
  );
  const ativo = itens[indice];

  const ids = useMemo(() => new Set(itens.map((item) => item.id)), [itens]);
  const visitadosValidos = useMemo(
    () => [...new Set([...visitados, valor])].filter((id) => ids.has(id)),
    [ids, valor, visitados],
  );

  useEffect(() => {
    return () => {
      if (esperaRolagem.current !== undefined) window.clearTimeout(esperaRolagem.current);
    };
  }, []);

  useEffect(() => {
    const area = trilho.current;
    const cartao = cartaoAtivo.current;
    if (!area || !cartao) return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alvoRolagem.current = valor;
    area.scrollTo({
      left: cartao.offsetLeft,
      behavior: reduzido ? "auto" : "smooth",
    });
  }, [valor]);

  useEffect(() => {
    const area = trilho.current;
    if (!area) return;
    const alinhar = () => {
      const cartao = cartaoAtivo.current;
      if (!cartao || area.clientWidth === 0) return;
      alvoRolagem.current = valor;
      area.scrollTo({ left: cartao.offsetLeft, behavior: "auto" });
    };
    const observador = new ResizeObserver(alinhar);
    observador.observe(area);
    window.addEventListener("resize", alinhar);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", alinhar);
    };
  }, [valor]);

  function liberarRolagemManual() {
    alvoRolagem.current = null;
    rolagemManual.current = true;
  }

  function irPara(destino: number) {
    const proximo = itens[Math.min(Math.max(destino, 0), itens.length - 1)];
    if (proximo) onValor(proximo.id);
  }

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.target !== evento.currentTarget) return;
    if (evento.key === "ArrowLeft") irPara(indice - 1);
    else if (evento.key === "ArrowRight") irPara(indice + 1);
    else if (evento.key === "Home") irPara(0);
    else if (evento.key === "End") irPara(itens.length - 1);
    else return;
    evento.preventDefault();
  }

  function aoRolar() {
    // Rolagem causada por montagem ou exibição da visão não troca o cartão:
    // só o gesto ou a roda do usuário escolhem outro gráfico.
    if (!rolagemManual.current) return;
    if (esperaRolagem.current !== undefined) {
      window.clearTimeout(esperaRolagem.current);
    }
    esperaRolagem.current = window.setTimeout(() => {
      const area = trilho.current;
      if (!area) return;
      rolagemManual.current = false;
      const centro = area.scrollLeft + area.clientWidth / 2;
      let melhor: { id: string; distancia: number } | undefined;
      for (const cartao of area.querySelectorAll<HTMLElement>("[data-cartao]")) {
        const id = cartao.dataset.cartao;
        if (!id) continue;
        const distancia = Math.abs(cartao.offsetLeft + cartao.offsetWidth / 2 - centro);
        if (!melhor || distancia < melhor.distancia) melhor = { id, distancia };
      }
      if (!melhor) return;
      const alvo = alvoRolagem.current;
      if (alvo !== null) {
        if (melhor.id !== alvo) return;
        alvoRolagem.current = null;
        return;
      }
      if (melhor.id !== valor) onValor(melhor.id);
    }, 120);
  }

  if (!ativo) return null;

  return (
    <Box
      role="group"
      aria-roledescription="carrossel"
      aria-label={rotuloAcessivel}
      aria-describedby={statusId}
      tabIndex={0}
      onKeyDown={aoTeclar}
      sx={[
        (theme) => ({
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "hidden",
          "&:focus-visible": {
            outline: `${TOKENS_LAYOUT.campo.foco}px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        ref={trilho}
        onScroll={aoRolar}
        onPointerDown={liberarRolagemManual}
        onWheel={liberarRolagemManual}
        onTouchStart={liberarRolagemManual}
        sx={{
          display: "flex",
          gap: `${TOKENS_LAYOUT.cartao.padding}px`,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "auto",
          overflowY: "hidden",
          overscrollBehaviorX: "contain",
          scrollSnapType: "x mandatory",
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
          "@media (prefers-reduced-motion: reduce)": {
            scrollBehavior: "auto",
          },
        }}
      >
        {itens.map((item, posicao) => {
          const visivel = item.id === ativo.id;
          const visitado = visitadosValidos.includes(item.id);
          if (!visivel && !visitado) return null;
          return (
            <Box
              key={item.id}
              ref={visivel ? cartaoAtivo : undefined}
              data-cartao={item.id}
              data-ativo={visivel ? "true" : "false"}
              inert={!visivel}
              aria-hidden={!visivel}
              role="article"
              aria-roledescription="cartão"
              aria-label={`${posicao + 1} de ${itens.length}: ${item.rotulo}`}
              aria-current={visivel ? "true" : undefined}
              aria-busy={visivel && ocupado ? true : undefined}
              sx={{
                flex: "0 0 100%",
                minWidth: 0,
                scrollSnapAlign: "start",
                scrollSnapStop: "always",
              }}
            >
              <AquecimentoGraficos.Provider value={visivel}>
                {item.render(visivel)}
              </AquecimentoGraficos.Provider>
            </Box>
          );
        })}
      </Box>
      <Box
        component="p"
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        sx={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {indice + 1} de {itens.length} · {ativo.rotulo}
      </Box>
      {children?.(ativo, indice)}
    </Box>
  );
}
