"use client";

// Gráficos do painel: carrossel controlado, um cartão por vez e estado preservado.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CarrosselCartoes, type ItemCarrossel } from "@/components/ui/carrossel-cartoes";
import { Selecionar } from "@/components/ui/selecionar";

interface Props {
  itens: ItemCarrossel[];
  valor: string;
  onValor: (id: string) => void;
  ocupado?: boolean;
}

export default function FaixaGraficos({ itens, valor, onValor, ocupado }: Props) {
  const indice = Math.max(
    0,
    itens.findIndex((item) => item.id === valor),
  );
  const atual = itens[indice];
  const [visitados, setVisitados] = useState<string[]>(() => [valor]);
  if (!atual) return null;

  function selecionar(id: string) {
    setVisitados((atuais) => (atuais.includes(id) ? atuais : [...atuais, id]));
    onValor(id);
  }

  function irPara(destino: number) {
    const proximo = itens[Math.min(Math.max(destino, 0), itens.length - 1)];
    if (proximo) selecionar(proximo.id);
  }

  return (
    <section aria-label="Gráficos do painel" className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium">Gráficos</h2>
        <div
          className="flex min-w-0 items-center gap-2"
          role="group"
          aria-label="Navegação dos gráficos"
        >
          <Selecionar
            ariaLabel="Gráfico em exibição"
            value={atual.id}
            onValueChange={selecionar}
            opcoes={itens.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
            className="min-w-0 flex-1 sm:w-56 sm:flex-none"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Gráfico anterior"
            disabled={indice <= 0}
            onClick={() => irPara(indice - 1)}
            className="size-11 shrink-0"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo gráfico"
            disabled={indice >= itens.length - 1}
            onClick={() => irPara(indice + 1)}
            className="size-11 shrink-0"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <CarrosselCartoes
        itens={itens}
        valor={atual.id}
        visitados={visitados}
        onValor={selecionar}
        rotuloAcessivel="Cartões de gráficos"
        ocupado={ocupado}
      />
    </section>
  );
}
