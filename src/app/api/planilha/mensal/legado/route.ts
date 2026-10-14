// Confere e move frequências antigas para os meses antes de retirar a aba sem mês.
import { organizarAbaAntiga } from "@/application/planilha-mensal";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await organizarAbaAntiga(sessao.usuario, await corpoJson(requisicao)));
  });
}
