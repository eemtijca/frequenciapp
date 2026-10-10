// Gravação dos feriados do ano a partir da base externa, com origem confiável.
import { sincronizarFeriados } from "@/application/sincronizar-feriados";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await sincronizarFeriados(sessao.usuario, await corpoJson(requisicao)));
  });
}
