// Contratos dos estágios e da identidade da implantação.
export type AtestadoImplantacao = {
  sha: string;
  destino: string;
  backupVerificado: boolean;
  recuperacaoVerificada: boolean;
  migracoesExpansivas: boolean;
  autoDeployCoordenado: boolean;
};
export function selecionarEvento(opcoes: { evento: string; ref: string }): "tag";
export function orquestrar(opcoes: {
  sha: string;
  destino: string;
  atestado: unknown;
  executar: (etapa: string, sha: string) => Promise<unknown>;
}): Promise<void>;
export function executorVercel(
  ambiente: Record<string, string | undefined>,
  dependencias?: { comando?: (...args: unknown[]) => string; buscar?: typeof fetch },
): (etapa: string) => Promise<void>;
