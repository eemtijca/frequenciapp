// Preparo administrativo de uma aba de frequência por turma de origem e mês.
import { prepararMesDaFrequencia } from "@/application/planilha-mensal";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await prepararMesDaFrequencia(sessao.usuario, await corpoJson(requisicao)));
  });
}
