"use client";

// Trava de ação única: ignora o segundo toque antes de o disabled do React
// chegar ao DOM e devolve o estado ocupado para o controle.
import { useCallback, useRef, useState } from "react";

export function useAcaoUnica<T>(acao: () => Promise<T> | T) {
  const [executando, setExecutando] = useState(false);
  const emAndamento = useRef(false);
  const acaoAtual = useRef(acao);
  acaoAtual.current = acao;

  const executar = useCallback(async () => {
    if (emAndamento.current) return undefined;
    emAndamento.current = true;
    setExecutando(true);
    try {
      return await acaoAtual.current();
    } finally {
      emAndamento.current = false;
      setExecutando(false);
    }
  }, []);

  return { executando, executar };
}

export function useAcoesPorChave() {
  const [chaveAtiva, setChaveAtiva] = useState<string | null>(null);
  const emAndamento = useRef(new Set<string>());

  const executar = useCallback(async (chave: string, acao: () => Promise<unknown>) => {
    if (emAndamento.current.has(chave)) return;
    emAndamento.current.add(chave);
    setChaveAtiva(chave);
    try {
      return await acao();
    } finally {
      emAndamento.current.delete(chave);
      setChaveAtiva(null);
    }
  }, []);

  return { chaveAtiva, executar };
}
