// Contrato do schema PostgreSQL compartilhado pelo runtime e pelos scripts.
export function schemaDaConexao(url: string): string;
export function resolverSchema(opcoes: { url: string; schemaExplicito?: string | null }): string;
export function identificadorPostgres(nome: string): string;
export function selecionarSchema(
  cliente: {
    query(sql: string, parametros: string[]): Promise<{ rows: { uso?: boolean }[] }>;
  },
  url: string,
  schemaExplicito?: string | null,
): Promise<void>;
