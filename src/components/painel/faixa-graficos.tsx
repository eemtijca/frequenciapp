"use client";

// Faixa de gráficos com rolagem nativa, encaixe por cartão e navegação por teclado.
// Mantém formulários montados e limita o foco ao cartão em exibição.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";
import { AquecimentoGraficos } from "@/components/graficos/aquecimento-graficos";

interface Cartao {
  id: string;
  nome: string;
  conteudo: ReactNode;
}

function alvoInterativo(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof Element &&
    Boolean(
      alvo.closest(
        "a, button, input, select, textarea, label, [role='combobox'], [role='listbox'], [role='option']",
      ),
    )
  );
}

export default function FaixaGraficos({ cartoes, ativo }: { cartoes: Cartao[]; ativo: boolean }) {
  const faixa = useRef<HTMLDivElement>(null);
  const larguraFaixa = useRef(0);
  const indiceSalvo = useRef(0);
  const idSalvo = useRef<string | undefined>(undefined);
  const realinhando = useRef(false);
  // Instante até o qual a rolagem vale como gesto; evita um temporizador por evento.
  const intencionalAte = useRef(0);
  const animandoAte = useRef(0);
  const ticketAlinhar = useRef(0);
  // Toque em curso: o arrasto horizontal vale como gesto mesmo quando começa sobre um controle.
  const toque = useRef<{ x: number; y: number; arrastando: boolean } | null>(null);
  // Posições dos cartões, medidas só quando a largura muda, para o evento de rolagem não ler o layout.
  const posicoes = useRef<{ largura: number; esquerdas: number[] }>({ largura: 0, esquerdas: [] });
  const [indice, setIndice] = useState(0);
  const [altura, setAltura] = useState<number>();
  const [faixaVisivel, setFaixaVisivel] = useState(false);
  const ajudaId = useId();
  const posicaoId = useId();
  const faixaId = useId();
  const atual = Math.min(indice, cartoes.length - 1);
  const identidade = cartoes[atual]?.id;

  const esquerdaDoSalvo = useCallback((elemento: HTMLElement): number | null => {
    const primeiro = elemento.firstElementChild;
    const id = idSalvo.current;
    const cartao =
      (id ? elemento.querySelector(`[data-cartao="${CSS.escape(id)}"]`) : null) ??
      elemento.children.item(
        Math.min(indiceSalvo.current, Math.max(elemento.childElementCount - 1, 0)),
      );
    if (!(primeiro instanceof HTMLElement) || !(cartao instanceof HTMLElement)) return null;
    return cartao.offsetLeft - primeiro.offsetLeft;
  }, []);

  const posicoesDe = useCallback((elemento: HTMLElement): number[] => {
    const medidas = posicoes.current;
    if (
      medidas.largura === elemento.clientWidth &&
      medidas.esquerdas.length === elemento.childElementCount
    )
      return medidas.esquerdas;
    const primeiro = elemento.firstElementChild;
    const esquerdas =
      primeiro instanceof HTMLElement
        ? Array.from(elemento.children, (cartao) =>
            cartao instanceof HTMLElement ? cartao.offsetLeft - primeiro.offsetLeft : 0,
          )
        : [];
    posicoes.current = { largura: elemento.clientWidth, esquerdas };
    return esquerdas;
  }, []);

  const renovarIntencao = useCallback((elemento?: HTMLElement) => {
    intencionalAte.current = window.performance.now() + 200;
    animandoAte.current = 0;
    realinhando.current = false;
    ticketAlinhar.current += 1;
    // Escrever o mesmo valor a cada evento invalidaria o estilo sem necessidade.
    if (elemento && elemento.style.scrollSnapType !== "") elemento.style.scrollSnapType = "";
  }, []);

  // Recoloca o cartão salvo. O encaixe pode ficar suspenso para o navegador não puxar outra posição.
  const alinhar = useCallback((elemento: HTMLElement, esquerda: number, manterSnap: boolean) => {
    const ticket = ++ticketAlinhar.current;
    intencionalAte.current = 0;
    animandoAte.current = 0;
    realinhando.current = true;
    if (elemento.clientWidth > 0) larguraFaixa.current = elemento.clientWidth;
    elemento.style.scrollBehavior = "auto";
    elemento.style.scrollSnapType = "none";
    // Um salto de um pixel interrompe a rolagem suave que o navegador ainda anima.
    elemento.scrollTo({ left: esquerda + 1, behavior: "instant" });
    elemento.scrollTo({ left: esquerda, behavior: "instant" });
    window.requestAnimationFrame(() => {
      if (ticketAlinhar.current !== ticket) return;
      elemento.scrollTo({ left: esquerda, behavior: "instant" });
      if (manterSnap) elemento.style.scrollSnapType = "";
      elemento.style.scrollBehavior = "";
      window.requestAnimationFrame(() => {
        if (ticketAlinhar.current !== ticket) return;
        if (manterSnap && Math.abs(elemento.scrollLeft - esquerda) > 1) {
          elemento.style.scrollSnapType = "none";
          elemento.scrollTo({ left: esquerda, behavior: "instant" });
        }
        realinhando.current = false;
      });
    });
  }, []);

  useLayoutEffect(() => {
    const elemento = faixa.current;
    if (!ativo || !elemento) {
      larguraFaixa.current = 0;
      animandoAte.current = 0;
      realinhando.current = false;
      ticketAlinhar.current += 1;
      return;
    }
    const esquerda = esquerdaDoSalvo(elemento);
    if (esquerda === null) return;
    // Ocultar a visão pode zerar a rolagem. O cartão salvo volta antes do próximo evento.
    alinhar(elemento, esquerda, true);
  }, [ativo, cartoes.length, alinhar, esquerdaDoSalvo]);

  function irPara(destino: number) {
    const elemento = faixa.current;
    const primeiro = elemento?.firstElementChild;
    const cartao = elemento?.children.item(destino);
    if (!elemento || !(primeiro instanceof HTMLElement) || !(cartao instanceof HTMLElement)) return;
    indiceSalvo.current = destino;
    idSalvo.current = cartoes[destino]?.id;
    setIndice(destino);
    const esquerda = cartao.offsetLeft - primeiro.offsetLeft;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animandoAte.current = reduzido ? 0 : window.performance.now() + 700;
    intencionalAte.current = 0;
    elemento.scrollTo({ left: esquerda, behavior: reduzido ? "instant" : "smooth" });
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
    if (identidade) idSalvo.current = identidade;
    const observador = new ResizeObserver(() => {
      if (elemento.clientWidth === 0) {
        larguraFaixa.current = 0;
        return;
      }
      const barra = elemento.offsetHeight - elemento.clientHeight;
      setAltura(Math.ceil(cartao.getBoundingClientRect().height) + barra + 8);
      if (larguraFaixa.current === elemento.clientWidth) return;
      const esquerda = esquerdaDoSalvo(elemento);
      if (esquerda === null) return;
      alinhar(elemento, esquerda, true);
    });
    observador.observe(cartao);
    observador.observe(elemento);
    return () => {
      observador.disconnect();
    };
  }, [ativo, atual, identidade, cartoes.length, alinhar, esquerdaDoSalvo]);

  useEffect(() => {
    return () => {
      ticketAlinhar.current += 1;
    };
  }, []);

  // Só aquece os vizinhos com a faixa perto da tela, como o gráfico em exibição.
  useEffect(() => {
    const elemento = faixa.current;
    if (!ativo || !elemento || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => setFaixaVisivel(entradas.some((entrada) => entrada.isIntersecting)),
      { rootMargin: "160px 0px", threshold: 0 },
    );
    observador.observe(elemento);
    return () => {
      observador.disconnect();
      setFaixaVisivel(false);
    };
  }, [ativo]);

  return (
    <section
      aria-label="Gráficos do painel"
      aria-roledescription="carrossel"
      className="min-w-0 space-y-2"
    >
      <div
        role="group"
        aria-label="Navegação dos gráficos"
        className="hidden items-center justify-between gap-3 lg:flex"
      >
        <span className="text-sm font-medium">Gráficos</span>
        <div className="flex min-w-0 items-center gap-2">
          <Selecionar
            ariaLabel="Gráfico em exibição"
            value={cartoes[atual]?.id ?? ""}
            onValueChange={(id) => irPara(cartoes.findIndex((cartao) => cartao.id === id))}
            opcoes={cartoes.map((cartao) => ({ valor: cartao.id, rotulo: cartao.nome }))}
            className="w-56"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Gráfico anterior"
            aria-controls={faixaId}
            disabled={atual <= 0}
            onClick={() => irPara(atual - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo gráfico"
            aria-controls={faixaId}
            disabled={atual >= cartoes.length - 1}
            onClick={() => irPara(atual + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p id={ajudaId} className="sr-only">
        Deslize para os lados para ver os gráficos. Com o teclado, use as setas esquerda e direita.
      </p>
      {/* No celular não há seletor: as setas ficam acima dos cartões, sem cobrir os textos. */}
      <div
        role="group"
        aria-label="Setas dos gráficos"
        className="flex justify-end gap-2 lg:hidden"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Gráfico anterior"
          aria-controls={faixaId}
          disabled={atual <= 0}
          onClick={() => irPara(atual - 1)}
          className="size-10 rounded-full"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Próximo gráfico"
          aria-controls={faixaId}
          disabled={atual >= cartoes.length - 1}
          onClick={() => irPara(atual + 1)}
          className="size-10 rounded-full"
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div
        id={faixaId}
        ref={faixa}
        role="group"
        aria-label="Cartões de gráficos"
        aria-describedby={`${ajudaId} ${posicaoId}`}
        tabIndex={0}
        style={altura === undefined ? undefined : { height: altura }}
        className="focus-visible:ring-ring flex min-w-0 snap-x snap-mandatory items-start gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg pb-2 focus-visible:ring-2 focus-visible:outline-none"
        onPointerDown={(evento) => {
          if (alvoInterativo(evento.target)) return;
          renovarIntencao(evento.currentTarget);
        }}
        onWheel={(evento) => {
          renovarIntencao(evento.currentTarget);
        }}
        onTouchStart={(evento) => {
          const ponto = evento.touches[0];
          toque.current = ponto ? { x: ponto.clientX, y: ponto.clientY, arrastando: false } : null;
        }}
        onTouchMove={(evento) => {
          const atual = toque.current;
          const ponto = evento.touches[0];
          if (!atual || !ponto) return;
          const dx = Math.abs(ponto.clientX - atual.x);
          if (!atual.arrastando && dx > 3 && dx > Math.abs(ponto.clientY - atual.y))
            atual.arrastando = true;
          if (atual.arrastando) renovarIntencao(evento.currentTarget);
        }}
        onTouchEnd={(evento) => {
          // Os últimos eventos de rolagem e o encaixe chegam depois de soltar o dedo.
          if (toque.current?.arrastando) renovarIntencao(evento.currentTarget);
          toque.current = null;
        }}
        onTouchCancel={(evento) => {
          if (toque.current?.arrastando) renovarIntencao(evento.currentTarget);
          toque.current = null;
        }}
        onScroll={(evento) => {
          const elemento = evento.currentTarget;
          if (elemento.dataset.rolagemIntencional === "true") {
            delete elemento.dataset.rolagemIntencional;
            renovarIntencao(elemento);
          }
          // A mudança de largura pode gerar scroll antes do ResizeObserver.
          // O observador realinha o cartão vigente antes de recalcular a posição.
          if (!ativo || elemento.clientWidth === 0) return;
          const gesto =
            window.performance.now() < intencionalAte.current || toque.current?.arrastando === true;
          if (!gesto && (realinhando.current || elemento.clientWidth !== larguraFaixa.current))
            return;
          if (!gesto && window.performance.now() < animandoAte.current) return;
          let proximo = 0;
          let distancia = Infinity;
          posicoesDe(elemento).forEach((esquerda, posicao) => {
            const diferenca = Math.abs(esquerda - elemento.scrollLeft);
            if (diferenca < distancia) {
              distancia = diferenca;
              proximo = posicao;
            }
          });
          // Ocultar a visão e o encaixe do navegador não escolhem outro cartão.
          if (!gesto) {
            const esquerda = esquerdaDoSalvo(elemento);
            if (esquerda !== null && Math.abs(elemento.scrollLeft - esquerda) > 1)
              alinhar(elemento, esquerda, false);
            return;
          }
          renovarIntencao(elemento);
          // Posição no meio do caminho, sem encaixe, não troca o cartão vigente.
          if (distancia > 16) return;
          if (proximo !== atual) {
            const anterior = elemento.children.item(atual);
            if (anterior?.contains(document.activeElement)) elemento.focus({ preventScroll: true });
            indiceSalvo.current = proximo;
            idSalvo.current = cartoes[proximo]?.id;
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
            data-cartao={cartao.id}
            aria-label={`${posicao + 1} de ${cartoes.length}: ${cartao.nome}`}
            aria-roledescription="cartão"
            aria-hidden={posicao !== atual}
            inert={posicao !== atual}
            className="min-w-0 shrink-0 basis-full snap-start snap-always space-y-4"
          >
            <AquecimentoGraficos.Provider value={faixaVisivel && Math.abs(posicao - atual) === 1}>
              {cartao.conteudo}
            </AquecimentoGraficos.Provider>
          </article>
        ))}
      </div>
      <p id={posicaoId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {atual + 1} de {cartoes.length} · {cartoes[atual]?.nome}
      </p>
    </section>
  );
}
