// Agrupamentos em worker para manter os gestos e a navegação livres no celular.
import { agregarBi, type GraficoBi, type FiltrosBi } from "@/domain/bi-analise";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
const bases = new Map<RecursoBi, LinhaBi[]>();
self.onmessage = (
  evento: MessageEvent<{
    id: number;
    recurso: RecursoBi;
    linhas?: LinhaBi[];
    config?: GraficoBi;
    filtros?: FiltrosBi;
  }>,
) => {
  const { id, recurso, linhas, config, filtros } = evento.data;
  if (linhas) bases.set(recurso, linhas);
  if (config && filtros) {
    try {
      self.postMessage({ id, pontos: agregarBi(bases.get(recurso) ?? [], config, filtros) });
    } catch {
      self.postMessage({ id, erro: "Não foi possível calcular o gráfico." });
    }
  }
};
