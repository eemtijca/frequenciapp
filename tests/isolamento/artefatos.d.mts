// Tipos da exportação privada e da leitura segura de arquivos de resultados.
export const capturasReadme: readonly string[];
export function criarDestinoArtefatos(destino: string, checkout: string): string;
export function extrairArtefato(
  tar: Buffer,
  destino: string,
  origem: string,
  relativo: string,
): string[];
