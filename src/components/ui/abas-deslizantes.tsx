"use client";

// Abas com paginador deslizante: indicador com mola, pílula acompanhando o
// gesto no celular e troca instantânea com deslize curto no desktop.
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export interface AbaItem<T extends string> {
  valor: T;
  rotulo: string;
  icone: LucideIcon;
}

interface Props<T extends string> {
  rotuloAcessivel: string;
  abaInicial: T;
  abas: AbaItem<T>[];
  chaveIndicador: string;
  dataPager: string;
  children: (aba: T, ativa: boolean) => React.ReactNode;
}

export default function AbasDeslizantes<T extends string>({
  rotuloAcessivel,
  abaInicial,
  abas,
  chaveIndicador,
  dataPager,
  children,
}: Props<T>) {
  const [aba, setAba] = useState<T>(abaInicial);
  const [visitadas, setVisitadas] = useState<Set<T>>(() => new Set([abaInicial]));
  const [ehDesktop, setEhDesktop] = useState(false);
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceAba = useRef(
    Math.max(
      0,
      abas.findIndex((item) => item.valor === abaInicial),
    ),
  );
  const rolagemProgramatica = useRef(false);
  const quadroRolagem = useRef<number | null>(null);
  const timerRolagem = useRef<number | null>(null);
  const controles = useAnimationControls();
  const reduzirMovimento = useReducedMotion() ?? false;

  // No desktop o painel é largo demais para a rolagem suave: a troca é
  // instantânea e o conteúdo faz um deslize curto. No celular, o paginador
  // nativo com arrasto continua valendo.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const atualizar = () => setEhDesktop(media.matches);
    atualizar();
    media.addEventListener("change", atualizar);
    return () => media.removeEventListener("change", atualizar);
  }, []);

  const trocarAba = useCallback(
    (proxima: T, focar = false) => {
      const indice = abas.findIndex((item) => item.valor === proxima);
      if (indice < 0) return;
      const indiceAtual = abas.findIndex((item) => item.valor === aba);
      if (timerRolagem.current !== null) {
        window.clearTimeout(timerRolagem.current);
        timerRolagem.current = null;
      }
      setAba(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
      const pager = pagerRef.current;
      if (pager) {
        indiceAba.current = indice;
        // A rolagem por toque não deve mudar a aba ao passar pelas do meio.
        rolagemProgramatica.current = true;
        pager.scrollTo({
          left: indice * pager.clientWidth,
          behavior: ehDesktop || reduzirMovimento ? "auto" : "smooth",
        });
        // Rede de segurança para navegadores sem scrollend.
        timerRolagem.current = window.setTimeout(() => {
          timerRolagem.current = null;
          rolagemProgramatica.current = false;
        }, 700);
      }
      if (ehDesktop && !reduzirMovimento && indice !== indiceAtual) {
        controles.set({ x: (indice > indiceAtual ? 1 : -1) * 24, opacity: 0.65 });
        void controles.start({
          x: 0,
          opacity: 1,
          transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
        });
      }
      if (focar) abasRef.current[indice]?.focus();
    },
    [aba, abas, controles, ehDesktop, reduzirMovimento],
  );

  // A pílula acompanha o gesto: a cada quadro, o índice visível vira a aba
  // ativa. Na rolagem programática (toque na aba), o estado não muda, então
  // a pílula vai direto ao destino sem passear pelas abas do meio.
  const aoRolar = useCallback(() => {
    if (quadroRolagem.current !== null) return;
    quadroRolagem.current = window.requestAnimationFrame(() => {
      quadroRolagem.current = null;
      const pager = pagerRef.current;
      if (!pager) return;
      const largura = pager.clientWidth;
      if (largura === 0) return;
      const indice = Math.max(0, Math.min(abas.length - 1, Math.round(pager.scrollLeft / largura)));
      const atual = abas[indice];
      if (!atual) return;
      setVisitadas((atuais) => {
        const proximas = new Set(atuais);
        proximas.add(atual.valor);
        const vizinha = abas[indice + 1] ?? abas[indice - 1];
        if (vizinha) proximas.add(vizinha.valor);
        return proximas.size === atuais.size ? atuais : proximas;
      });
      if (rolagemProgramatica.current || indiceAba.current === indice) return;
      indiceAba.current = indice;
      startTransition(() => {
        setAba(atual.valor);
      });
    });
  }, [abas]);

  // Fecha a rolagem no evento nativo quando existir, com o temporizador como
  // rede de segurança para navegadores sem scrollend.
  const fecharRolagem = useCallback(() => {
    if (timerRolagem.current !== null) {
      window.clearTimeout(timerRolagem.current);
      timerRolagem.current = null;
    }
    rolagemProgramatica.current = false;
    const pager = pagerRef.current;
    if (!pager) return;
    const largura = pager.clientWidth;
    if (largura === 0) return;
    const indice = Math.max(0, Math.min(abas.length - 1, Math.round(pager.scrollLeft / largura)));
    const atual = abas[indice];
    if (!atual) return;
    indiceAba.current = indice;
    startTransition(() => {
      setAba((anterior) => (anterior === atual.valor ? anterior : atual.valor));
      setVisitadas((atuais) =>
        atuais.has(atual.valor) ? atuais : new Set(atuais).add(atual.valor),
      );
    });
  }, [abas]);

  // Limpa quadro e temporizador ao desmontar.
  useEffect(() => {
    return () => {
      if (quadroRolagem.current !== null) window.cancelAnimationFrame(quadroRolagem.current);
      if (timerRolagem.current !== null) window.clearTimeout(timerRolagem.current);
    };
  }, []);

  // O evento nativo de fim de rolagem não existe em todos os navegadores.
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.addEventListener("scrollend", fecharRolagem);
    return () => pager.removeEventListener("scrollend", fecharRolagem);
  }, [fecharRolagem]);

  // Ao redimensionar a janela, reencaixa o paginador na aba ativa.
  useEffect(() => {
    function reencaixar() {
      const pager = pagerRef.current;
      const indice = abas.findIndex((item) => item.valor === aba);
      if (pager && indice >= 0) {
        indiceAba.current = indice;
        pager.scrollTo({ left: indice * pager.clientWidth, behavior: "auto" });
      }
    }
    window.addEventListener("resize", reencaixar);
    return () => window.removeEventListener("resize", reencaixar);
  }, [aba, abas]);

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const indice = abas.findIndex((item) => item.valor === aba);
    const proximo = evento.key === "ArrowRight" ? indice + 1 : indice - 1;
    const item = abas[(proximo + abas.length) % abas.length];
    if (item) trocarAba(item.valor, true);
  }

  const indiceAtivo = abas.findIndex((item) => item.valor === aba);

  return (
    <>
      <div
        role="tablist"
        aria-label={rotuloAcessivel}
        onKeyDown={aoTeclar}
        className="bg-secondary/60 grid gap-1 rounded-lg p-1"
        style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}
      >
        {abas.map((item, indice) => {
          const Icone = item.icone;
          const ativo = aba === item.valor;
          return (
            <button
              key={item.valor}
              ref={(elemento) => {
                abasRef.current[indice] = elemento;
              }}
              id={`aba-${item.valor}`}
              type="button"
              role="tab"
              aria-selected={ativo}
              aria-controls={`painel-${item.valor}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => trocarAba(item.valor)}
              className="relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:text-xs"
            >
              {ativo && (
                <motion.span
                  layoutId={chaveIndicador}
                  className="bg-background absolute inset-0 rounded-md shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icone
                size={15}
                className={`relative z-10 ${ativo ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span
                className={`relative z-10 ${ativo ? "text-foreground" : "text-muted-foreground"}`}
              >
                {item.rotulo}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div animate={controles} initial={false} className="min-w-0">
        <div
          ref={pagerRef}
          onScroll={aoRolar}
          data-pager={dataPager}
          className="pagina-sem-barra flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        >
          {abas.map((item, indice) => {
            const ativo = item.valor === aba;
            const distante = Math.abs(indice - indiceAtivo) > 1;
            return (
              <div
                key={item.valor}
                id={`painel-${item.valor}`}
                role="tabpanel"
                aria-labelledby={`aba-${item.valor}`}
                aria-hidden={!ativo}
                inert={!ativo}
                data-distante={distante ? "true" : undefined}
                onPointerDown={() => {
                  rolagemProgramatica.current = false;
                }}
                onWheel={() => {
                  rolagemProgramatica.current = false;
                }}
                className="pagina-painel w-full shrink-0 snap-start"
              >
                {visitadas.has(item.valor) ? children(item.valor, ativo) : null}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
