// Avisos padrão da interface: tom único, mensagem clara e ação de repetir.
import { toast } from "sonner";
import { ErroApi } from "@/lib/api-cliente";

export function mensagemAmigavel(excecao: unknown, alternativa: string): string {
  return excecao instanceof ErroApi ? excecao.message : alternativa;
}

export function avisarSucesso(titulo: string, descricao?: string, id?: string): void {
  toast.success(titulo, { description: descricao, duration: 5000, id });
}

export function avisarInfo(titulo: string, descricao?: string, id?: string): void {
  toast.info(titulo, { description: descricao, duration: 6000, id });
}

export function avisarErro(
  excecao: unknown,
  opcoes: { contexto: string; descricao?: string; tentarDeNovo?: () => void; id?: string },
): void {
  // A sessão expirada tem fluxo próprio: o shell volta para a entrada com aviso.
  if (excecao instanceof ErroApi && excecao.status === 401) return;
  toast.error(mensagemAmigavel(excecao, opcoes.contexto), {
    description: opcoes.descricao ?? "Confira a internet e tente de novo em instantes.",
    duration: 8000,
    id: opcoes.id,
    action: opcoes.tentarDeNovo
      ? { label: "Tentar de novo", onClick: opcoes.tentarDeNovo }
      : undefined,
  });
}
