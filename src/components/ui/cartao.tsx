// Cartão compartilhado com variantes de superfície e cabeçalho opcional.
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type VarianteCartao = "padrao" | "interna" | "indicador";

const VARIANTES: Record<VarianteCartao, string> = {
  padrao: "superficie",
  interna: "superficie-interna",
  indicador: "superficie flex flex-col justify-between gap-2 p-3.5 sm:px-5 sm:py-4",
};

function Cartao({
  className,
  variante = "padrao",
  ...props
}: ComponentProps<"div"> & { variante?: VarianteCartao }) {
  return (
    <div
      data-slot="cartao"
      data-variante={variante}
      className={cn(VARIANTES[variante], className)}
      {...props}
    />
  );
}

function CartaoCabecalho({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="cartao-cabecalho"
      className={cn("flex min-w-0 items-center justify-between gap-3", className)}
      {...props}
    />
  );
}

function CartaoTitulo({ className, children, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      data-slot="cartao-titulo"
      className={cn("min-w-0 text-sm font-medium sm:text-base", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

function CartaoConteudo({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="cartao-conteudo"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    />
  );
}

function CartaoAcoes({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex shrink-0 items-center gap-1", className)}>{children}</div>;
}

export { Cartao, CartaoAcoes, CartaoCabecalho, CartaoConteudo, CartaoTitulo };
