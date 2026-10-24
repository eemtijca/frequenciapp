"use client";

// Registro da atualização da tela ativa: cada visão informa como recarregar os
// próprios dados e o botão global executa apenas esse registro.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { avisarErro, avisarInfo } from "@/lib/avisos";

type Atualizador = () => Promise<void> | void;

interface ContextoAtualizacao {
  registrar: (id: string, atualizar: Atualizador | null) => void;
  atualizar: () => Promise<void>;
  ocupado: boolean;
  disponivel: boolean;
}

const Contexto = createContext<ContextoAtualizacao | null>(null);

export function useContextoAtualizacao(): ContextoAtualizacao | null {
  return useContext(Contexto);
}

export function ProvedorAtualizacao({ ativo, children }: { ativo: string; children: ReactNode }) {
  const atualizadores = useRef(new Map<string, Atualizador>());
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [ocupado, setOcupado] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const marcarOffline = () => setOnline(false);
    const marcarOnline = () => setOnline(true);
    window.addEventListener("offline", marcarOffline);
    window.addEventListener("online", marcarOnline);
    return () => {
      window.removeEventListener("offline", marcarOffline);
      window.removeEventListener("online", marcarOnline);
    };
  }, []);

  const registrar = useCallback((id: string, atualizar: Atualizador | null) => {
    if (atualizar) atualizadores.current.set(id, atualizar);
    else atualizadores.current.delete(id);
    setIds(new Set(atualizadores.current.keys()));
  }, []);

  const disponivel = ids.has(ativo);
  const atualizarRef = useRef<() => Promise<void>>(async () => {});

  const atualizar = useCallback(async () => {
    const executar = atualizadores.current.get(ativo);
    if (!executar || ocupado) return;
    const semConexao = !online || (typeof navigator !== "undefined" && navigator.onLine === false);
    if (semConexao) {
      avisarInfo("Sem conexão. Os dados atuais continuam na tela.");
      return;
    }
    setOcupado(true);
    try {
      await executar();
    } catch (excecao) {
      avisarErro(excecao, {
        contexto: "Não foi possível atualizar a tela.",
        tentarDeNovo: () => void atualizarRef.current(),
      });
    } finally {
      setOcupado(false);
    }
  }, [ativo, ocupado, online]);

  useEffect(() => {
    atualizarRef.current = atualizar;
  }, [atualizar]);

  const valor = useMemo(
    () => ({ registrar, atualizar, ocupado, disponivel }),
    [registrar, atualizar, ocupado, disponivel],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Registra a atualização da visão. O wrapper lê sempre a versão mais recente
 * do manipulador, para não exigir dependências instáveis nos efeitos das telas.
 */
export function useAtualizacaoTela(id: string, atualizar: Atualizador): void {
  const contexto = useContext(Contexto);
  const registrar = contexto?.registrar;
  const referencia = useRef(atualizar);

  useEffect(() => {
    referencia.current = atualizar;
  });

  useEffect(() => {
    if (!registrar) return;
    registrar(id, () => referencia.current());
    return () => registrar(id, null);
  }, [id, registrar]);
}
