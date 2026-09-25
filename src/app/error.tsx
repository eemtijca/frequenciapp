"use client";

// Fronteira de erro da rota raiz: mensagem clara e ação de recarga.
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Algo saiu do esperado</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Não foi possível carregar a aplicação. Verifique a conexão com o banco de dados e tente
        novamente.
      </p>
      <Button variant="outline" size="lg" className="h-11 rounded-lg" onClick={reset}>
        <RefreshCw size={16} />
        Tentar novamente
      </Button>
    </main>
  );
}
