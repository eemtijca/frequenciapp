// Equipe ativa que pode liberar saídas antecipadas.
import { listarResponsaveis } from "@/application/usuarios";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ responsaveis: await listarResponsaveis() });
  });
}
