// Planilha de entradas: simular com guarda de acesso e resposta sem cache.
import { simularEntradas } from "@/application/planilha-entradas";
import {
  executarRota,
  exigirSessao,
  json,
  erroApi,
  origemPermitida,
  corpoJson,
} from "@/infra/http";

export const dynamic = "force-dynamic";
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await simularEntradas(sessao.usuario, await corpoJson(requisicao)));
  });
}
