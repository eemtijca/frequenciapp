"use client";

// Interruptor da preferência de animações, usado no menu de sessão e na
// barra lateral. O estado é por dispositivo.
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { animacoesLigadas, assinarAnimacoes, definirAnimacoes } from "@/lib/animacoes";

interface Props {
  id: string;
  className?: string;
}

export function ControleAnimacoes({ id, className }: Props) {
  const ligadas = useSyncExternalStore(assinarAnimacoes, animacoesLigadas, () => true);
  return (
    <div className={`flex items-start justify-between gap-3 ${className ?? ""}`}>
      <div className="min-w-0">
        <Label htmlFor={id}>Animações</Label>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Desligadas, as telas trocam sem transição. O carregamento continua igual.
        </p>
      </div>
      <Switch id={id} checked={ligadas} onCheckedChange={definirAnimacoes} />
    </div>
  );
}
