"use client";

// Campo de senha com botão de exibir/ocultar. O tipo alterna sem perder o
// autofill, porque name e autoComplete seguem no próprio campo.
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type">;

function CampoSenha({ className, ...props }: Props) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <Input type={visivel ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        onClick={() => setVisivel((atual) => !atual)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        {visivel ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  );
}

export { CampoSenha };
