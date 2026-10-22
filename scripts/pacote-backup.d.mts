// Contrato do pacote portátil e da conferência de arquivos protegidos.
export interface ManifestoBackup {
  formato: "frequenciapp.arquivos";
  versao: 1;
  exportadoEm: string;
  arquivos: { arquivo: string; caminho: string; bytes: number; sha256: string }[];
}
export function sha256(bytes: Uint8Array): string;
export function criarPacote(
  pasta: string,
  senha: string,
  agora?: Date,
): Promise<{ bytes: Uint8Array; arquivos: number }>;
export function conferirPacote(bytes: Uint8Array, senha: string): Promise<ManifestoBackup>;
