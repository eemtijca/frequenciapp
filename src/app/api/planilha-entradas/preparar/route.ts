// Planilha de entradas: preparar com guarda de acesso e resposta sem cache.
import { prepararAbaEntradas } from "@/application/planilha-entradas";
import { executarRota, exigirAdmin, json, erroApi, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await prepararAbaEntradas(sessao.usuario));
  });
}
