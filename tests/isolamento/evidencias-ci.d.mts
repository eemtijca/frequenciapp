// Declara o contrato fechado dos resultados mínimos e do consumidor de CI.
export type EtapaCI = "distribuicao" | "api" | "e2e" | "pwa";
export interface ContagensCI {
  total: number;
  aprovados: number;
  falhos: number;
  ignorados: number;
  interrompidos: number;
  instaveis: number;
}
export interface ResumoEtapaCI {
  etapa: EtapaCI;
  exit: number | null;
  contagens: ContagensCI | null;
  integridade: "completa" | "incompleta";
}
export interface ResumoCI {
  integridade: "completa" | "incompleta";
  etapas: ResumoEtapaCI[];
}
export const etapasCI: readonly EtapaCI[];
export function resumirEtapa(etapa: EtapaCI, registro: unknown, relatorio: unknown): ResumoEtapaCI;
export function prepararEvidencias(raiz: string): void;
export function coletarEvidencias(raiz: string): { resumo: ResumoCI; exit: number };
export function executarEtapa(raiz: string, etapa: EtapaCI, comando: string[]): number;
export function executarCli(argv?: string[]): number;
