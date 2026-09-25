// Domínio dos usuários e do acesso. Regras puras sobre senhas, papéis
// e nomes de exibição: testáveis de forma isolada.

/** Papel do usuário na aplicação. */
export type Papel = "ADMIN" | "PROFESSOR";

/** Usuário visível pela interface. Sem segredos. */
export interface UsuarioDTO {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
}

/** UsuarioDTO com as turmas atribuídas (ids). */
export interface UsuarioComTurmas extends UsuarioDTO {
  turmas: string[];
}

/** Identidade da sessão corrente. */
export type Identidade = UsuarioDTO;

/**
 * Regra de senha forte o suficiente e simples de explicar: no mínimo 8
 * caracteres, com ao menos uma letra e um número. Retorna a mensagem do
 * problema ou null quando a senha serve.
 */
export function problemaDeSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha deve ter ao menos 8 caracteres.";
  if (senha.length > 200) return "A senha deve ter no máximo 200 caracteres.";
  if (!/[a-zA-ZÀ-ÿ]/.test(senha)) return "A senha deve conter ao menos uma letra.";
  if (!/[0-9]/.test(senha)) return "A senha deve conter ao menos um número.";
  return null;
}

/** Primeiro nome de tratamento, para saudações curtas. */
export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] ?? nomeCompleto;
}

/** Rótulo amigável do papel. */
export function rotuloDePapel(papel: Papel): string {
  return papel === "ADMIN" ? "Administrador" : "Professor(a)";
}
