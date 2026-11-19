// Tipos públicos do gerador do registro estático de rotas de métricas.
export interface RotaGerada {
  readonly rotulo: string;
  readonly padrao: string;
  readonly segmentos: number;
  readonly estatica: boolean;
}

export function listarRotas(opcoes?: { diretorioApi?: string }): Promise<RotaGerada[]>;

export function gerarConteudo(opcoes?: { diretorioApi?: string }): Promise<string>;

export function gerarArquivo(opcoes?: {
  destino?: string;
  diretorioApi?: string;
}): Promise<{ destino: string; total: number }>;

export function verificarArquivo(opcoes?: {
  destino?: string;
  diretorioApi?: string;
}): Promise<{ atualizado: boolean; total: number; motivo: string }>;
