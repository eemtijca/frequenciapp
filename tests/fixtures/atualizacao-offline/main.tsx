import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import {
  ProvedorAtualizacao,
  useAtualizacaoTela,
} from "@/components/atualizacao/contexto-atualizacao";
import { BotaoAtualizar } from "@/components/ui/botao-atualizar";

// Dados sintéticos. O callback é um spy controlado: não faz I/O e só conclui
// quando o teste libera sua Promise; o provider, o botão e o toast são reais.
function Tela() {
  const [chamadas, setChamadas] = useState(0);
  const [dados, setDados] = useState("Dados sintéticos preservados");
  const elemento = useRef<HTMLElement>(null);
  const liberar = useRef<(() => void) | null>(null);

  useAtualizacaoTela("painel", async () => {
    setChamadas((n) => n + 1);
    await new Promise<void>((resolve) => {
      liberar.current = resolve;
    });
    liberar.current = null;
    setDados("Dados sintéticos atualizados");
  });
  useEffect(() => {
    if (elemento.current) elemento.current.dataset.montado = "true";
  }, []);

  return (
    <main ref={elemento}>
      <BotaoAtualizar />
      <p data-testid="dados">{dados}</p>
      <output data-testid="chamadas">{chamadas}</output>
      <button type="button" onClick={() => liberar.current?.()}>
        Concluir callback sintético
      </button>
      <Toaster position="bottom-right" />
    </main>
  );
}

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
createRoot(raiz).render(
  <ProvedorAtualizacao ativo="painel">
    <Tela />
  </ProvedorAtualizacao>,
);
