// Desliga a integração de saídas e apaga token e esquema, preservando a planilha.
import { desconectarSaidas } from "@/application/planilha-saidas";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await desconectarSaidas(sessao.usuario));
  });
}
