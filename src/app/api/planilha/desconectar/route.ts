// Desliga a integração e apaga token e esquema, preservando a planilha.
import { desconectarIntegracao } from "@/application/planilha";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await desconectarIntegracao(sessao.usuario));
  });
}
