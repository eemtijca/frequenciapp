// Gatilho padrão dos seletores e campos de escolha, com a mesma moldura visual.
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

function GatilhoSelecao({ className, type = "button", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button
      type={type}
      data-slot="gatilho-selecao"
      className={cn(
        "campo pressionavel flex h-11 w-full items-center gap-2 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { GatilhoSelecao };
