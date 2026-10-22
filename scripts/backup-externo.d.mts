// Contrato da rotina externa e da porta de transporte independente de provedor.
export interface ConfiguracaoBackup {
  origem: string;
  destino: string;
  senha: string;
  configRclone: string;
}
export type TransporteBackup = (
  argumentos: string[],
  aoLer?: (bytes: Uint8Array) => void,
) => Promise<void>;
export function configuracaoBackup(
  variaveis?: Record<string, string | undefined>,
): ConfiguracaoBackup;
export function executarBackup(
  configuracao: ConfiguracaoBackup,
  executar?: TransporteBackup,
): Promise<{
  versao: 1;
  arquivo: string;
  exportadoEm: string;
  sha256: string;
  bytes: number;
  arquivos: number;
}>;
