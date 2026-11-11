// Contratos dos estágios e da identidade da implantação.
export function prepararAmbienteDeBuild(diretorio?: string): void;
export function selecionarEvento(opcoes: { evento: string; ref: string }): "main" | "tag";
export function orquestrar(opcoes: {
  sha: string;
  destino: string;
  executar: (etapa: string, sha: string) => Promise<unknown>;
}): Promise<void>;
export function executorVercel(
  ambiente: Record<string, string | undefined>,
  dependencias?: { comando?: (...args: unknown[]) => string; buscar?: typeof fetch },
): (etapa: string) => Promise<void>;
