"use client";

// Avisos acima do conteúdo, preservando o acesso ao cabeçalho no celular.
import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";
import { cn } from "@/lib/utils";

const Toaster = ({ className, toastOptions, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={cn(
        "toaster group [--aviso-topo:calc(4.5rem_+_env(safe-area-inset-top))] lg:[--aviso-topo:2rem]",
        className,
      )}
      offset={{ top: "var(--aviso-topo)" }}
      mobileOffset={{ top: "var(--aviso-topo)" }}
      style={
        {
          fontFamily: "var(--font-sans)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("vidro-reflexo", toastOptions?.classNames?.toast),
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
