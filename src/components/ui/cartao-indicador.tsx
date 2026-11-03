// Cartão de indicador com título, ação opcional e área de conteúdo alinhada.
import type { ReactNode } from "react";
import { Cartao, CartaoCabecalho, CartaoTitulo } from "@/components/ui/cartao";
import { cn } from "@/lib/utils";

interface Props {
  titulo: string;
  children: ReactNode;
  acao?: ReactNode;
  rotuloAcessivel?: string;
  ocupado?: boolean;
  className?: string;
}

function CartaoIndicador({ titulo, children, acao, rotuloAcessivel, ocupado, className }: Props) {
  return (
    <Cartao
      variante="indicador"
      role="group"
      aria-label={rotuloAcessivel ?? titulo}
      aria-busy={ocupado}
      className={cn("min-w-0", className)}
    >
      <CartaoCabecalho>
        <CartaoTitulo>{titulo}</CartaoTitulo>
        {acao}
      </CartaoCabecalho>
      {children}
    </Cartao>
  );
}

export { CartaoIndicador };
