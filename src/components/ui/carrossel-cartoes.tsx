"use client";

// Carrossel controlado que monta o cartão ativo e conserva os cartões já visitados.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ItemCarrossel {
  id: string;
  rotulo: string;
  render: (ativo: boolean) => ReactNode;
}

interface Props {
  itens: ItemCarrossel[];
  valor: string;
  onValor: (id: string) => void;
  rotuloAcessivel: string;
  ocupado?: boolean;
  className?: string;
  children?: (ativo: ItemCarrossel, indice: number) => ReactNode;
}

function CarrosselCartoes({
  itens,
  valor,
  onValor,
  rotuloAcessivel,
  ocupado = false,
  className,
  children,
}: Props) {
  const statusId = useId();
  const [visitados, setVisitados] = useState<Set<string>>(() => new Set([valor]));
  const area = useRef<HTMLDivElement>(null);
  const indice = Math.max(
    0,
    itens.findIndex((item) => item.id === valor),
  );
  const ativo = itens[indice];

  useEffect(() => {
    setVisitados((atuais) => (atuais.has(valor) ? atuais : new Set(atuais).add(valor)));
  }, [valor]);

  const ids = useMemo(() => new Set(itens.map((item) => item.id)), [itens]);
  const visitadosValidos = useMemo(
    () => [...visitados].filter((id) => ids.has(id)),
    [ids, visitados],
  );

  function irPara(destino: number) {
    const proximo = itens[Math.min(Math.max(destino, 0), itens.length - 1)];
    if (proximo) onValor(proximo.id);
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.target !== evento.currentTarget) return;
    if (evento.key === "ArrowLeft") irPara(indice - 1);
    else if (evento.key === "ArrowRight") irPara(indice + 1);
    else if (evento.key === "Home") irPara(0);
    else if (evento.key === "End") irPara(itens.length - 1);
    else return;
    evento.preventDefault();
  }

  if (!ativo) return null;

  return (
    <div
      ref={area}
      role="group"
      aria-roledescription="carrossel"
      aria-label={rotuloAcessivel}
      aria-describedby={statusId}
      tabIndex={0}
      onKeyDown={aoTeclar}
      className={cn("relative min-w-0 focus-visible:outline-none", className)}
    >
      {itens.map((item, posicao) => {
        const visivel = item.id === ativo.id;
        const visitado = visitadosValidos.includes(item.id);
        if (!visivel && !visitado) return null;
        return (
          <div
            key={item.id}
            data-cartao={item.id}
            data-ativo={visivel ? "true" : "false"}
            role="article"
            aria-roledescription="cartão"
            aria-label={`${posicao + 1} de ${itens.length}: ${item.rotulo}`}
            aria-hidden={!visivel}
            inert={!visivel}
            aria-busy={visivel && ocupado}
            className={cn(
              "min-w-0",
              !visivel && "pointer-events-none invisible absolute inset-x-0 top-0 w-full",
            )}
          >
            {item.render(visivel)}
          </div>
        );
      })}
      <p id={statusId} role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {indice + 1} de {itens.length} · {ativo.rotulo}
      </p>
      {children?.(ativo, indice)}
    </div>
  );
}

export { CarrosselCartoes };
