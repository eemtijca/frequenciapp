// Tipos da prova privada emitida pelo executor de testes.
import type pg from "pg";
export interface ProvaIsolamento {
  versao: 1;
  rodada: string;
  rede: string;
  databaseUrl: string;
  appUrl: string;
  marcador: string;
}
export const PASTA_PROVA: string;
export function recusarIsolamento(): Error;
export function exigirIsolamento(ambiente?: NodeJS.ProcessEnv): ProvaIsolamento;
export function verificarIsolamento(): Promise<ProvaIsolamento>;
export function conferirBanco(cliente: pg.Client, prova: ProvaIsolamento): Promise<void>;
export function assinaturaMigracoes(): [string, string][];
export function assinarDesafio(prova: ProvaIsolamento, desafio: string): string;
