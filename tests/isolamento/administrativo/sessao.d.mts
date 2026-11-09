// Declara a sessão local sem autoridade implícita sobre Docker ou caminhos host.
import type { Readable, Writable } from "node:stream";
import type { BarreiraEngine } from "./engine-gate.mjs";
export type PedidoAdministrativo =
  | { operacao: "consultarConfiguracao" }
  | { operacao: "consultarServico"; servico: string }
  | {
      operacao: "executar";
      servico: string;
      variante: "consultarIdentidade" | "dump" | "restaurar";
    }
  | { operacao: "coletar" };
export function executarSessao(opcoes: {
  origem: Readable;
  destino: Writable;
  gate: BarreiraEngine;
  coletar: () => Promise<void>;
  signal?: AbortSignal;
  /** Prazo host local até a escrita final, de 1 a 60.000 ms. Não recebido pelo wire. */
  timeoutMs?: number;
}): Promise<{
  codigo: number;
  erro: unknown;
  /** Completo e estável no retorno: esperas abandonadas após 100 ms do abort, sem inferir término de grupo. */
  saidasPendentes: { requestId: number; stream: "stdout" | "stderr"; etapa: "next" | "return" }[];
  limpeza: { removidos: string[]; preservados: string[]; falhas: string[] };
}>;
