"use client";

// Diálogos e folhas com a mesma superfície das demais áreas do aplicativo.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  folha = false,
  lateral,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** No celular, abre como folha inferior em vez de modal centralizado. */
  folha?: boolean;
  /**
   * Abre um painel pela lateral, com a altura disponível do dispositivo. Recebe o
   * estado aberto do diálogo controlado, que anima o véu próprio da gaveta.
   */
  lateral?: { aberto: boolean };
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      {lateral ? (
        // Véu próprio, sem a trava de rolagem do overlay do Radix: a trava grava uma
        // variável herdada no body e obriga a recalcular o estilo do app inteiro ao
        // abrir e ao fechar. O body do app não rola, então a trava não protege nada.
        <div
          data-slot="dialog-veu"
          data-state={lateral.aberto ? "open" : "closed"}
          aria-hidden="true"
          className="pointer-events-auto fixed inset-0 z-50 touch-none bg-black/50 data-[state=closed]:animate-[veu-sai_160ms_ease-in] data-[state=open]:animate-[veu-entra_220ms_ease-out]"
        />
      ) : (
        <DialogOverlay />
      )}
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "superficie-vidro fixed z-50",
          lateral
            ? // A gaveta é opaca e anima só o deslocamento: desfoque e opacidade sobre a
              // altura toda da tela travam a animação no celular.
              "bg-popover inset-y-0 left-0 flex h-dvh w-[min(15rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-l-none border-y-0 border-l-0 data-[state=closed]:animate-[gaveta-sai_160ms_cubic-bezier(0.4,0,1,1)] data-[state=open]:animate-[gaveta-entra_220ms_cubic-bezier(0.32,0.72,0,1)]"
            : "vidro-flutuante data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 top-[50%] left-[50%] grid max-h-[90dvh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain p-6 duration-200 sm:max-w-lg",
          folha &&
            !lateral &&
            "max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[92dvh] max-sm:translate-y-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="vidro-discreto focus-visible:ring-ring pressionavel absolute top-2 right-2 flex size-11 items-center justify-center opacity-70 transition-colors hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-snug font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
