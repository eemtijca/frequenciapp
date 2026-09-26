// Teste de conexão com o Web App publicado no Apps Script.
import { testarConexao } from "@/application/planilha";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ ping: await testarConexao(sessao.usuario, await corpoJson(requisicao)) });
  });
}
