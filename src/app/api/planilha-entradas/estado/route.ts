// Planilha de entradas: estado com guarda de acesso e resposta sem cache.
import { estadoPlanilhaEntradas } from "@/application/planilha-entradas";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await estadoPlanilhaEntradas());
  });
}
