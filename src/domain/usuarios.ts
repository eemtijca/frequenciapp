// Domínio dos usuários e do acesso. Regras puras sobre senhas, papéis
// e nomes de exibição: testáveis de forma isolada.

/** Papel do usuário na aplicação. */
export type Papel = "ADMIN" | "COORDENACAO" | "DIRETOR_TURMA";

/** Papéis da equipe escolar, criados na aba Equipe; o diretor tem cadastro próprio. */
export const PAPEIS_DA_EQUIPE = ["ADMIN", "COORDENACAO"] as const;
export type PapelDaEquipe = (typeof PAPEIS_DA_EQUIPE)[number];

/** Verdadeiro para os papéis da equipe escolar. */
export function ehPapelDaEquipe(papel: Papel): papel is PapelDaEquipe {
  return (PAPEIS_DA_EQUIPE as readonly Papel[]).includes(papel);
}

/**
 * O que um papel permite fazer. As guardas consultam a capacidade, nunca o
 * papel: um papel novo só ganha acesso ao que for listado para ele aqui.
 */
export type Capacidade =
  "operar" | "administrar" | "alterarPropriaSenha" | "verEstatisticasDasTurmas";

/**
 * Matriz de acesso. É política de segurança, revisada em pull request, e por
 * isso fica no código, e não no banco. O Record obriga todo papel a declarar
 * as capacidades: esquecer um papel novo quebra a compilação.
 */
const CAPACIDADES_POR_PAPEL: Record<Papel, readonly Capacidade[]> = {
  ADMIN: ["operar", "administrar", "alterarPropriaSenha"],
  COORDENACAO: ["operar", "alterarPropriaSenha"],
  DIRETOR_TURMA: ["verEstatisticasDasTurmas", "alterarPropriaSenha"],
};

/** Verdadeiro quando o papel concede a capacidade; o restante é recusado. */
export function temCapacidade(papel: Papel, capacidade: Capacidade): boolean {
  return CAPACIDADES_POR_PAPEL[papel]?.includes(capacidade) ?? false;
}

/** Usuário visível pela interface. Sem segredos. */
export interface UsuarioDTO {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
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

const ROTULOS_DE_PAPEL: Record<Papel, string> = {
  ADMIN: "Administração",
  COORDENACAO: "Coordenação",
  DIRETOR_TURMA: "Diretor de turma",
};

export function rotuloDePapel(papel: Papel): string {
  return ROTULOS_DE_PAPEL[papel];
}
