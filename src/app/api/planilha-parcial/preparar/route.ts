// Chamada parcial: preparar com guarda de acesso, origem e resposta sem cache.
import { prepararAbaParcial } from "@/application/planilha-parcial";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await prepararAbaParcial(sessao.usuario, await corpoJson(requisicao)));
  });
}
