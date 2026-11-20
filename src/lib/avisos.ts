"use client";

// Avisos padrão da interface: tom único, mensagem clara e ação de repetir.
import { publicarAviso } from "@/components/ui/mui/avisos";
import { ErroApi } from "@/lib/api-cliente";

export function mensagemAmigavel(excecao: unknown, alternativa: string): string {
  return excecao instanceof ErroApi ? excecao.message : alternativa;
}

export function avisarSucesso(titulo: string, descricao?: string, id?: string): void {
  publicarAviso({ severidade: "success", titulo, descricao, id });
}

export function avisarInfo(titulo: string, descricao?: string, id?: string): void {
  publicarAviso({ severidade: "info", titulo, descricao, id });
}

export function avisarErro(
  excecao: unknown,
  opcoes: { contexto: string; descricao?: string; tentarDeNovo?: () => void; id?: string },
): void {
  // A sessão expirada tem fluxo próprio: o shell volta para a entrada com aviso.
  if (excecao instanceof ErroApi && excecao.status === 401) return;
  const descricaoDaFalha =
    excecao instanceof ErroApi
      ? excecao.status === 0 || excecao.status >= 500
        ? "Tente de novo em instantes."
        : undefined
      : "Confira a internet e tente de novo em instantes.";
  publicarAviso({
    severidade: "error",
    titulo: mensagemAmigavel(excecao, opcoes.contexto),
    descricao: opcoes.descricao ?? descricaoDaFalha,
    tentarDeNovo: opcoes.tentarDeNovo,
    id: opcoes.id,
  });
}
