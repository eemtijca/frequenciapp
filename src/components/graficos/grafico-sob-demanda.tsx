"use client";

// Monta uma visualização uma vez, quando próxima da tela ou quando o carrossel pede o aquecimento;
// mantém o estado depois da visita.
import LimiteErroGrafico from "./limite-erro-grafico";
import { AquecimentoGraficos } from "./aquecimento-graficos";
import { Suspense, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export default function GraficoSobDemanda({
  children,
  espera,
}: {
  children: ReactNode;
  espera: ReactNode;
}) {
  const elemento = useRef<HTMLDivElement>(null);
  const [pronto, setPronto] = useState(false);
  const aquecer = useContext(AquecimentoGraficos);
  useEffect(() => {
    if (!aquecer || pronto) return;
    // Em tempo ocioso, para a montagem não competir com o gesto de rolagem; o limite de
    // tempo evita que uma página sempre ocupada nunca aqueça o vizinho.
    const montar = () => setPronto(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(montar, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(montar, 200);
    return () => window.clearTimeout(id);
  }, [aquecer, pronto]);
  useEffect(() => {
    const alvo = elemento.current;
    if (pronto || !alvo) return;
    let cancelado = false;
    if (typeof IntersectionObserver === "undefined") {
      // Navegadores sem observação continuam exibindo o gráfico após a hidratação.
      queueMicrotask(() => {
        if (!cancelado) setPronto(true);
      });
      return () => {
        cancelado = true;
      };
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!cancelado && entradas.some((entrada) => entrada.isIntersecting)) {
          setPronto(true);
          observador.disconnect();
        }
      },
      { rootMargin: "160px 0px", threshold: 0 },
    );
    observador.observe(alvo);
    return () => {
      cancelado = true;
      observador.disconnect();
    };
  }, [pronto]);

  return (
    <div
      ref={elemento}
      data-grafico-sob-demanda={pronto ? "visitado" : "aguardando"}
      onKeyDown={(evento) => {
        // As setas navegam os dados do gráfico sem rolar o carrossel por ação nativa.
        if (
          (evento.key === "ArrowLeft" || evento.key === "ArrowRight") &&
          evento.target instanceof Element &&
          evento.target.closest('[role="application"]')
        )
          evento.preventDefault();
      }}
    >
      {pronto ? (
        <LimiteErroGrafico>
          <Suspense fallback={espera}>{children}</Suspense>
        </LimiteErroGrafico>
      ) : (
        espera
      )}
    </div>
  );
}
