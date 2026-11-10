// Identidade validada compartilhada entre publicação e implantação.
export type IdentidadePublicacao = { versao: string; tag: string; sha: string; latest: boolean };
export function validarPublicacao(opcoes: {
  repositorio?: string;
  versao: string;
  ref: string;
  sha: string;
  releases?: Array<{ tag_name: string; draft?: boolean; prerelease?: boolean }> | null;
}): IdentidadePublicacao;
export function calcularLatest(opcoes: {
  versao: string;
  releases?: Array<{ tag_name: string; draft?: boolean; prerelease?: boolean }> | null;
}): boolean;
