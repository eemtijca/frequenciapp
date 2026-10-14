"use client";

// Worker exclusivo do BI: cada base é transferida uma vez e o agrupamento fica fora da interface.
import { useCallback, useEffect, useRef } from "react";
import { agregarBi, type GraficoBi, type PontoBi } from "@/domain/bi-analise";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
import type { RecorteBi } from "@/domain/bi-recortes";
export function useCalculosBi(recortes: Partial<Record<RecursoBi, RecorteBi>>, identidade: string) {
  const worker = useRef<Worker | null>(null);
  const bases = useRef(new Map<RecursoBi, LinhaBi[]>());
  const contador = useRef(0);
  const pedidos = useRef(
    new Map<number, { resolve: (p: PontoBi[]) => void; reject: (e: Error) => void }>(),
  );
  useEffect(() => {
    bases.current.clear();
    if (!identidade) return;
    try {
      const w = new Worker(new URL("./bi-worker.ts", import.meta.url), { type: "module" });
      worker.current = w;
      w.onmessage = (e: MessageEvent<{ id: number; pontos?: PontoBi[]; erro?: string }>) => {
        const p = pedidos.current.get(e.data.id);
        if (p) {
          pedidos.current.delete(e.data.id);
          if (e.data.erro) p.reject(new Error(e.data.erro));
          else p.resolve(e.data.pontos ?? []);
        }
      };
      w.onerror = () => {
        w.terminate();
        worker.current = null;
        bases.current.clear();
        for (const p of pedidos.current.values())
          p.reject(new Error("O cálculo em segundo plano foi interrompido. Atualize o gráfico."));
        pedidos.current.clear();
      };
    } catch {
      worker.current = null;
    }
    const pendentes = pedidos.current;
    return () => {
      worker.current?.terminate();
      worker.current = null;
      for (const p of pendentes.values()) p.reject(new Error("Consulta interrompida."));
      pendentes.clear();
    };
  }, [identidade]);
  return useCallback(
    async (config: GraficoBi) => {
      const recorte = recortes[config.recurso];
      if (!recorte) throw new Error("Esta base não está disponível neste recorte.");
      if (!recorte.disponivel) throw new Error(recorte.motivo);
      const { linhas, filtros: filtrosCalculo } = recorte;
      if (!worker.current) return agregarBi(linhas, config, filtrosCalculo);
      if (bases.current.get(config.recurso) !== linhas) {
        worker.current.postMessage({ recurso: config.recurso, linhas, id: 0 });
        bases.current.set(config.recurso, linhas);
      }
      const id = ++contador.current;
      return new Promise<PontoBi[]>((resolve, reject) => {
        pedidos.current.set(id, { resolve, reject });
        worker.current?.postMessage({
          id,
          recurso: config.recurso,
          config,
          filtros: filtrosCalculo,
        });
      });
    },
    [recortes],
  );
}
