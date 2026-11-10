// Contrato da automação do schema de preview usada pelo workflow e pelos testes.
export function nomeDoSchema(pr: number | string | undefined): string;
export function emailDaConta(pr: number | string): string;
export function schemasParaRemover(existentes: string[], abertos: number[]): string[];
export function prsAbertos(opcoes?: {
  repositorio?: string;
  token?: string;
  buscar?: typeof fetch;
}): Promise<number[]>;
export function faxina(opcoes?: {
  conectar?: () => Promise<{
    query: (sql: string) => Promise<{ rows: { nspname: string }[] }>;
    end: () => unknown;
  }>;
  lerPrs?: () => Promise<number[]>;
}): Promise<void>;
