// Contrato da preferência local, também usado antes da hidratação.
export const CHAVE_ANIMACOES = "frequenciapp:animacoes-da-interface";
export const ATRIBUTO_ANIMACOES = "data-animacoes-interface";

export type ModoAnimacoes = "sistema" | "ativadas" | "desativadas";

export function normalizarAnimacoes(valor: string | null): ModoAnimacoes {
  return valor === "ativadas" || valor === "desativadas" ? valor : "sistema";
}

// Só valores conhecidos chegam ao DOM. O armazenamento pode estar bloqueado.
export const iniciarAnimacoes = `try {
  const modo = localStorage.getItem(${JSON.stringify(CHAVE_ANIMACOES)});
  if (modo === "ativadas" || modo === "desativadas") {
    document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_ANIMACOES)}, modo);
  }
} catch {}`;
