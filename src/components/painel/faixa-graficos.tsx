"use client";

// Faixa de gráficos com rolagem nativa, encaixe por cartão e navegação por teclado.
// Mantém formulários montados e limita o foco ao cartão em exibição.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Cartao {
  id: string;
  nome: string;
  conteudo: ReactNode;
}

export default function FaixaGraficos({ cartoes, ativo }: { cartoes: Cartao[]; ativo: boolean }) {
  const faixa = useRef<HTMLDivElement>(null);
  const larguraFaixa = useRef(0);
  const indiceSalvo = useRef(0);
  const [indice, setIndice] = useState(0);
  const [altura, setAltura] = useState<number>();
  const ajudaId = useId();
  const posicaoId = useId();
  const atual = Math.min(indice, cartoes.length - 1);
  const identidade = cartoes[atual]?.id;

  useLayoutEffect(() => {
    const elemento = faixa.current;
    const primeiro = elemento?.firstElementChild;
    const cartao = elemento?.children.item(Math.min(indiceSalvo.current, cartoes.length - 1));
    if (
      !ativo ||
      !elemento ||
      !(primeiro instanceof HTMLElement) ||
      !(cartao instanceof HTMLElement)
    )
      return;
    // O Safari pode zerar scrollLeft ao ocultar a visão do Painel.
    larguraFaixa.current = elemento.clientWidth;
    elemento.scrollTo({ left: cartao.offsetLeft - primeiro.offsetLeft, behavior: "instant" });
  }, [ativo, cartoes.length]);

  function irPara(destino: number) {
    const elemento = faixa.current;
    const primeiro = elemento?.firstElementChild;
    const cartao = elemento?.children.item(destino);
    if (!elemento || !(primeiro instanceof HTMLElement) || !(cartao instanceof HTMLElement)) return;
    elemento.scrollTo({
      left: cartao.offsetLeft - primeiro.offsetLeft,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  useEffect(() => {
    const elemento = faixa.current;
    const primeiro = elemento?.firstElementChild;
    const cartao = elemento?.children.item(atual);
    if (
      !ativo ||
      !elemento ||
      !(cartao instanceof HTMLElement) ||
      !(primeiro instanceof HTMLElement)
    )
      return;
    if (larguraFaixa.current === 0) larguraFaixa.current = elemento.clientWidth;
    const observador = new ResizeObserver(() => {
      if (elemento.clientWidth === 0) {
        larguraFaixa.current = 0;
        return;
      }
      const barra = elemento.offsetHeight - elemento.clientHeight;
      setAltura(Math.ceil(cartao.getBoundingClientRect().height) + barra + 8);
      if (larguraFaixa.current !== elemento.clientWidth) {
        larguraFaixa.current = elemento.clientWidth;
        elemento.scrollTo({ left: cartao.offsetLeft - primeiro.offsetLeft, behavior: "instant" });
      }
    });
    observador.observe(cartao);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ativo, atual, identidade, cartoes.length]);

  return (
    <section
      aria-label="Gráficos do painel"
      aria-roledescription="carrossel"
      className="min-w-0 space-y-2"
    >
      <p id={ajudaId} className="text-muted-foreground text-xs">
        Deslize para os lados para ver os gráficos. Com o teclado, use as setas esquerda e direita.
      </p>
      <div
        ref={faixa}
        role="group"
        aria-label="Cartões de gráficos"
        aria-describedby={`${ajudaId} ${posicaoId}`}
        tabIndex={0}
        style={altura === undefined ? undefined : { height: altura }}
        className="focus-visible:ring-ring flex min-w-0 snap-x snap-mandatory items-start gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg pb-2 focus-visible:ring-2 focus-visible:outline-none"
        onScroll={(evento) => {
          const elemento = evento.currentTarget;
          // A mudança de largura pode gerar scroll antes do ResizeObserver.
          // O observador realinha o cartão vigente antes de recalcular a posição.
          if (!ativo || elemento.clientWidth === 0 || elemento.clientWidth !== larguraFaixa.current)
            return;
          const primeiro = elemento.firstElementChild;
          if (!(primeiro instanceof HTMLElement)) return;
          let proximo = 0;
          let distancia = Infinity;
          Array.from(elemento.children).forEach((cartao, posicao) => {
            if (!(cartao instanceof HTMLElement)) return;
            const diferenca = Math.abs(
              cartao.offsetLeft - primeiro.offsetLeft - elemento.scrollLeft,
            );
            if (diferenca < distancia) {
              distancia = diferenca;
              proximo = posicao;
            }
          });
          if (proximo !== atual) {
            const anterior = elemento.children.item(atual);
            if (anterior?.contains(document.activeElement)) elemento.focus({ preventScroll: true });
            indiceSalvo.current = proximo;
            setIndice(proximo);
          }
        }}
        onKeyDown={(evento) => {
          // Calendários, seletores e outros campos mantêm os próprios atalhos.
          if (
            evento.target !== evento.currentTarget ||
            evento.altKey ||
            evento.ctrlKey ||
            evento.metaKey
          )
            return;
          const destinos: Record<string, number> = {
            ArrowLeft: Math.max(0, atual - 1),
            ArrowRight: Math.min(cartoes.length - 1, atual + 1),
            Home: 0,
            End: cartoes.length - 1,
          };
          const destino = destinos[evento.key];
          if (destino === undefined) return;
          evento.preventDefault();
          irPara(destino);
        }}
      >
        {cartoes.map((cartao, posicao) => (
          <article
            key={cartao.id}
            aria-label={`${posicao + 1} de ${cartoes.length}: ${cartao.nome}`}
            aria-roledescription="cartão"
            aria-hidden={posicao !== atual}
            inert={posicao !== atual}
            className="min-w-0 shrink-0 basis-full snap-start snap-always space-y-4"
          >
            {cartao.conteudo}
          </article>
        ))}
      </div>
      <p
        id={posicaoId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-muted-foreground numerais-tabulares text-center text-xs"
      >
        {atual + 1} de {cartoes.length} · {cartoes[atual]?.nome}
      </p>
    </section>
  );
}
