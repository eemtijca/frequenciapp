// Política da senha de exportação, independente da senha de acesso à conta.
export const MINIMO_SENHA_ZIP = 12;
export const MAXIMO_SENHA_ZIP = 128;

export function erroSenhaZip(senha: string, confirmacao = senha): string {
  const tamanho = Array.from(senha).length;
  if (tamanho < MINIMO_SENHA_ZIP || tamanho > MAXIMO_SENHA_ZIP || !senha.trim()) {
    return "Use uma senha entre 12 e 128 caracteres. Prefira uma frase longa e exclusiva.";
  }
  if (senha !== confirmacao) return "A confirmação não confere com a senha do ZIP.";
  return "";
}
