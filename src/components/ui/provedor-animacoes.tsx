"use client";

// Aplica a preferência de animações ao Motion. Desligada, nenhuma
// transformação ou opacidade anima; ligada, a preferência do sistema vale.
import { MotionConfig } from "motion/react";
import { useSyncExternalStore } from "react";
import { animacoesLigadas, assinarAnimacoes } from "@/lib/animacoes";

export default function ProvedorAnimacoes({ children }: { children: React.ReactNode }) {
  const ligadas = useSyncExternalStore(assinarAnimacoes, animacoesLigadas, () => true);
  return (
    <MotionConfig
      reducedMotion={ligadas ? "user" : "always"}
      transition={ligadas ? undefined : { duration: 0 }}
    >
      {children}
    </MotionConfig>
  );
}
