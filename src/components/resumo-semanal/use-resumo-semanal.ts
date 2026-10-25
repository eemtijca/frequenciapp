"use client";

// Carga e atualização silenciosa do resumo semanal, compartilhada pelas telas.
import { useCallback, useEffect, useRef, useState } from "react";
import { useContextoAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { horaNoFuso } from "@/domain/frequencia";

export interface CargaResumo<T> {
  dados: T;
  assinatura: string;
}

interface Opcoes<T> {
  periodo: string;
  versao: number;
  ativo: boolean;
  pausado?: boolean;
  viewId: string;
  fuso: string;
  carregar: (sinal: AbortSignal) => Promise<CargaResumo<T>>;
}

interface Resultado<T> {
  dados: T | null;
  atualizadoEm: string | null;
  anuncio: string;
  erro: string;
  carregando: boolean;
  tentarNovamente: () => void;
}

const INTERVALO_MS = 120_000;

export function useResumoSemanal<T>({
  periodo,
  versao,
  ativo,
  pausado = false,
  viewId,
  fuso,
  carregar,
}: Opcoes<T>): Resultado<T> {
  const contexto = useContextoAtualizacao();
  const marcarAtualizado = contexto?.marcarAtualizado;
  const [carga, setCarga] = useState<(CargaResumo<T> & { periodo: string }) | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [erro, setErro] = useState("");
  const [tick, setTick] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const [periodoAtual, setPeriodoAtual] = useState(periodo);
  const carregarRef = useRef(carregar);
  const assinaturaRef = useRef<string | null>(null);
  const assinaturaPeriodoRef = useRef<string | null>(null);

  useEffect(() => {
    carregarRef.current = carregar;
  }, [carregar]);

  if (periodoAtual !== periodo) {
    setPeriodoAtual(periodo);
    setAnuncio("");
    setErro("");
  }

  useEffect(() => {
    if (assinaturaPeriodoRef.current !== periodo) {
      assinaturaPeriodoRef.current = periodo;
      assinaturaRef.current = null;
    }
    let viva = true;
    // Uma consulta por vez: o ciclo seguinte só começa depois do anterior e
    // a troca de semana cancela o pedido em andamento.
    const controlador = new AbortController();
    void (async () => {
      try {
        const resultado = await carregarRef.current(controlador.signal);
        if (!viva) return;
        const primeiraCarga = assinaturaRef.current === null;
        const mudou = assinaturaRef.current !== resultado.assinatura;
        setCarga({ ...resultado, periodo });
        assinaturaRef.current = resultado.assinatura;
        setAtualizadoEm(new Date().toISOString());
        setErro("");
        marcarAtualizado?.(viewId);
        if (mudou && !primeiraCarga) {
          const hora = horaNoFuso(new Date().toISOString(), fuso);
          setAnuncio(hora ? `Resumo atualizado às ${hora}.` : "Resumo atualizado.");
        }
      } catch (excecao) {
        if (!viva) return;
        setErro(
          excecao instanceof Error && excecao.message
            ? excecao.message
            : "Não foi possível carregar o resumo da semana.",
        );
      }
    })();
    return () => {
      viva = false;
      controlador.abort();
    };
    // A carga roda por período, versão externa, ciclo interno ou tentativa.
    // A função fica numa referência para não reiniciar a cada render.
  }, [periodo, versao, tick, tentativa, viewId, marcarAtualizado, fuso]);

  useEffect(() => {
    if (!ativo || pausado) return;
    const intervalo = window.setInterval(quandoVisivel, INTERVALO_MS);
    document.addEventListener("visibilitychange", quandoVisivel);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", quandoVisivel);
    };

    function quandoVisivel() {
      if (document.visibilityState === "visible" && navigator.onLine) setTick((valor) => valor + 1);
    }
  }, [ativo, pausado]);

  const tentarNovamente = useCallback(() => setTentativa((valor) => valor + 1), []);
  return {
    dados: carga?.periodo === periodo ? carga.dados : null,
    atualizadoEm,
    anuncio,
    erro,
    carregando: !carga || carga.periodo !== periodo,
    tentarNovamente,
  };
}
