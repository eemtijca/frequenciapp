// Declara o cliente nativo fechado e as receitas exclusivamente host.
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ReceitaContainer, ImagemAdministrativa, IdentidadePostgres } from "./engine-gate.mjs";
export const PIN_POSTGRES: string;
export type RequisitarEngine = (
  metodo: string,
  caminho: string,
  corpo?: unknown,
) => Promise<unknown>;
export function criarClienteEngine(opcoes: {
  iniciar: () => ChildProcessWithoutNullStreams;
  nome: string;
  prazoMs?: number;
}): RequisitarEngine;
export function aprovarImagemPostgres(raw: unknown): ImagemAdministrativa;
export function receitaPostgres(
  rodada: string,
  imagem: ImagemAdministrativa,
  senha: string,
): ReceitaContainer;
export function validarReceitaPostgres(
  spec: ReceitaContainer,
  rodada: string,
  imagem: ImagemAdministrativa,
): void;
export function normalizarPostgres(
  raw: unknown,
  spec: ReceitaContainer,
  imagem: ImagemAdministrativa,
  id: string,
): unknown;
export function comandoIdentidade(spec: ReceitaContainer): Record<string, unknown>;
export function consultarIdentidadePostgres(opcoes: {
  id: string;
  spec: ReceitaContainer;
  requisitar: RequisitarEngine;
  conferir: () => Promise<void>;
  autorizar: () => void;
  persistir: (id: string) => Promise<void>;
  signal?: AbortSignal;
}): Promise<IdentidadePostgres>;
