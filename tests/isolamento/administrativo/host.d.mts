// Declara o endpoint exclusivamente host do transporte administrativo.
import type {
  BarreiraEngine,
  ReceitaContainer,
  Supervisionar,
  ImagemAdministrativa,
  IdentidadePostgres,
} from "./engine-gate.mjs";
export function abrirNucleoPrivado(opcoes: {
  diretorio: string;
  rodada: string;
  receitas: Record<string, ReceitaContainer>;
  imagens: Record<string, ImagemAdministrativa>;
  requisitar: (metodo: string, caminho: string, corpo?: unknown) => Promise<unknown>;
  supervisionar?: Supervisionar;
}): Promise<{ gate: BarreiraEngine; fechar(): Promise<void> }>;
export function recuperarJournalPrivado(opcoes: { diretorio: string; rodada: string }): Promise<{
  rodada: string;
  registros: { estado: string; id: string | null; handle: string; [chave: string]: unknown }[];
  liberado: false;
}>;
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { executarSessao } from "./sessao.mjs";
export function executarRunnerStdio(opcoes: {
  iniciar: () => ChildProcessWithoutNullStreams;
  gate: BarreiraEngine;
  coletar: () => Promise<void>;
  timeoutMs?: number;
}): Promise<{
  codigo: number;
  sessao: Awaited<ReturnType<typeof executarSessao>>;
  cliente: { codigo: number | null; sinal: string | null; encerrado: boolean };
}>;
export function iniciarDockerReal(opcoes?: {
  diretorioBase: string;
  /** Seam host confiável para unidades: nenhum runner recebe este callback. */
  requisitar?: (metodo: string, caminho: string, corpo?: unknown) => Promise<unknown>;
  aoPreparar?: (diretorio: string) => void | Promise<void>;
}): Promise<{
  rodada: string;
  diretorio: string;
  codigo: number;
  identidade: IdentidadePostgres | null;
  limpeza: { removidos: string[]; preservados: string[]; falhas: string[] };
  erro: string | null;
}>;
export function criarClienteStdio(opcoes: {
  iniciar: () => ChildProcessWithoutNullStreams;
  prazoMs?: number;
}): (metodo: string, caminho: string, corpo?: unknown) => Promise<unknown>;
export function abrirEndpointPrivado(opcoes: {
  diretorio: string;
  gate: BarreiraEngine;
}): Promise<{ socketPath: string; fechar(): Promise<void> }>;
