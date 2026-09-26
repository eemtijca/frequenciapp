"use client";

// Abas com pílula indicadora: troca instantânea por toque, teclado e botões,
// com deslize curto do conteúdo no desktop.
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export interface AbaItem<T extends string> {
  valor: T;
  rotulo: string;
  /** Rótulo curto no celular, quando o nome cheio não cabe na aba. */
  rotuloCurto?: string;
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
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const controles = useAnimationControls();
  const semMovimento = useReducedMotion() ?? false;

  // A troca por toque é instantânea em qualquer largura. No desktop o
  // conteúdo faz um deslize curto.
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
      setAba(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
      if (ehDesktop && !semMovimento && indice !== indiceAtual) {
        controles.set({ x: (indice > indiceAtual ? 1 : -1) * 24, opacity: 0.65 });
        void controles.start({
          x: 0,
          opacity: 1,
          transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] },
        });
      }
      if (focar) abasRef.current[indice]?.focus();
    },
    [aba, abas, controles, ehDesktop, semMovimento],
  );

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const indice = abas.findIndex((item) => item.valor === aba);
    const proximo = evento.key === "ArrowRight" ? indice + 1 : indice - 1;
    const item = abas[(proximo + abas.length) % abas.length];
    if (item) trocarAba(item.valor, true);
  }

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
              aria-label={item.rotuloCurto ? item.rotulo : undefined}
              aria-selected={ativo}
              aria-controls={`painel-${item.valor}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => trocarAba(item.valor)}
              className="pressionavel relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium transition-colors sm:flex-row sm:gap-1.5 sm:text-xs"
            >
              {ativo &&
                (semMovimento ? (
                  <span className="bg-background absolute inset-0 rounded-md shadow-sm" />
                ) : (
                  <motion.span
                    layoutId={chaveIndicador}
                    className="bg-background absolute inset-0 rounded-md shadow-sm"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                ))}
              <Icone
                size={15}
                className={`relative z-10 ${ativo ? "text-primary" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
              <span
                className={`relative z-10 ${ativo ? "text-foreground" : "text-muted-foreground"}`}
              >
                {item.rotuloCurto ? (
                  <>
                    <span className="sm:hidden">{item.rotuloCurto}</span>
                    <span className="hidden sm:inline">{item.rotulo}</span>
                  </>
                ) : (
                  item.rotulo
                )}
              </span>
            </button>
          );
        })}
      </div>

      <motion.div animate={controles} initial={false} className="min-w-0">
        <div data-pager={dataPager} className="min-w-0">
          {abas.map((item) => {
            const ativo = item.valor === aba;
            if (!ativo && !visitadas.has(item.valor)) return null;
            return (
              <div
                key={item.valor}
                id={`painel-${item.valor}`}
                role="tabpanel"
                aria-labelledby={`aba-${item.valor}`}
                aria-hidden={!ativo}
                inert={!ativo}
                hidden={!ativo}
                className="pagina-painel min-w-0"
              >
                {children(item.valor, ativo)}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
