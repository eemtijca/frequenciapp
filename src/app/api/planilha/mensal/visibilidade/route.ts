// Consulta os meses e libera o histórico da frequência com autorização administrativa.
import { mostrarMesDaFrequencia, listarMesesDaFrequencia } from "@/application/planilha-mensal";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await listarMesesDaFrequencia());
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await mostrarMesDaFrequencia(sessao.usuario, await corpoJson(requisicao)));
  });
}
