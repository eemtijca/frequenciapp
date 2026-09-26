"use client";

// Fronteira de erro da rota raiz: tela padrão com recarga e volta ao início.
import { useEffect } from "react";
import { TelaEstado } from "@/components/ui/tela-estado";

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha na rota raiz:", error);
  }, [error]);

  return (
    <TelaEstado
      variante="erro_interno"
      codigo={500}
      referencia={error.digest}
      acao={{ rotulo: "Tentar novamente", onClick: reset }}
      acaoSecundaria={{ rotulo: "Ir para o início", href: "/" }}
    />
  );
}
