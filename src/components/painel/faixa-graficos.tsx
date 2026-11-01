"use client";

// Gráficos do painel: um cartão por vez, com seletor e botões, sem rolagem lateral.
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";
import { AquecimentoGraficos } from "@/components/graficos/aquecimento-graficos";

interface Cartao {
  id: string;
  nome: string;
  conteudo: ReactNode;
}

export default function FaixaGraficos({
  cartoes,
  ativo,
  onCartaoAtivo,
}: {
  cartoes: Cartao[];
  ativo: boolean;
  onCartaoAtivo?: (id: string) => void;
}) {
  const [indice, setIndice] = useState(0);
  const posicaoId = useId();
  const atual = Math.min(indice, Math.max(cartoes.length - 1, 0));
  const cartaoAtual = cartoes[atual];
  const identidade = cartaoAtual?.id;

  useEffect(() => {
    if (ativo && identidade) onCartaoAtivo?.(identidade);
  }, [ativo, identidade, onCartaoAtivo]);

  function irPara(destino: number) {
    const proximo = Math.min(Math.max(destino, 0), cartoes.length - 1);
    if (proximo === atual) return;
    setIndice(proximo);
  }

  if (!cartaoAtual) return null;

  return (
    <section
      aria-label="Gráficos do painel"
      aria-roledescription="seção"
      className="min-w-0 space-y-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium">Gráficos</h2>
        <div
          className="flex min-w-0 items-center gap-2"
          role="group"
          aria-label="Navegação dos gráficos"
        >
          <Selecionar
            ariaLabel="Gráfico em exibição"
            value={cartaoAtual.id}
            onValueChange={(id) => irPara(cartoes.findIndex((cartao) => cartao.id === id))}
            opcoes={cartoes.map((cartao) => ({ valor: cartao.id, rotulo: cartao.nome }))}
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Gráfico anterior"
            disabled={atual <= 0}
            onClick={() => irPara(atual - 1)}
            className="size-11 shrink-0"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo gráfico"
            disabled={atual >= cartoes.length - 1}
            onClick={() => irPara(atual + 1)}
            className="size-11 shrink-0"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Cartões de gráficos"
        tabIndex={0}
        className="focus-visible:ring-ring min-w-0 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        onKeyDown={(evento) => {
          if (evento.target !== evento.currentTarget) return;
          if (evento.key === "ArrowLeft") irPara(atual - 1);
          else if (evento.key === "ArrowRight") irPara(atual + 1);
          else if (evento.key === "Home") irPara(0);
          else if (evento.key === "End") irPara(cartoes.length - 1);
          else return;
          evento.preventDefault();
        }}
      >
        {cartoes.map((cartao, posicao) => {
          const visivel = posicao === atual;
          return (
            <div
              key={cartao.id}
              data-cartao={cartao.id}
              role="article"
              aria-roledescription="cartão"
              hidden={!visivel}
              inert={!visivel}
              aria-label={`${posicao + 1} de ${cartoes.length}: ${cartao.nome}`}
              className="min-w-0"
            >
              <AquecimentoGraficos.Provider value={visivel && ativo}>
                {cartao.conteudo}
              </AquecimentoGraficos.Provider>
            </div>
          );
        })}
      </div>

      <p id={posicaoId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {atual + 1} de {cartoes.length} · {cartaoAtual.nome}
      </p>
    </section>
  );
}
