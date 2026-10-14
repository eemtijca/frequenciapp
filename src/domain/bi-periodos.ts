// Períodos rápidos calculados pelo dia civil da escola, sem depender do fuso do dispositivo.
import { diaDaSemanaIso, diaLocal, diaSeguinte } from "./frequencia";

export const PERIODOS_RAPIDOS_BI = ["hoje", "semana", "mes", "ano"] as const;
export type PeriodoRapidoBi = (typeof PERIODOS_RAPIDOS_BI)[number];

export function periodoRapidoBi(periodo: PeriodoRapidoBi, agora: Date, fuso: string) {
  const hoje = diaLocal(agora, fuso);
  if (periodo === "hoje") return { inicio: hoje, fim: hoje };
  if (periodo === "semana") {
    const inicio = diaSeguinte(hoje, 1 - diaDaSemanaIso(hoje));
    return { inicio, fim: diaSeguinte(inicio, 6) };
  }
  const ano = hoje.slice(0, 4);
  if (periodo === "ano") return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  const fim = new Date(Date.UTC(Number(ano), Number(hoje.slice(5, 7)), 0));
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: fim.toISOString().slice(0, 10) };
}
